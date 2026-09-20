import {
  DEFAULT_BALANCE,
  SKILL_IDS,
  type Balance,
  type SkillId,
} from "./config.ts";

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
  tick: number;
}
export interface GameState {
  version: 1;
  money: number;
  earned: number;
  caught: number;
  trip: number;
  tripCaught: number;
  tripTotal: number;
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
export function spawnTrip(
  state: GameState,
  balance: Balance,
  random = Math.random,
): void {
  const stats = getStats(state, balance);
  const available = balance.species.slice(0, stats.species);
  const weight = available.reduce((sum, fish) => sum + fish.weight, 0);
  const firstPositions = [
    [1270, 274],
    [1530, 467],
    [1748, 314],
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
        : [1200 + random() * 635, 185 + random() * 380];
    // Reserve space for the trip card, including on narrow screens. A fish must
    // never require hovering through an opaque interface element to catch it.
    if (stats.population > 3 && position[0] > 1390 && position[1] < 320) {
      position[1] = 320 + random() * 245;
    }
    return {
      id: state.trip * 1000 + i,
      species,
      x: position[0],
      y: position[1],
      phase: random() * Math.PI * 2,
      hp: fish.hp,
      maxHp: fish.hp,
      tick: 0,
    };
  });
  state.tripTotal = stats.population;
  state.tripCaught = 0;
  state.restockReady = false;
}
export function newGame(
  balance: Balance = DEFAULT_BALANCE,
  random = Math.random,
): GameState {
  const state: GameState = {
    version: 1,
    money: 0,
    earned: 0,
    caught: 0,
    trip: 1,
    tripCaught: 0,
    tripTotal: balance.base.population,
    levels: { population: 0, damage: 0, speed: 0, radius: 0, species: 0 },
    rod: false,
    fish: [],
    collection: [0, 0, 0, 0],
    player: { x: 1030, y: 409 },
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
/** Time-based independent hover ticks; no clicking and no damage away from the dock. */
export function tickFishing(
  state: GameState,
  balance: Balance,
  dt: number,
  pointer: { x: number; y: number } | null,
): GameEvent[] {
  const events: GameEvent[] = [];
  const stats = getStats(state, balance);
  const fishing = !state.inCamp && state.player.x >= 920 && pointer;
  for (const fish of state.fish) {
    const pos = fishPosition(fish, state.playedSeconds);
    if (
      !fishing ||
      Math.hypot(pos.x - pointer.x, pos.y - pointer.y) > stats.radius + 12
    ) {
      fish.tick = 0;
      continue;
    }
    fish.tick += dt * 1000;
    while (fish.tick + 0.0001 >= stats.tickMs && fish.hp > 0) {
      fish.tick -= stats.tickMs;
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
  return events;
}
export function reconcileBalance(state: GameState, balance: Balance): void {
  for (const id of SKILL_IDS)
    state.levels[id] = Math.min(state.levels[id], balance.skills[id].max);
  for (const fish of state.fish) {
    const fraction = fish.hp / fish.maxHp;
    fish.maxHp = balance.species[fish.species].hp;
    fish.hp = Math.max(0.01, fraction * fish.maxHp);
    fish.tick = 0;
  }
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
    const s = JSON.parse(raw) as GameState;
    if (
      !s ||
      s.version !== 1 ||
      !s.levels ||
      !s.player ||
      typeof s.rod !== "boolean" ||
      typeof s.inCamp !== "boolean" ||
      typeof s.restockReady !== "boolean"
    )
      return null;
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
      !finite(s.tripTotal, 1, 150) ||
      !Number.isInteger(s.tripTotal)
    )
      return null;
    if (
      !finite(s.player.x, 70, 1080) ||
      !finite(s.player.y, 150, 620) ||
      (s.player.x > 750 && (s.player.y < 381 || s.player.y > 440))
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
        !finite(f.x, 1150, 1880) ||
        !finite(f.y, 160, 610) ||
        !finite(f.phase, 0, Math.PI * 2) ||
        !finite(f.hp, 0.0001, 100000) ||
        !finite(f.maxHp, f.hp, 100000) ||
        !finite(f.tick, 0, 10000)
      )
        return null;
      ids.add(f.id);
    }
    reconcileBalance(s, balance);
    return s;
  } catch {
    return null;
  }
}
