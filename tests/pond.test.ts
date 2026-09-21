import { test } from "node:test";
import assert from "node:assert/strict";
import { freshBalance, validateBalance } from "../src/config.ts";
import {
  enterCamp,
  enterLake,
  fishPosition,
  fishReveal,
  getStats,
  newGame,
  parseSave,
  purchaseRod,
  tickFishing,
  tickPond,
} from "../src/model.ts";

test("a new pond begins with one shadow and adds one fish every ten seconds up to capacity", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  assert.equal(state.fish.length, 1);
  assert.equal(fishReveal(state.fish[0]), 0);
  assert.equal(
    tickPond(state, balance, 9.99, () => 0.5),
    false,
  );
  assert.equal(state.fish.length, 1);
  assert.equal(
    tickPond(state, balance, 0.01, () => 0.5),
    true,
  );
  assert.equal(state.fish.length, 2);
  tickPond(state, balance, 10, () => 0.5);
  assert.equal(state.fish.length, 3);
  tickPond(state, balance, 500, () => 0.5);
  assert.equal(state.fish.length, 3);
  assert.equal(state.spawnClock, 0, "a full pond cannot bank future arrivals");
  assert.equal(state.tripTotal, 3);
  assert.deepEqual(parseSave(JSON.stringify(state), balance), state);
});

test("spawning is frame independent, ignores invalid deltas, and supports future arrival tuning", () => {
  const balance = freshBalance(),
    batch = newGame(balance, () => 0.5);
  balance.base.population = 15;
  const frames = structuredClone(batch);
  tickPond(batch, balance, 32.25, () => 0.5);
  for (let i = 0; i < 645; i++) tickPond(frames, balance, 0.05, () => 0.5);
  assert.deepEqual(frames, batch);
  assert.equal(batch.fish.length, 4);
  assert.equal(batch.spawnClock, 2250);
  for (const dt of [-1, NaN, Infinity]) tickPond(batch, balance, dt);
  assert.deepEqual(frames, batch);
  balance.base.spawnMs = 5000;
  tickPond(batch, balance, 2.75, () => 0.5);
  assert.equal(batch.fish.length, 5);
});

test("a last catch creates exactly one fish even at zero stamina and keeps the arrival clock", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  state.spawnClock = 6750;
  state.stamina = 1;
  state.fish[0].hp = 1;
  const oldId = state.fish[0].id;
  const events = tickFishing(
    state,
    balance,
    2,
    fishPosition(state.fish[0], 0),
    () => 0.5,
  );
  assert.equal(events.filter((e) => e.type === "catch").length, 1);
  assert.equal(state.fish.length, 1);
  assert.notEqual(state.fish[0].id, oldId);
  assert.equal(state.fish[0].hp, state.fish[0].maxHp);
  assert.equal(state.stamina, 0);
  assert.equal(state.money, 10);
  assert.equal(state.spawnClock, 6750);
  tickPond(state, balance, 3.25, () => 0.5);
  assert.equal(state.fish.length, 2);
  assert.equal(state.stamina, 0);
});

test("damage reveals a fish, and travel and save reloads preserve its health and arrivals", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  const fish = state.fish[0];
  for (let n = 1; n <= 3; n++) {
    tickFishing(state, balance, 2, fishPosition(fish, 0));
    assert.equal(fishReveal(fish), n / 4);
  }
  tickPond(state, balance, 6.75);
  enterCamp(state);
  enterLake(state, balance);
  assert.equal(state.fish[0], fish);
  assert.equal(fish.hp, 1);
  assert.equal(state.spawnClock, 6750);
  assert.equal(state.stamina, 10);
  const restored = parseSave(JSON.stringify(state), balance)!;
  assert.deepEqual(restored, state);
  tickPond(restored, balance, 3.25);
  assert.equal(restored.fish.length, 2);
  assert.equal(restored.fish[0].hp, 1);
});

test("arrivals spread across the pond even with a constant random source", () => {
  const balance = freshBalance(),
    state = newGame(balance, () => 0.5);
  balance.base.population = 12;
  tickPond(state, balance, 110, () => 0.5);
  assert.equal(state.fish.length, 12);
  assert.ok(
    Math.max(...state.fish.map((f) => f.x)) -
      Math.min(...state.fish.map((f) => f.x)) >
      800,
  );
  assert.ok(
    Math.max(...state.fish.map((f) => f.y)) -
      Math.min(...state.fish.map((f) => f.y)) >
      150,
  );
  for (const [i, fish] of state.fish.entries()) {
    assert.ok(
      fish.x >= 130 && fish.x <= 1150 && fish.y >= 180 && fish.y <= 420,
    );
    for (const other of state.fish.slice(i + 1))
      assert.ok(Math.hypot((fish.x - other.x) * 0.5, fish.y - other.y) >= 55);
  }
});

test("all ten rods have distinct art, upgrades start at $1,000, and owned rods equip for free", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  assert.equal(balance.rods.length, 10);
  assert.equal(new Set(balance.rods.map((r) => r.sprite)).size, 10);
  assert.equal(balance.rods[1].cost, 1000);
  state.money = 1000;
  assert.equal(purchaseRod(state, balance, 1), false, "only at camp");
  enterCamp(state);
  assert.equal(purchaseRod(state, balance, 1), true);
  assert.equal(state.money, 0);
  assert.equal(getStats(state, balance).damage, 1.5);
  assert.equal(purchaseRod(state, balance, 1), false);
  assert.equal(purchaseRod(state, balance, 2), false);
  assert.equal(purchaseRod(state, balance, 0), true);
  assert.equal(purchaseRod(state, balance, 1), true);
  for (const index of [-1, 1.5, 10, NaN])
    assert.equal(purchaseRod(state, balance, index), false);
  assert.deepEqual(state.ownedRods, [0, 1]);
  assert.deepEqual(parseSave(JSON.stringify(state), balance), state);
});

test("version-four saves keep the gilded rod, wallet, injuries, and collection", () => {
  const balance = freshBalance(),
    original = newGame(balance, () => 0.5);
  original.fish[0].hp = 2;
  original.money = 1234;
  original.collection = [7, 3, 0, 0];
  const { ownedRods, spawnClock, nextFishId, ...old } = original;
  const migrated = parseSave(
    JSON.stringify({ ...old, version: 4, rod: true }),
    balance,
  )!;
  assert.equal(migrated.version, 5);
  assert.equal(migrated.rod, 4);
  assert.deepEqual(migrated.ownedRods, [0, 4]);
  assert.equal(migrated.money, 1234);
  assert.deepEqual(migrated.collection, original.collection);
  assert.deepEqual(migrated.fish, original.fish);
  assert.equal(migrated.spawnClock, 0);
  assert.ok(migrated.nextFishId > migrated.fish[0].id);
});

test("new save and balance fields reject invalid values and older balance exports gain arrival timing", () => {
  const balance = freshBalance(),
    state = newGame(balance);
  for (const fields of [
    { rod: 10 },
    { rod: true },
    { ownedRods: [0, 0] },
    { ownedRods: [1] },
    { ownedRods: [0, 1.5] },
    { spawnClock: -1 },
    { spawnClock: null },
    { nextFishId: state.fish[0].id },
  ])
    assert.equal(
      parseSave(JSON.stringify({ ...state, ...fields }), balance),
      null,
    );
  for (const spawnMs of [0, -1, null, Infinity, 3600001])
    assert.throws(
      () => validateBalance({ ...balance, base: { ...balance.base, spawnMs } }),
      /arrival interval/,
    );
  const { spawnMs, ...base } = balance.base;
  const { rods, ...old } = balance;
  const migrated = validateBalance({
    ...old,
    base,
    rod: { cost: 12345, multiplier: 6 },
  });
  assert.equal(migrated.base.spawnMs, 10000);
  assert.equal(migrated.rods[4].cost, 12345);
  assert.equal(migrated.rods[4].multiplier, 6);
});
