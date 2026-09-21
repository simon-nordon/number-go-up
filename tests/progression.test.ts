import { test } from "node:test";
import assert from "node:assert/strict";
import { freshBalance, SPAWN_SKILLS, validateBalance } from "../src/config.ts";
import {
  enterCamp,
  enterLake,
  getStats,
  newGame,
  parseSave,
  purchaseSkill,
  reconcileBalance,
  skillCost,
  spawnCapReached,
  spawnTrip,
  tickFishing,
} from "../src/model.ts";

test("stamina purchases add exactly one next-trip point and survive reloads", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  state.stamina = 0;
  state.money = 20;
  enterCamp(state);
  for (let i = 0; i < 2; i++)
    assert.equal(purchaseSkill(state, "stamina", balance), true);
  assert.equal(getStats(state, balance).stamina, 12);
  assert.equal(state.money, 0);
  assert.equal(state.stamina, 0);
  assert.equal(state.maxStamina, 10);
  const restored = parseSave(JSON.stringify(state), balance)!;
  assert.deepEqual(restored, state);
  enterLake(restored, balance);
  assert.equal(restored.maxStamina, 12);
  assert.equal(restored.stamina, 12);
});

test("separate fish investments add five percentage points and share an 80% cap", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  enterCamp(state);
  state.money = 1e8;
  state.levels.population = 3;
  assert.deepEqual(getStats(state, balance).spawnRates, [100, 0, 0, 0]);
  assert.equal(purchaseSkill(state, "koi", balance), false);
  assert.equal(purchaseSkill(state, "perch", balance), true);
  assert.deepEqual(getStats(state, balance).spawnRates, [95, 5, 0, 0]);
  assert.equal(purchaseSkill(state, "trout", balance), false);
  assert.equal(purchaseSkill(state, "koi", balance), true);
  assert.equal(purchaseSkill(state, "trout", balance), true);
  for (let i = 0; i < 13; i++)
    assert.equal(purchaseSkill(state, SPAWN_SKILLS[i % 3], balance), true);
  assert.deepEqual(getStats(state, balance).spawnRates, [20, 30, 25, 25]);
  const before = structuredClone(state);
  for (const id of SPAWN_SKILLS) {
    assert.equal(spawnCapReached(id, state, balance), true);
    assert.equal(purchaseSkill(state, id, balance), false);
  }
  assert.deepEqual(
    state,
    before,
    "a capped purchase never charges or changes levels",
  );
  assert.equal(
    purchaseSkill(state, "stamina", balance),
    true,
    "other branches remain purchasable",
  );
});

test("spawn rolls use exact percentages without a guaranteed advanced fish", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  balance.base.population = 1;
  Object.assign(state.levels, { perch: 6, koi: 5, trout: 5 });
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 100; i++) {
    spawnTrip(state, balance, () => (i + 0.5) / 100);
    counts[state.fish[0].species]++;
  }
  assert.deepEqual(counts, [20, 30, 25, 25]);
  Object.assign(state.levels, { perch: 0, koi: 0, trout: 0 });
  spawnTrip(state, balance, () => 0.999999);
  assert.equal(state.fish[0].species, 0);
});

test("the last-fish replacement uses invested spawn chances without refilling stamina", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  state.levels.perch = 1;
  state.fish.forEach((f) =>
    Object.assign(f, { x: 700, y: 300, phase: 0, hp: 1 }),
  );
  tickFishing(state, balance, 2, { x: 700, y: 300 }, () => 0.99);
  assert.equal(state.money, 10);
  assert.equal(state.stamina, 9);
  assert.equal(state.trip, 1);
  assert.ok(state.fish.every((f) => f.species === 1 && f.hp === 8));
});

test("tuning spawn effects cannot exceed the shared cap, including partial remaining capacity", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  enterCamp(state);
  state.money = 1e8;
  state.levels.population = 3;
  Object.assign(state.levels, { perch: 10, koi: 3, trout: 3 });
  balance.skills.perch.amount = 7;
  reconcileBalance(state, validateBalance(balance));
  assert.deepEqual(getStats(state, balance).spawnRates, [20, 70, 10, 0]);
  assert.deepEqual(
    [state.levels.perch, state.levels.koi, state.levels.trout],
    [10, 2, 0],
  );
  state.levels.perch = 11;
  state.levels.koi = 0;
  assert.equal(spawnCapReached("perch", state, balance), true);
  assert.equal(spawnCapReached("koi", state, balance), true);
  assert.equal(purchaseSkill(state, "koi", balance), false);
  assert.deepEqual(getStats(state, balance).spawnRates, [23, 77, 0, 0]);
});

test("old fish unlocks become separate first-level chances without losing an active trip", () => {
  const balance = freshBalance();
  for (let species = 0; species <= 3; species++) {
    const state = newGame(balance, () => 0.5);
    state.money = 47;
    state.stamina = 4;
    state.castTick = 350;
    state.fish[0].hp = 2;
    const old = {
      ...state,
      version: 3,
      rod: false,
      levels: { population: 3, damage: 2, speed: 1, radius: 1, species },
    };
    const restored = parseSave(JSON.stringify(old), balance)!;
    assert.ok(restored);
    assert.equal(restored.version, 5);
    assert.equal(restored.money, 47);
    assert.equal(restored.stamina, 4);
    assert.equal(restored.castTick, 350);
    assert.deepEqual(restored.fish, state.fish);
    assert.deepEqual(restored.levels, {
      population: 3,
      damage: 2,
      speed: 1,
      radius: 1,
      stamina: 0,
      perch: species >= 1 ? 1 : 0,
      koi: species >= 2 ? 1 : 0,
      trout: species >= 3 ? 1 : 0,
    });
    assert.deepEqual(parseSave(JSON.stringify(restored), balance), restored);
  }
});

test("all existing upgrade prices are exactly ten times the previous rounded prices", () => {
  const balance = freshBalance();
  const originals = { population: 1, damage: 4, speed: 5, radius: 6 };
  for (const id of ["population", "damage", "speed", "radius"] as const) {
    const skill = balance.skills[id];
    for (let level = 0; level < skill.max; level++) {
      const oldCost = Math.ceil(
        originals[id] *
          skill.growth **
            Math.max(0, level - Math.max(0, skill.flatLevels - 1)),
      );
      assert.equal(skillCost(id, level, balance), oldCost * 10);
    }
  }
  assert.deepEqual(
    SPAWN_SKILLS.map((id) => skillCost(id, 0, balance)),
    [120, 360, 1080],
  );
  assert.equal(balance.rods[4].cost, 10000);
  assert.deepEqual(
    balance.species.map((f) => f.value),
    [10, 30, 90, 200],
  );
});

test("legacy balance exports migrate currency once and preserve custom settings", () => {
  const balance = freshBalance();
  const old = {
    ...balance,
    skills: {
      population: { ...balance.skills.population, cost: 1 },
      damage: { ...balance.skills.damage, cost: 4 },
      speed: { ...balance.skills.speed, cost: 5 },
      radius: { ...balance.skills.radius, cost: 6 },
      species: { cost: 24, growth: 2, flatLevels: 0, amount: 1, max: 3 },
    },
    species: balance.species.map((fish) => ({
      ...fish,
      value: fish.value / 10,
      weight: 65,
    })),
    rods: undefined,
    rod: { cost: 1000, multiplier: 5 },
  };
  const migrated = validateBalance(old);
  assert.deepEqual(migrated.base, balance.base);
  assert.deepEqual(migrated.species, balance.species);
  assert.deepEqual(migrated.rods, balance.rods);
  assert.deepEqual(
    SPAWN_SKILLS.map((id) => migrated.skills[id].cost),
    [240, 480, 960],
  );
  assert.equal(migrated.skills.population.cost, 10);
  assert.deepEqual(validateBalance(migrated), migrated);
});
