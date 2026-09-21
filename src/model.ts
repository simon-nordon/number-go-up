import {
  DEFAULT_BALANCE,
  SKILL_IDS,
  SPAWN_SKILLS,
  SPAWN_CAP,
  isSpawnSkill,
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
  version: 5;
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
  rod: number;
  ownedRods: number[];
  spawnClock: number;
  nextFishId: number;
  fish: Fish[];
  collection: number[];
  player: { x: number; y: number };
  inCamp: boolean;
  restockReady: boolean;
  playedSeconds: number;
}
export interface Stats {
  population: number;
  stamina: number;
  damage: number;
  tickMs: number;
  radius: number;
  spawnRates: number[];
  spawnMs: number;
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
  let remaining = SPAWN_CAP;
  const spawnRates = SPAWN_SKILLS.map((id) => {
    const rate = Math.min(remaining, level(id) * balance.skills[id].amount);
    remaining -= rate;
    return rate;
  });
  const advancedRate = spawnRates.reduce((sum, rate) => sum + rate, 0);
  return {
    stamina: Math.min(
      10000,
      balance.base.stamina + level("stamina") * balance.skills.stamina.amount,
    ),
    population: Math.min(
      150,
      Math.floor(
        balance.base.population +
          level("population") * balance.skills.population.amount,
      ),
    ),
    damage:
      (balance.base.damage + level("damage") * balance.skills.damage.amount) *
      balance.rods[state.rod].multiplier,
    tickMs: Math.max(
      80,
      balance.base.tickMs *
        (1 - balance.skills.speed.amount / 100) ** level("speed"),
    ),
    radius: Math.min(
      220,
      balance.base.radius + level("radius") * balance.skills.radius.amount,
    ),
    spawnRates: [100 - advancedRate, ...spawnRates],
    spawnMs: balance.base.spawnMs,
  };
}
export function skillCost(
  id: SkillId,
  level: number,
  balance: Balance,
): number {
  const skill = balance.skills[id];
  // A flat-level count of 3 means purchases 1, 2 and 3 all cost the base amount.
  return (
    Math.ceil(
      (skill.cost / 10) *
        skill.growth ** Math.max(0, level - Math.max(0, skill.flatLevels - 1)),
    ) * 10
  );
}
export function skillRequirement(id: SkillId, state: GameState): string | null {
  if ((id === "damage" || id === "speed") && state.levels.population < 1)
    return "Requires Pond life level 1";
  if (id === "radius" && state.levels.damage < 1)
    return "Requires Stronger hook level 1";
  if (id === "perch" && state.levels.population < 3)
    return "Requires Pond life level 3";
  if (id === "koi" && state.levels.perch < 1)
    return "Requires River perch level 1";
  if (id === "trout" && state.levels.koi < 1)
    return "Requires Mirror carp level 1";
  return null;
}
export function spawnCapReached(
  id: SkillId,
  state: GameState,
  balance: Balance,
): boolean {
  return (
    isSpawnSkill(id) &&
    SPAWN_SKILLS.reduce(
      (sum, skill) => sum + state.levels[skill] * balance.skills[skill].amount,
      0,
    ) +
      balance.skills[id].amount >
      SPAWN_CAP
  );
}
export function purchaseSkill(
  state: GameState,
  id: SkillId,
  balance: Balance,
): boolean {
  if (
    !state.inCamp ||
    skillRequirement(id, state) ||
    spawnCapReached(id, state, balance) ||
    state.levels[id] >= balance.skills[id].max
  )
    return false;
  const cost = skillCost(id, state.levels[id], balance);
  if (state.money < cost) return false;
  state.money = Math.round((state.money - cost) * 100) / 100;
  state.levels[id]++;
  return true;
}
export function purchaseRod(
  state: GameState,
  balance: Balance,
  index: number,
): boolean {
  const rod = balance.rods[index];
  if (!state.inCamp || !Number.isInteger(index) || !rod || state.rod === index)
    return false;
  if (!state.ownedRods.includes(index)) {
    if (state.money < rod.cost) return false;
    state.money = Math.round((state.money - rod.cost) * 100) / 100;
    state.ownedRods.push(index);
  }
  state.rod = index;
  return true;
}

/** Sample across the pond and favor open water instead of clustering at its center. */
function spawnPosition(
  state: GameState,
  random: () => number,
): { x: number; y: number } {
  let best = { x: 200, y: 320 };
  let clearance = -1;
  const start = Math.floor(random() * 32);
  for (let n = 0; n < 32; n++) {
    const cell = (start + n) % 32;
    const x = 130 + (((cell % 8) + random()) / 8) * 1020;
    const y = 180 + ((Math.floor(cell / 8) + random()) / 4) * 240;
    if (x > 820 && y < 245) continue;
    const distance = state.fish.reduce(
      (nearest, fish) =>
        Math.min(nearest, Math.hypot((x - fish.x) * 0.5, y - fish.y)),
      Infinity,
    );
    if (distance > clearance) {
      best = { x, y };
      clearance = distance;
    }
  }
  return best;
}

function spawnFish(
  state: GameState,
  balance: Balance,
  random = Math.random,
): void {
  const stats = getStats(state, balance);
  let roll = random() * 100;
  let species = 0;
  for (let j = 0; j < stats.spawnRates.length; j++) {
    roll -= stats.spawnRates[j];
    if (roll < 0) {
      species = j;
      break;
    }
  }
  const fish = balance.species[species];
  state.fish.push({
    id: state.nextFishId++,
    species,
    ...spawnPosition(state, random),
    phase: random() * Math.PI * 2,
    hp: fish.hp,
    maxHp: fish.hp,
  });
  state.tripTotal++;
}

/** Active play only: menus and hidden tabs never call this clock. */
export function tickPond(
  state: GameState,
  balance: Balance,
  dt: number,
  random = Math.random,
): boolean {
  if (!Number.isFinite(dt) || dt < 0) return false;
  const before = state.fish.length;
  if (!state.fish.length) spawnFish(state, balance, random);
  const stats = getStats(state, balance);
  if (state.fish.length >= stats.population) {
    state.spawnClock = 0;
  } else {
    state.spawnClock = Math.round((state.spawnClock + dt * 1000) * 1000) / 1000;
    while (
      state.spawnClock >= stats.spawnMs &&
      state.fish.length < stats.population
    ) {
      state.spawnClock -= stats.spawnMs;
      spawnFish(state, balance, random);
    }
    if (state.fish.length >= stats.population) state.spawnClock = 0;
  }
  return state.fish.length !== before;
}

function beginTrip(
  state: GameState,
  balance: Balance,
  random: () => number,
): void {
  state.tripTotal = state.fish.length;
  state.tripCaught = 0;
  state.stamina = getStats(state, balance).stamina;
  state.maxStamina = state.stamina;
  state.castTick = 0;
  state.restockReady = false;
  if (!state.fish.length) spawnFish(state, balance, random);
}
/** Explicit developer restock; normal travel preserves the pond. */
export function spawnTrip(
  state: GameState,
  balance: Balance,
  random = Math.random,
): void {
  state.fish = [];
  state.spawnClock = 0;
  beginTrip(state, balance, random);
  while (state.fish.length < getStats(state, balance).population)
    spawnFish(state, balance, random);
}
export function newGame(
  balance: Balance = DEFAULT_BALANCE,
  random = Math.random,
): GameState {
  const state: GameState = {
    version: 5,
    money: 0,
    earned: 0,
    caught: 0,
    trip: 1,
    tripCaught: 0,
    tripTotal: balance.base.population,
    stamina: balance.base.stamina,
    maxStamina: balance.base.stamina,
    castTick: 0,
    levels: {
      population: 0,
      damage: 0,
      speed: 0,
      radius: 0,
      stamina: 0,
      perch: 0,
      koi: 0,
      trout: 0,
    },
    rod: 0,
    ownedRods: [0],
    spawnClock: 0,
    nextFishId: 1,
    fish: [],
    collection: [0, 0, 0, 0],
    player: { ...LAKE_START },
    inCamp: false,
    restockReady: false,
    playedSeconds: 0,
  };
  beginTrip(state, balance, random);
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
    beginTrip(state, balance, random);
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
/** Zero is a submerged silhouette; one is fully at the surface. */
export function fishReveal(fish: Fish): number {
  return Math.max(0, Math.min(1, 1 - fish.hp / fish.maxHp));
}
export function insideCast(
  target: { x: number; y: number },
  pointer: { x: number; y: number },
  radius: number,
  yCorrection = 1,
): boolean {
  const vertical =
    Number.isFinite(yCorrection) && yCorrection > 0 ? yCorrection : 1;
  return (
    Math.hypot(target.x - pointer.x, (target.y - pointer.y) / vertical) <=
    radius
  );
}
/** One shared cast tick damages every target and spends exactly one stamina. */
export function tickFishing(
  state: GameState,
  balance: Balance,
  dt: number,
  pointer: { x: number; y: number } | null,
  random = Math.random,
  castYCorrection = 1,
): GameEvent[] {
  const events: GameEvent[] = [];
  const stats = getStats(state, balance);
  if (!Number.isFinite(dt) || dt < 0) return events;
  const targets =
    !state.inCamp && atFishingSpot(state.player) && pointer && state.stamina > 0
      ? state.fish.filter((fish) => {
          const pos = fishPosition(fish, state.playedSeconds);
          return insideCast(pos, pointer, stats.radius + 12, castYCorrection);
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
  if (!state.fish.length) spawnFish(state, balance, random);
  return events;
}
export function reconcileBalance(state: GameState, balance: Balance): void {
  for (const id of SKILL_IDS)
    state.levels[id] = Math.min(state.levels[id], balance.skills[id].max);
  // A live balance edit may increase effects. Retain whole levels within the
  // shared cap, in tree order, so the herring always keeps at least 20%.
  let remaining = SPAWN_CAP;
  for (const id of SPAWN_SKILLS) {
    state.levels[id] = Math.min(
      state.levels[id],
      Math.floor(remaining / balance.skills[id].amount),
    );
    remaining -= state.levels[id] * balance.skills[id].amount;
  }
  for (const fish of state.fish) {
    const fraction = fish.hp / fish.maxHp;
    fish.maxHp = balance.species[fish.species].hp;
    fish.hp = Math.max(0.01, fraction * fish.maxHp);
  }
  state.castTick = Math.min(state.castTick, getStats(state, balance).tickMs);
  state.spawnClock = Math.min(state.spawnClock, balance.base.spawnMs);
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
    const s = JSON.parse(raw) as Omit<GameState, "version" | "rod"> & {
      version: number;
      rod: number | boolean;
    };
    if (
      !s ||
      ![1, 2, 3, 4, 5].includes(s.version) ||
      !s.levels ||
      !s.player ||
      (s.version < 5 && typeof s.rod !== "boolean") ||
      typeof s.inCamp !== "boolean" ||
      typeof s.restockReady !== "boolean"
    )
      return null;
    if (
      s.version >= 5 &&
      (!finite(s.rod, 0, balance.rods.length - 1) ||
        !Number.isInteger(s.rod) ||
        !Array.isArray(s.ownedRods) ||
        !s.ownedRods.includes(0) ||
        !s.ownedRods.includes(s.rod) ||
        new Set(s.ownedRods).size !== s.ownedRods.length ||
        !s.ownedRods.every(
          (id) =>
            finite(id, 0, balance.rods.length - 1) && Number.isInteger(id),
        ) ||
        !finite(s.spawnClock, 0, 3600000) ||
        !finite(s.nextFishId, 1, 1e15) ||
        !Number.isInteger(s.nextFishId))
    )
      return null;
    if (s.version >= 3) {
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
        s.version >= 5 ? 1e15 : s.version >= 3 ? (s.maxStamina + 1) * 150 : 150,
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
    if (s.version < 4) {
      const oldLevels = s.levels as Record<string, number>;
      if (
        !finite(oldLevels.species, 0, 3) ||
        !Number.isInteger(oldLevels.species)
      )
        return null;
      s.levels = {
        population: oldLevels.population,
        damage: oldLevels.damage,
        speed: oldLevels.speed,
        radius: oldLevels.radius,
        stamina: 0,
        perch: oldLevels.species >= 1 ? 1 : 0,
        koi: oldLevels.species >= 2 ? 1 : 0,
        trout: oldLevels.species >= 3 ? 1 : 0,
      };
    }
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
        !finite(
          f.x,
          legacy ? 1150 : s.version >= 5 ? 130 : 180,
          legacy ? 1880 : s.version >= 5 ? 1150 : 1100,
        ) ||
        !finite(f.y, legacy ? 160 : 180, legacy ? 610 : 430) ||
        !finite(f.phase, 0, Math.PI * 2) ||
        !finite(f.hp, 0.0001, 100000) ||
        !finite(f.maxHp, f.hp, 100000)
      )
        return null;
      ids.add(f.id);
    }
    if (s.version >= 5 && s.fish.some((f) => f.id >= s.nextFishId)) return null;
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
      version: 5,
      rod: s.version < 5 ? (s.rod ? 4 : 0) : (s.rod as number),
      ownedRods: s.version < 5 ? (s.rod ? [0, 4] : [0]) : s.ownedRods,
      spawnClock: s.version < 5 ? 0 : s.spawnClock,
      nextFishId:
        s.version < 5
          ? Math.max(0, ...s.fish.map((f) => f.id)) + 1
          : s.nextFishId,
      stamina: s.version >= 3 ? s.stamina : balance.base.stamina,
      maxStamina: s.version >= 3 ? s.maxStamina : balance.base.stamina,
      castTick: s.version >= 3 ? s.castTick : 0,
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
    if (!state.fish.length) spawnFish(state, balance);
    return state;
  } catch {
    return null;
  }
}
