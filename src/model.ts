import {
  DEFAULT_BALANCE,
  SKILL_IDS,
  type Balance,
  type SkillId,
} from "./config.ts";
import { atFishingSpot, CAMP_START, isWalkable, LAKE_START } from "./layout.ts";

export const SAVE_KEY = "stillwater.save.v1";
export const BALANCE_KEY = "stillwater.balance.v1";
export interface Fish {
  id: number;
  species: number;
  x: number;
  y: number;
  phase: number;
  hp: number;
  maxHp: number;
}
export interface GameState {
  version: 3;
  money: number;
  earned: number;
  caught: number;
  trip: number;
  tripCaught: number;
  tripTotal: number;
  stamina: number;
  maxStamina: number;
  castTick: number;
  levels: Record<SkillId, number>;
  rod: boolean;
  fish: Fish[];
  collection: number[];
  player: { x: number; y: number };
  inCamp: boolean;
  restockReady: boolean;
  playedSeconds: number;
}
export interface Stats {
  population: number;
  damage: number;
  tickMs: number;
  radius: number;
  species: number;
}
export type GameEvent = {
  type: "hit" | "catch";
  x: number;
  y: number;
  amount: number;
  species: number;
};

export function getStats(state: GameState, balance: Balance): Stats {
  const level = (id: SkillId) =>
    Math.min(state.levels[id], balance.skills[id].max);
  return {
    population: Math.min(
      150,
      Math.floor(
        balance.base.population +
          level("population") * balance.skills.population.amount,
      ),
    ),
    damage:
      (balance.base.damage + level("damage") * balance.skills.damage.amount) *
      (state.rod ? balance.rod.multiplier : 1),
    tickMs: Math.max(
      80,
      balance.base.tickMs *
        (1 - balance.skills.speed.amount / 100) ** level("speed"),
    ),
    radius: Math.min(
      220,
      balance.base.radius + level("radius") * balance.skills.radius.amount,
    ),
    species: Math.min(
      4,
      1 + Math.floor(level("species") * balance.skills.species.amount),
    ),
  };
}
export function skillCost(
  id: SkillId,
  level: number,
  balance: Balance,
): number {
  const skill = balance.skills[id];
  // A flat-level count of 3 means purchases 1, 2 and 3 all cost the base amount.
  return Math.ceil(
    skill.cost *
      skill.growth ** Math.max(0, level - Math.max(0, skill.flatLevels - 1)),
  );
}
export function skillRequirement(id: SkillId, state: GameState): string | null {
  if ((id === "damage" || id === "speed") && state.levels.population < 1)
    return "Requires Pond life level 1";
  if (id === "radius" && state.levels.damage < 1)
    return "Requires Stronger hook level 1";
  if (id === "species" && state.levels.population < 3)
    return "Requires Pond life level 3";
  return null;
}
export function purchaseSkill(
  state: GameState,
  id: SkillId,
  balance: Balance,
): boolean {
  if (
    !state.inCamp ||
    skillRequirement(id, state) ||
    state.levels[id] >= balance.skills[id].max
  )
    return false;
  const cost = skillCost(id, state.levels[id], balance);
  if (state.money < cost) return false;
  state.money = Math.round((state.money - cost) * 100) / 100;
  state.levels[id]++;
  return true;
}
export function purchaseRod(state: GameState, balance: Balance): boolean {
  if (!state.inCamp || state.rod || state.money < balance.rod.cost)
    return false;
  state.money -= balance.rod.cost;
  state.rod = true;
  return true;
}
/** Refill an empty pond without starting a new trip or restoring stamina. */
function refillPond(
  state: GameState,
  balance: Balance,
  random = Math.random,
): void {
  const stats = getStats(state, balance);
  const available = balance.species.slice(0, stats.species);
  const weight = available.reduce((sum, fish) => sum + fish.weight, 0);
  const firstPositions = [
    [330, 300],
    [890, 375],
    [660, 225],
  ];
  state.fish = Array.from({ length: stats.population }, (_, i) => {
    let roll = random() * weight;
    let species = available.length - 1;
    for (let j = 0; j < available.length; j++) {
      roll -= available[j].weight;
      if (roll < 0) {
        species = j;
        break;
      }
    }
    // Guarantee a new species appears on every trip after its unlock.
    if (i === 0) species = stats.species - 1;
    const fish = balance.species[species];
    const position =
      stats.population <= 3
        ? firstPositions[i]
        : [200 + random() * 880, 195 + random() * 215];
    // Reserve space for the trip card, including on narrow screens. A fish must
    // never require hovering through an opaque interface element to catch it.
    if (position[0] > 770 && position[1] < 320)
      position[1] = 320 + random() * 90;
    if (position[0] < 480 && position[1] < 280)
      position[1] = 280 + random() * 130;
    return {
      id: state.trip * 1000 + state.tripTotal + i,
      species,
      x: position[0],
      y: position[1],
      phase: random() * Math.PI * 2,
      hp: fish.hp,
      maxHp: fish.hp,
    };
  });
  state.tripTotal += stats.population;
}
export function spawnTrip(
  state: GameState,
  balance: Balance,
  random = Math.random,
): void {
  state.tripTotal = 0;
  state.tripCaught = 0;
  state.stamina = balance.base.stamina;
  state.maxStamina = balance.base.stamina;
  state.castTick = 0;
  state.restockReady = false;
  refillPond(state, balance, random);
}
export function newGame(
  balance: Balance = DEFAULT_BALANCE,
  random = Math.random,
): GameState {
  const state: GameState = {
    version: 3,
    money: 0,
    earned: 0,
    caught: 0,
    trip: 1,
    tripCaught: 0,
    tripTotal: balance.base.population,
    stamina: balance.base.stamina,
    maxStamina: balance.base.stamina,
    castTick: 0,
    levels: { population: 0, damage: 0, speed: 0, radius: 0, species: 0 },
    rod: false,
    fish: [],
    collection: [0, 0, 0, 0],
    player: { ...LAKE_START },
    inCamp: false,
    restockReady: false,
    playedSeconds: 0,
  };
  spawnTrip(state, balance, random);
  return state;
}
export function enterCamp(state: GameState): void {
  state.inCamp = true;
  state.restockReady = true;
  state.castTick = 0;
}
export function enterLake(
  state: GameState,
  balance: Balance,
  random = Math.random,
): void {
  state.inCamp = false;
  if (state.restockReady) {
    state.trip++;
    spawnTrip(state, balance, random);
  }
}
export function fishPosition(
  fish: Fish,
  time: number,
): { x: number; y: number } {
  return {
    x: fish.x + Math.sin(time * 0.28 + fish.phase) * 24,
    y: fish.y + Math.sin(time * 0.42 + fish.phase) * 9,
  };
}
/** One shared cast tick damages every target and spends exactly one stamina. */
export function tickFishing(
  state: GameState,
  balance: Balance,
  dt: number,
  pointer: { x: number; y: number } | null,
  random = Math.random,
): GameEvent[] {
  const events: GameEvent[] = [];
  const stats = getStats(state, balance);
  if (!Number.isFinite(dt) || dt < 0) return events;
  const targets =
    !state.inCamp && atFishingSpot(state.player) && pointer && state.stamina > 0
      ? state.fish.filter((fish) => {
          const pos = fishPosition(fish, state.playedSeconds);
          return (
            Math.hypot(pos.x - pointer.x, pos.y - pointer.y) <=
            stats.radius + 12
          );
        })
      : [];
  if (!targets.length) {
    state.castTick = 0;
    return events;
  }
  state.castTick += dt * 1000;
  while (state.castTick + 0.0001 >= stats.tickMs && state.stamina > 0) {
    const living = targets.filter((fish) => fish.hp > 0);
    if (!living.length) break;
    state.castTick = Math.max(0, state.castTick - stats.tickMs);
    state.stamina--;
    for (const fish of living) {
      const pos = fishPosition(fish, state.playedSeconds);
      fish.hp = Math.max(0, fish.hp - stats.damage);
      events.push({
        type: "hit",
        ...pos,
        amount: stats.damage,
        species: fish.species,
      });
      if (fish.hp === 0) {
        const value = balance.species[fish.species].value;
        state.money = Math.round((state.money + value) * 100) / 100;
        state.earned += value;
        state.caught++;
        state.tripCaught++;
        state.collection[fish.species]++;
        events.push({
          type: "catch",
          ...pos,
          amount: value,
          species: fish.species,
        });
      }
    }
  }
  state.fish = state.fish.filter((fish) => fish.hp > 0);
  if (state.stamina === 0 || targets.every((fish) => fish.hp === 0))
    state.castTick = 0;
  if (!state.fish.length && state.stamina > 0)
    refillPond(state, balance, random);
  return events;
}
export function reconcileBalance(state: GameState, balance: Balance): void {
  for (const id of SKILL_IDS)
    state.levels[id] = Math.min(state.levels[id], balance.skills[id].max);
  for (const fish of state.fish) {
    const fraction = fish.hp / fish.maxHp;
    fish.maxHp = balance.species[fish.species].hp;
    fish.hp = Math.max(0.01, fraction * fish.maxHp);
  }
  state.castTick = Math.min(state.castTick, getStats(state, balance).tickMs);
}
const finite = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
/** Reject damaged or incompatible saves, including partial trips, rather than creating invalid game state. */
export function parseSave(
  raw: string | null,
  balance: Balance,
): GameState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Omit<GameState, "version"> & {
      version: number;
    };
    if (
      !s ||
      (s.version !== 1 && s.version !== 2 && s.version !== 3) ||
      !s.levels ||
      !s.player ||
      typeof s.rod !== "boolean" ||
      typeof s.inCamp !== "boolean" ||
      typeof s.restockReady !== "boolean"
    )
      return null;
    if (s.version === 3) {
      if (
        !finite(s.maxStamina, 1, 10000) ||
        !Number.isInteger(s.maxStamina) ||
        !finite(s.stamina, 0, s.maxStamina) ||
        !Number.isInteger(s.stamina) ||
        !finite(s.castTick, 0, 10000)
      )
        return null;
    }
    for (const field of [
      "money",
      "earned",
      "caught",
      "tripCaught",
      "playedSeconds",
    ] as const)
      if (!finite(s[field], 0, 1e15)) return null;
    if (
      !Number.isInteger(s.caught) ||
      !Number.isInteger(s.tripCaught) ||
      !finite(s.trip, 1, 1e9) ||
      !Number.isInteger(s.trip) ||
      !finite(
        s.tripTotal,
        1,
        s.version === 3 ? (s.maxStamina + 1) * 150 : 150,
      ) ||
      !Number.isInteger(s.tripTotal)
    )
      return null;
    const legacy = s.version === 1;
    if (legacy) {
      if (
        !finite(s.player.x, 70, 1080) ||
        !finite(s.player.y, 150, 622) ||
        (s.player.x > 750 && (s.player.y < 381 || s.player.y > 440))
      )
        return null;
    } else if (
      !finite(s.player.x, 100, 1180) ||
      !finite(s.player.y, 474, 1368) ||
      !isWalkable(s.player.x, s.player.y)
    )
      return null;
    for (const id of SKILL_IDS)
      if (!finite(s.levels[id], 0, 100) || !Number.isInteger(s.levels[id]))
        return null;
    if (
      !Array.isArray(s.collection) ||
      s.collection.length !== 4 ||
      !s.collection.every((n) => finite(n, 0, 1e12) && Number.isInteger(n))
    )
      return null;
    if (
      !Array.isArray(s.fish) ||
      s.fish.length > 150 ||
      s.fish.length + s.tripCaught !== s.tripTotal
    )
      return null;
    const ids = new Set<number>();
    for (const f of s.fish) {
      if (
        !f ||
        !finite(f.id, 0, 1e15) ||
        ids.has(f.id) ||
        !Number.isInteger(f.id) ||
        !finite(f.species, 0, 3) ||
        !Number.isInteger(f.species) ||
        !finite(f.x, legacy ? 1150 : 180, legacy ? 1880 : 1100) ||
        !finite(f.y, legacy ? 160 : 180, legacy ? 610 : 430) ||
        !finite(f.phase, 0, Math.PI * 2) ||
        !finite(f.hp, 0.0001, 100000) ||
        !finite(f.maxHp, f.hp, 100000)
      )
        return null;
      ids.add(f.id);
    }
    if (legacy) {
      // Keep the wallet, upgrades and partial trip when moving the old map south.
      s.player = { ...(s.inCamp ? CAMP_START : LAKE_START) };
      for (const fish of s.fish) {
        fish.x = 220 + ((fish.x - 1150) / 730) * 860;
        fish.y = 200 + ((fish.y - 160) / 450) * 210;
        if (fish.x > 770) fish.y = Math.max(320, fish.y);
        if (fish.x < 480) fish.y = Math.max(280, fish.y);
      }
    }
    const state: GameState = {
      ...s,
      version: 3,
      stamina: s.version === 3 ? s.stamina : balance.base.stamina,
      maxStamina: s.version === 3 ? s.maxStamina : balance.base.stamina,
      castTick: s.version === 3 ? s.castTick : 0,
      // Drop the old independent fish timers when migrating to shared casts.
      fish: s.fish.map(({ id, species, x, y, phase, hp, maxHp }) => ({
        id,
        species,
        x,
        y,
        phase,
        hp,
        maxHp,
      })),
    };
    reconcileBalance(state, balance);
    if (!state.inCamp && !state.fish.length && state.stamina > 0)
      refillPond(state, balance);
    return state;
  } catch {
    return null;
  }
}
