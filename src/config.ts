export const SKILL_IDS = [
  "population",
  "damage",
  "speed",
  "radius",
  "species",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];
export interface SkillBalance {
  cost: number;
  growth: number;
  flatLevels: number;
  amount: number;
  max: number;
}
export interface Species {
  name: string;
  hp: number;
  value: number;
  weight: number;
  sprite: number;
  color: string;
}
export interface Balance {
  base: { population: number; damage: number; tickMs: number; radius: number };
  skills: Record<SkillId, SkillBalance>;
  species: Species[];
  rod: { cost: number; multiplier: number };
}
export const DEFAULT_BALANCE: Balance = {
  base: { population: 3, damage: 1, tickMs: 650, radius: 34 },
  skills: {
    population: { cost: 1, growth: 1.28, flatLevels: 3, amount: 1, max: 40 },
    damage: { cost: 4, growth: 1.5, flatLevels: 0, amount: 1, max: 30 },
    speed: { cost: 5, growth: 1.65, flatLevels: 0, amount: 12, max: 12 },
    radius: { cost: 6, growth: 1.55, flatLevels: 0, amount: 8, max: 15 },
    species: { cost: 12, growth: 3, flatLevels: 0, amount: 1, max: 3 },
  },
  species: [
    {
      name: "Silver minnow",
      hp: 4,
      value: 1,
      weight: 65,
      sprite: 1,
      color: "#accdd1",
    },
    {
      name: "Sunset perch",
      hp: 8,
      value: 3,
      weight: 30,
      sprite: 2,
      color: "#e9bd73",
    },
    {
      name: "Rosefin koi",
      hp: 16,
      value: 9,
      weight: 20,
      sprite: 4,
      color: "#e8a294",
    },
    {
      name: "Golden trout",
      hp: 30,
      value: 20,
      weight: 12,
      sprite: 3,
      color: "#ddcc79",
    },
  ],
  rod: { cost: 1000, multiplier: 5 },
};
export const SKILLS: Record<
  SkillId,
  {
    name: string;
    subtitle: string;
    description: string;
    icon: string;
    unit: string;
  }
> = {
  population: {
    name: "Pond life",
    subtitle: "A livelier little lake",
    description:
      "A little feed goes a long way. Invite more fish to the lake at the start of every trip.",
    icon: "fish",
    unit: "fish per level",
  },
  damage: {
    name: "Stronger hook",
    subtitle: "Make every nibble count",
    description:
      "A sharper hook takes a little more patience out of every catch. Deal more damage with each tick.",
    icon: "hook",
    unit: "damage per level",
  },
  speed: {
    name: "Quick hands",
    subtitle: "Find your rhythm",
    description:
      "Keep the line moving. Shorten the time between damage ticks while your cursor hovers over a fish.",
    icon: "bolt",
    unit: "% faster per level",
  },
  radius: {
    name: "Wider cast",
    subtitle: "A little more reach",
    description:
      "Cast a wider circle. Every fish inside your cursor takes damage, so a well-placed cast can catch a whole school.",
    icon: "radius",
    unit: "radius px per level",
  },
  species: {
    name: "New arrivals",
    subtitle: "Something worth waiting for",
    description:
      "Make the lake a home for rarer fish. They take more work to catch, but bring a much better payday.",
    icon: "sparkles",
    unit: "species per level",
  },
};
export function freshBalance(): Balance {
  return structuredClone(DEFAULT_BALANCE);
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function number(
  value: unknown,
  min: number,
  max: number,
  label: string,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${label} must be ${integer ? "a whole number" : "a number"} between ${min} and ${max}.`,
    );
  }
  return value;
}
/** Copies only known fields and rejects invalid imported / edited balances. */
export function validateBalance(input: unknown): Balance {
  if (
    !object(input) ||
    !object(input.base) ||
    !object(input.skills) ||
    !object(input.rod) ||
    !Array.isArray(input.species) ||
    input.species.length !== 4
  )
    throw new Error(
      "Use a Stillwater balance file with base, skills, four species, and rod settings.",
    );
  const base = {
    population: number(input.base.population, 1, 100, "Starting fish", true),
    damage: number(input.base.damage, 0.1, 10000, "Base damage"),
    tickMs: number(input.base.tickMs, 80, 10000, "Tick interval"),
    radius: number(input.base.radius, 10, 200, "Cursor radius"),
  };
  const skills = {} as Balance["skills"];
  for (const id of SKILL_IDS) {
    const skill = input.skills[id];
    if (!object(skill)) throw new Error(`Missing ${id} settings.`);
    skills[id] = {
      cost: number(skill.cost, 1, 1000000, `${SKILLS[id].name} cost`),
      growth: number(skill.growth, 1, 10, `${SKILLS[id].name} cost growth`),
      flatLevels: number(
        skill.flatLevels,
        0,
        100,
        `${SKILLS[id].name} flat levels`,
        true,
      ),
      amount: number(
        skill.amount,
        id === "speed" ? 1 : 0.1,
        id === "speed" ? 75 : id === "species" ? 3 : 100,
        `${SKILLS[id].name} effect`,
        id === "species" || id === "population",
      ),
      max: number(
        skill.max,
        1,
        id === "species" ? 3 : 100,
        `${SKILLS[id].name} maximum`,
        true,
      ),
    };
  }
  const species = input.species.map((fish, i) => {
    if (!object(fish)) throw new Error(`Missing fish ${i + 1}.`);
    return {
      ...DEFAULT_BALANCE.species[i],
      hp: number(fish.hp, 0.1, 100000, "Fish health"),
      value: number(fish.value, 1, 1000000, "Fish value"),
      weight: number(fish.weight, 1, 100, "Fish spawn weight"),
    };
  });
  return {
    base,
    skills,
    species,
    rod: {
      cost: number(input.rod.cost, 1, 10000000, "Rod price"),
      multiplier: number(input.rod.multiplier, 1, 1000, "Rod multiplier"),
    },
  };
}
