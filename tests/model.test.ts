import { test } from "node:test";
import assert from "node:assert/strict";
import { freshBalance, validateBalance } from "../src/config.ts";
import type { Balance } from "../src/config.ts";
import { CAMP_START, LAKE_START, STATIONS } from "../src/layout.ts";
import {
  enterCamp,
  enterLake,
  fishPosition,
  insideCast,
  getStats,
  newGame,
  parseSave,
  purchaseRod,
  purchaseSkill,
  reconcileBalance,
  skillCost,
  spawnTrip,
  tickFishing,
} from "../src/model.ts";

// Most combat cases need a full pond; production starts with one arrival.
function stockedGame(balance: Balance, random = Math.random) {
  const state = newGame(balance, random);
  spawnTrip(state, balance, random);
  return state;
}

test("portrait cast targeting matches the corrected circular overlay", () => {
  const pointer = { x: 500, y: 300 };
  assert.equal(insideCast({ x: 500, y: 340 }, pointer, 50), true);
  assert.equal(insideCast({ x: 500, y: 340 }, pointer, 50, 0.5), false);
  assert.equal(insideCast({ x: 520, y: 310 }, pointer, 50, 0.5), true);
});

test("a stocked pond stops at 10 stamina before all 12 health is caught", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  assert.equal(getStats(state, balance).tickMs, 2000);
  assert.equal(state.stamina, 10);
  assert.equal(state.maxStamina, 10);
  assert.equal(
    state.fish.reduce((sum, f) => sum + f.hp, 0),
    12,
  );
  const firstFish = [...state.fish];
  for (const fish of firstFish)
    tickFishing(state, balance, 8, fishPosition(fish, 0));
  assert.equal(state.stamina, 0);
  assert.equal(state.money, 20);
  assert.equal(state.caught, 2);
  assert.equal(state.fish.length, 1);
  assert.equal(state.fish[0].hp, 2);
  assert.deepEqual(
    tickFishing(state, balance, 100, fishPosition(state.fish[0], 0)),
    [],
  );
  assert.equal(
    state.fish[0].hp,
    2,
    "exhausted casts cannot damage the last fish",
  );
  assert.equal(
    purchaseSkill(state, "population", balance),
    false,
    "must be at camp",
  );
  enterCamp(state);
  for (let i = 0; i < 2; i++) {
    assert.equal(skillCost("population", i, balance), 10);
    assert.equal(purchaseSkill(state, "population", balance), true);
  }
  enterLake(state, balance, () => 0.5);
  assert.equal(state.fish.length, 1);
  assert.equal(state.trip, 2);
  assert.equal(state.tripCaught, 0);
  assert.equal(state.stamina, 10);
  assert.equal(state.castTick, 0);
});

test("damage waits two seconds and idle, missed and off-dock casts cost no stamina", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  const fish = state.fish[0],
    pointer = fishPosition(fish, 0);
  tickFishing(state, balance, 1.99, pointer);
  assert.equal(fish.hp, 4);
  assert.equal(state.stamina, 10);
  tickFishing(state, balance, 0.01, pointer);
  assert.equal(fish.hp, 3);
  assert.equal(state.stamina, 9);
  tickFishing(state, balance, 1, pointer);
  tickFishing(state, balance, 30, null);
  assert.equal(state.castTick, 0);
  tickFishing(state, balance, 1, pointer);
  assert.equal(fish.hp, 3, "leaving the fish resets the shared cast timer");
  tickFishing(state, balance, 30, { x: 0, y: 0 });
  enterCamp(state);
  tickFishing(state, balance, 30, pointer);
  state.inCamp = false;
  state.player.y = 650;
  tickFishing(state, balance, 30, pointer);
  assert.equal(fish.hp, 3);
  assert.equal(state.stamina, 9);
});

test("one shared tick damages every fish for one stamina, including newly entered targets", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  const [first, second] = state.fish;
  Object.assign(first, { x: 700, y: 300, phase: 0 });
  Object.assign(second, { x: 900, y: 300, phase: 0 });
  tickFishing(state, balance, 1.9, { x: 700, y: 300 });
  second.x = 700;
  const events = tickFishing(state, balance, 0.1, { x: 700, y: 300 });
  assert.equal(events.filter((e) => e.type === "hit").length, 2);
  assert.equal(first.hp, 3);
  assert.equal(second.hp, 3);
  assert.equal(state.stamina, 9);
  first.x = 900;
  tickFishing(state, balance, 2, { x: 700, y: 300 });
  assert.equal(first.hp, 3);
  assert.equal(second.hp, 2);
  assert.equal(state.stamina, 8);
});

test("clearing the pond pays each catch once and spawns just one replacement", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  state.fish.forEach((f) => Object.assign(f, { x: 700, y: 300, phase: 0 }));
  const oldIds = state.fish.map((f) => f.id);
  const events = tickFishing(state, balance, 8, { x: 700, y: 300 }, () => 0.5);
  assert.equal(events.filter((e) => e.type === "hit").length, 12);
  assert.equal(events.filter((e) => e.type === "catch").length, 3);
  assert.equal(
    state.stamina,
    6,
    "twelve hits across four shared ticks cost four stamina",
  );
  assert.equal(state.money, 30);
  assert.deepEqual(state.collection, [3, 0, 0, 0]);
  assert.equal(state.trip, 1);
  assert.equal(state.tripCaught, 3);
  assert.equal(state.tripTotal, 4);
  assert.equal(state.fish.length, 1);
  assert.ok(state.fish.every((f) => f.hp === 4 && !oldIds.includes(f.id)));
  tickFishing(state, balance, 100, { x: 0, y: 0 });
  assert.equal(state.money, 30);
  assert.equal(
    state.stamina,
    6,
    "an empty cast after the refill spends nothing",
  );
  assert.deepEqual(parseSave(JSON.stringify(state), balance), state);
});

test("large time steps cannot overspend stamina or skip damage on the final shared tick", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  state.fish.forEach((f) =>
    Object.assign(f, { x: 700, y: 300, phase: 0, hp: 100, maxHp: 100 }),
  );
  const events = tickFishing(state, balance, 1000, { x: 700, y: 300 });
  assert.equal(state.stamina, 0);
  assert.equal(state.castTick, 0);
  assert.equal(events.length, 30);
  assert.ok(state.fish.every((f) => f.hp === 90));
  assert.deepEqual(tickFishing(state, balance, 1000, { x: 700, y: 300 }), []);
});

test("a final stamina tick still leaves one fish without restoring stamina", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  state.stamina = 1;
  state.fish.forEach((f) =>
    Object.assign(f, { x: 700, y: 300, phase: 0, hp: 1 }),
  );
  const events = tickFishing(state, balance, 20, { x: 700, y: 300 });
  assert.equal(events.filter((e) => e.type === "catch").length, 3);
  assert.equal(state.stamina, 0);
  assert.equal(state.money, 30);
  assert.equal(state.fish.length, 1);
  assert.equal(state.trip, 1);
  assert.equal(state.tripCaught, 3);
  assert.deepEqual(parseSave(JSON.stringify(state), balance), state);
});

test("shared stamina and damage agree across different frame sizes", () => {
  const balance = freshBalance();
  const batch = stockedGame(balance, () => 0.5);
  batch.fish.forEach((f) =>
    Object.assign(f, { x: 700, y: 300, phase: 0, hp: 100, maxHp: 100 }),
  );
  const frames = structuredClone(batch);
  tickFishing(batch, balance, 7.25, { x: 700, y: 300 });
  for (let i = 0; i < 145; i++)
    tickFishing(frames, balance, 0.05, { x: 700, y: 300 });
  assert.deepEqual(frames, batch);
});

test("visiting camp refills stamina once, while re-entering the active pond preserves it", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  state.stamina = 3;
  const ids = state.fish.map((f) => f.id);
  enterLake(state, balance);
  assert.deepEqual(
    state.fish.map((f) => f.id),
    ids,
  );
  assert.equal(state.stamina, 3);
  enterCamp(state);
  enterLake(state, balance);
  assert.equal(state.stamina, 10);
  assert.equal(state.trip, 2);
  assert.deepEqual(
    state.fish.map((f) => f.id),
    ids,
  );
  const secondTripIds = state.fish.map((f) => f.id);
  enterLake(state, balance);
  assert.deepEqual(
    state.fish.map((f) => f.id),
    secondTripIds,
  );
});

test("locked, maxed and unaffordable upgrades never deduct money", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  enterCamp(state);
  state.money = 100;
  assert.equal(purchaseSkill(state, "perch", balance), false);
  assert.equal(state.money, 100);
  assert.equal(purchaseSkill(state, "damage", balance), false);
  state.levels.population = 1;
  state.money = 3;
  assert.equal(purchaseSkill(state, "damage", balance), false);
  assert.equal(state.money, 3);
  state.levels.population = balance.skills.population.max;
  assert.equal(purchaseSkill(state, "population", balance), false);
  assert.equal(state.money, 3);
});

test("each upgrade changes its intended stat and species rolls are independent", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  enterCamp(state);
  state.money = 1000;
  for (let i = 0; i < 3; i++) purchaseSkill(state, "population", balance);
  for (const id of ["damage", "speed", "radius", "perch", "stamina"] as const)
    assert.equal(purchaseSkill(state, id, balance), true);
  const stats = getStats(state, balance);
  assert.equal(stats.population, 6);
  assert.equal(stats.damage, 2);
  assert.equal(stats.tickMs, 1760);
  assert.equal(stats.radius, 42);
  assert.deepEqual(stats.spawnRates, [95, 5, 0, 0]);
  assert.equal(stats.stamina, 11);
  spawnTrip(state, balance, () => 0);
  assert.ok(state.fish.every((f) => f.species === 0));
  spawnTrip(state, balance, () => 0.99);
  assert.equal(state.fish[0].species, 1);
  assert.equal(state.fish[0].hp, 8);
});

test("the $10,000 rod multiplies upgraded damage and cannot be bought twice", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  enterCamp(state);
  state.money = 9999;
  assert.equal(purchaseRod(state, balance, 4), false);
  state.money = 10000;
  state.levels.damage = 2;
  assert.equal(purchaseRod(state, balance, 4), true);
  assert.equal(state.money, 0);
  assert.equal(getStats(state, balance).damage, 15);
  state.money = 10000;
  assert.equal(purchaseRod(state, balance, 4), false);
  assert.equal(state.money, 10000);
});

test("live balance changes preserve damage percentage and clamp skill levels", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  state.fish[0].hp = 2;
  state.levels.damage = 10;
  balance.species[0].hp = 20;
  balance.skills.damage.max = 3;
  reconcileBalance(state, balance);
  assert.equal(state.fish[0].hp, 10);
  assert.equal(state.fish[0].maxHp, 20);
  assert.equal(state.levels.damage, 3);
  assert.equal(
    state.fish.length,
    3,
    "capacity changes do not discard existing fish",
  );
});

test("saves round-trip partial trips, money, levels and camp position", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  tickFishing(state, balance, 8, fishPosition(state.fish[0], 0));
  state.fish[0].hp = 3;
  enterCamp(state);
  state.player = { x: STATIONS.tree.targetX, y: STATIONS.tree.targetY };
  assert.equal(purchaseSkill(state, "population", balance), true);
  const restored = parseSave(JSON.stringify(state), balance)!;
  assert.ok(restored);
  assert.deepEqual(restored, state);
  enterLake(restored, balance);
  assert.equal(restored.fish.length, 2);
});

test("invalid saves and balance files fail safely", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  assert.equal(parseSave("not json", balance), null);
  assert.equal(parseSave("{}", balance), null);
  assert.equal(
    parseSave(JSON.stringify({ ...state, money: -10 }), balance),
    null,
  );
  assert.equal(
    parseSave(JSON.stringify({ ...state, fish: [] }), balance),
    null,
  );
  assert.equal(
    parseSave(
      JSON.stringify({ ...state, player: { x: 1800, y: 410 } }),
      balance,
    ),
    null,
  );
  const invalid = freshBalance();
  invalid.base.tickMs = 0;
  assert.throws(() => validateBalance(invalid), /Tick interval/);
  invalid.base.tickMs = balance.base.tickMs;
  invalid.skills.speed.amount = 100;
  assert.throws(() => validateBalance(invalid), /effect/);
  invalid.skills.speed.amount = NaN;
  assert.throws(() => validateBalance(invalid));
  assert.deepEqual(validateBalance(freshBalance()), freshBalance());
});

test("extreme valid tuning remains within gameplay safety caps", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  balance.skills.speed.amount = 75;
  balance.skills.radius.amount = 100;
  balance.skills.population.amount = 100;
  state.levels.speed = 12;
  state.levels.radius = 15;
  state.levels.population = 40;
  const stats = getStats(state, balance);
  assert.equal(stats.tickMs, 80);
  assert.equal(stats.radius, 220);
  assert.equal(stats.population, 150);
});

test("random fish stay in the northern pond and clear of both interface cards", () => {
  const balance = freshBalance();
  balance.base.population = 100;
  let seed = 35;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const state = stockedGame(balance, random);
  for (const fish of state.fish) {
    assert.ok(fish.x >= 130 && fish.x <= 1150);
    assert.ok(fish.y >= 180 && fish.y <= 420);
    assert.ok(fish.x <= 820 || fish.y >= 245);
  }
});

test("legacy horizontal saves migrate without losing purchases or the partial trip", () => {
  const balance = freshBalance();
  for (const inCamp of [false, true]) {
    const original = stockedGame(balance, () => 0.5);
    original.money = 123;
    original.levels.population = 3;
    original.rod = 4;
    original.ownedRods = [0, 4];
    original.fish[0].hp = 2;
    const legacy = {
      ...original,
      version: 1,
      rod: true,
      levels: {
        population: original.levels.population,
        damage: 0,
        speed: 0,
        radius: 0,
        species: 0,
      },
      inCamp,
      restockReady: inCamp,
      player: inCamp ? { x: 567, y: 385 } : { x: 1030, y: 409 },
      fish: original.fish.map((fish, i) => ({
        ...fish,
        x: 1270 + i * 220,
        y: 275 + i * 80,
      })),
    };
    const migrated = parseSave(JSON.stringify(legacy), balance)!;
    assert.ok(migrated);
    assert.equal(migrated.version, 5);
    assert.deepEqual(migrated.player, inCamp ? CAMP_START : LAKE_START);
    assert.equal(migrated.money, original.money);
    assert.deepEqual(migrated.levels, original.levels);
    assert.equal(migrated.rod, 4);
    assert.equal(migrated.fish.length, original.fish.length);
    assert.equal(migrated.fish[0].hp, 2);
    assert.equal(migrated.trip, original.trip);
    assert.equal(migrated.restockReady, inCamp);
    assert.deepEqual(parseSave(JSON.stringify(migrated), balance), migrated);
  }
});

test("vertical saves reject the water and buildings but preserve travel along the dock", () => {
  const balance = freshBalance();
  const state = stockedGame(balance);
  for (const player of [
    { x: 500, y: 500 },
    { x: 945, y: 950 },
    { x: 335, y: 970 },
  ])
    assert.equal(
      parseSave(JSON.stringify({ ...state, player }), balance),
      null,
    );
  state.player = { x: 640, y: 650 };
  assert.deepEqual(parseSave(JSON.stringify(state), balance), state);
});

test("partial stamina and the shared timer survive reloads without a refill", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  tickFishing(state, balance, 2.5, fishPosition(state.fish[0], 0));
  assert.equal(state.stamina, 9);
  assert.equal(state.castTick, 500);
  const restored = parseSave(JSON.stringify(state), balance)!;
  assert.deepEqual(restored, state);
  tickFishing(restored, balance, 1.5, fishPosition(restored.fish[0], 0));
  assert.equal(restored.stamina, 8);
  assert.equal(restored.fish[0].hp, 2);
  restored.stamina = 0;
  assert.equal(parseSave(JSON.stringify(restored), balance)?.stamina, 0);
});

test("legacy vertical saves gain stamina without losing an injured fish or purchases", () => {
  const balance = freshBalance(),
    state = stockedGame(balance, () => 0.5);
  state.money = 47;
  state.levels.population = 2;
  state.fish[0].hp = 2;
  const { stamina, maxStamina, castTick, ...old } = state;
  const legacy = {
    ...old,
    version: 2,
    rod: false,
    levels: {
      population: state.levels.population,
      damage: 0,
      speed: 0,
      radius: 0,
      species: 0,
    },
    fish: old.fish.map((f) => ({ ...f, tick: 400 })),
  };
  const restored = parseSave(JSON.stringify(legacy), balance)!;
  assert.ok(restored);
  assert.equal(restored.version, 5);
  assert.equal(restored.stamina, 10);
  assert.equal(restored.maxStamina, 10);
  assert.equal(restored.castTick, 0);
  assert.equal(restored.money, 47);
  assert.equal(restored.levels.population, 2);
  assert.deepEqual(restored.fish, state.fish);
});

test("an old cleared pond continues with full stamina in the same trip", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  const legacy = {
    ...state,
    version: 2,
    rod: false,
    levels: {
      population: state.levels.population,
      damage: 0,
      speed: 0,
      radius: 0,
      species: 0,
    },
    fish: [],
    tripCaught: 3,
    caught: 3,
    money: 3,
    earned: 3,
    collection: [3, 0, 0, 0],
  };
  const restored = parseSave(JSON.stringify(legacy), balance)!;
  assert.ok(restored);
  assert.equal(restored.stamina, 10);
  assert.equal(restored.trip, 1);
  assert.equal(restored.tripCaught, 3);
  assert.equal(restored.tripTotal, 4);
  assert.equal(restored.fish.length, 1);
  assert.equal(restored.money, 3);
});

test("invalid stamina saves and tuning are rejected, while old balance exports still import", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  for (const invalid of [
    { stamina: -1 },
    { stamina: 11 },
    { stamina: 1.5 },
    { stamina: null },
    { maxStamina: 0 },
    { maxStamina: 2.5 },
    { maxStamina: 10001 },
    { castTick: -1 },
    { castTick: null },
    { castTick: 10001 },
  ])
    assert.equal(
      parseSave(JSON.stringify({ ...state, ...invalid }), balance),
      null,
    );
  for (const stamina of [-1, 0, 1.5, 10001, NaN, null])
    assert.throws(
      () => validateBalance({ ...balance, base: { ...balance.base, stamina } }),
      /Starting stamina/,
    );
  const { stamina, ...oldBase } = balance.base;
  const restored = validateBalance({
    ...balance,
    base: { ...oldBase, tickMs: 1200 },
  });
  assert.equal(restored.base.stamina, 10);
  assert.equal(
    restored.base.tickMs,
    1200,
    "explicit balance overrides remain intact",
  );
});

test("live stamina tuning applies next trip and never refills an exhausted round", () => {
  const balance = freshBalance(),
    state = stockedGame(balance);
  state.stamina = 0;
  balance.base.stamina = 20;
  reconcileBalance(state, balance);
  assert.equal(state.stamina, 0);
  assert.equal(state.maxStamina, 10);
  assert.equal(parseSave(JSON.stringify(state), balance)?.stamina, 0);
  enterCamp(state);
  enterLake(state, balance);
  assert.equal(state.stamina, 20);
  assert.equal(state.maxStamina, 20);
});
