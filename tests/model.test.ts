import { test } from "node:test";
import assert from "node:assert/strict";
import { freshBalance, validateBalance } from "../src/config.ts";
import {
  enterCamp,
  enterLake,
  fishPosition,
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

test("the opening loop earns $3, buys three $1 population levels, then spawns six fish", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  assert.equal(state.money, 0);
  assert.equal(state.fish.length, 3);
  for (const fish of [...state.fish]) {
    const events = tickFishing(state, balance, 2.6, fishPosition(fish, 0));
    assert.equal(events.filter((e) => e.type === "hit").length, 4);
    assert.equal(events.filter((e) => e.type === "catch").length, 1);
  }
  assert.equal(state.money, 3);
  assert.equal(state.caught, 3);
  assert.equal(state.fish.length, 0);
  assert.equal(
    purchaseSkill(state, "population", balance),
    false,
    "must be at camp",
  );
  enterCamp(state);
  for (let i = 0; i < 3; i++) {
    assert.equal(skillCost("population", i, balance), 1);
    assert.equal(purchaseSkill(state, "population", balance), true);
  }
  assert.equal(state.money, 0);
  assert.equal(state.levels.population, 3);
  enterLake(state, balance, () => 0.5);
  assert.equal(state.fish.length, 6);
  assert.equal(state.trip, 2);
  assert.equal(state.tripCaught, 0);
});

test("damage is time-based, pauses off a fish, and requires standing at the dock", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5),
    fish = state.fish[0],
    pointer = fishPosition(fish, 0);
  tickFishing(state, balance, 0.4, pointer);
  assert.equal(fish.hp, 4);
  tickFishing(state, balance, 0.25, pointer);
  assert.equal(fish.hp, 3);
  tickFishing(state, balance, 0.5, pointer);
  tickFishing(state, balance, 1, null);
  tickFishing(state, balance, 0.15, pointer);
  assert.equal(fish.hp, 3, "leaving resets that fish’s tick timer");
  enterCamp(state);
  tickFishing(state, balance, 30, pointer);
  assert.equal(fish.hp, 3);
  state.inCamp = false;
  state.player.x = 800;
  tickFishing(state, balance, 30, pointer);
  assert.equal(fish.hp, 3);
});

test("a wide cursor damages multiple fish and each catch pays exactly once", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  state.fish.forEach((f) => {
    f.x = 1400;
    f.y = 300;
    f.phase = 0;
  });
  const events = tickFishing(state, balance, 100, { x: 1400, y: 300 });
  assert.equal(events.filter((e) => e.type === "catch").length, 3);
  assert.equal(state.money, 3);
  assert.deepEqual(state.collection, [3, 0, 0, 0]);
  tickFishing(state, balance, 100, { x: 1400, y: 300 });
  assert.equal(state.money, 3);
});

test("visiting camp restocks once, and staying on the lake does not respawn fish", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  const ids = state.fish.map((f) => f.id);
  enterLake(state, balance);
  assert.deepEqual(
    state.fish.map((f) => f.id),
    ids,
  );
  enterCamp(state);
  enterLake(state, balance);
  assert.equal(state.trip, 2);
  assert.notDeepEqual(
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
    state = newGame(balance);
  enterCamp(state);
  state.money = 100;
  assert.equal(purchaseSkill(state, "species", balance), false);
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

test("each type of upgrade changes its intended stat and rare fish are guaranteed", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  enterCamp(state);
  state.money = 1000;
  for (let i = 0; i < 3; i++) purchaseSkill(state, "population", balance);
  for (const id of ["damage", "speed", "radius", "species"] as const)
    assert.equal(purchaseSkill(state, id, balance), true);
  const stats = getStats(state, balance);
  assert.equal(stats.population, 6);
  assert.equal(stats.damage, 2);
  assert.equal(stats.tickMs, 572);
  assert.equal(stats.radius, 42);
  assert.equal(stats.species, 2);
  spawnTrip(state, balance, () => 0);
  assert.equal(state.fish[0].species, 1);
  assert.equal(state.fish[0].hp, 8);
});

test("the $1,000 rod multiplies upgraded damage and cannot be bought twice", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  enterCamp(state);
  state.money = 999;
  assert.equal(purchaseRod(state, balance), false);
  state.money = 1000;
  state.levels.damage = 2;
  assert.equal(purchaseRod(state, balance), true);
  assert.equal(state.money, 0);
  assert.equal(getStats(state, balance).damage, 15);
  state.money = 1000;
  assert.equal(purchaseRod(state, balance), false);
  assert.equal(state.money, 1000);
});

test("live balance changes preserve damage percentage and clamp skill levels", () => {
  const balance = freshBalance(),
    state = newGame(balance);
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
    "population changes wait until restocking",
  );
});

test("saves round-trip partial trips, money, levels and camp position", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  tickFishing(state, balance, 2.6, fishPosition(state.fish[0], 0));
  state.fish[0].hp = 3;
  enterCamp(state);
  state.player = { x: 567, y: 385 };
  assert.equal(purchaseSkill(state, "population", balance), true);
  const restored = parseSave(JSON.stringify(state), balance)!;
  assert.ok(restored);
  assert.deepEqual(restored, state);
  enterLake(restored, balance);
  assert.equal(restored.fish.length, 4);
});

test("invalid saves and balance files fail safely", () => {
  const balance = freshBalance(),
    state = newGame(balance);
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
  invalid.base.tickMs = 650;
  invalid.skills.speed.amount = 100;
  assert.throws(() => validateBalance(invalid), /effect/);
  invalid.skills.speed.amount = NaN;
  assert.throws(() => validateBalance(invalid));
  assert.deepEqual(validateBalance(freshBalance()), freshBalance());
});

test("extreme valid tuning remains within gameplay safety caps", () => {
  const balance = freshBalance(),
    state = newGame(balance);
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

test("random fish never spawn underneath the trip information card", () => {
  const balance = freshBalance();
  balance.base.population = 100;
  let seed = 35;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const state = newGame(balance, random);
  for (const fish of state.fish) {
    assert.ok(fish.x <= 1390 || fish.y >= 320);
  }
});
