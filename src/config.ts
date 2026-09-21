export const SKILL_IDS = [
  "population",
  "damage",
  "speed",
  "radius",
  "stamina",
  "perch",
  "koi",
  "trout",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];
export const SPAWN_SKILLS = ["perch", "koi", "trout"] as const;
export type SpawnSkillId = (typeof SPAWN_SKILLS)[number];
export const SPAWN_CAP = 80;
export function isSpawnSkill(id: SkillId): id is SpawnSkillId {
  return SPAWN_SKILLS.some((spawnId) => spawnId === id);
}
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
  sprite: number;
  color: string;
}
export interface Balance {
  base: {
    population: number;
    stamina: number;
    damage: number;
    tickMs: number;
    radius: number;
  };
  skills: Record<SkillId, SkillBalance>;
  species: Species[];
  rod: { cost: number; multiplier: number };
}
export const DEFAULT_BALANCE: Balance = {
  base: { population: 3, stamina: 10, damage: 1, tickMs: 2000, radius: 34 },
  skills: {
    population: { cost: 10, growth: 1.28, flatLevels: 3, amount: 1, max: 40 },
    damage: { cost: 40, growth: 1.5, flatLevels: 0, amount: 1, max: 30 },
    speed: { cost: 50, growth: 1.65, flatLevels: 0, amount: 12, max: 12 },
    radius: { cost: 60, growth: 1.55, flatLevels: 0, amount: 8, max: 15 },
    stamina: { cost: 10, growth: 1.28, flatLevels: 3, amount: 1, max: 40 },
    perch: { cost: 120, growth: 1.28, flatLevels: 0, amount: 5, max: 16 },
    koi: { cost: 360, growth: 1.28, flatLevels: 0, amount: 5, max: 16 },
    trout: { cost: 1080, growth: 1.28, flatLevels: 0, amount: 5, max: 16 },
  },
  species: [
    {
      name: "Silver minnow",
      hp: 4,
      value: 10,
      sprite: 1,
      color: "#accdd1",
    },
    {
      name: "Sunset perch",
      hp: 8,
      value: 30,
      sprite: 2,
      color: "#e9bd73",
    },
    {
      name: "Rosefin koi",
      hp: 16,
      value: 90,
      sprite: 4,
      color: "#e8a294",
    },
    {
      name: "Golden trout",
      hp: 30,
      value: 200,
      sprite: 3,
      color: "#ddcc79",
    },
  ],
  rod: { cost: 10000, multiplier: 5 },
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
      "Invite more fish into each school. A wider school rewards a well-placed cast.",
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
  stamina: {
    name: "More stamina",
    subtitle: "",
    description: "Increase stamina by 1 per level.",
    icon: "bolt",
    unit: "stamina per level",
  },
  perch: {
    name: "Sunset perch",
    subtitle: "",
    description:
      "Increase perch spawn chance by 5 percentage points per level.",
    icon: "fish",
    unit: "% spawn chance per level",
  },
  koi: {
    name: "Rosefin koi",
    subtitle: "",
    description: "Increase koi spawn chance by 5 percentage points per level.",
    icon: "fish",
    unit: "% spawn chance per level",
  },
  trout: {
    name: "Golden trout",
    subtitle: "",
    description:
      "Increase trout spawn chance by 5 percentage points per level.",
    icon: "fish",
    unit: "% spawn chance per level",
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
    // Older balance exports predate stamina; keep their other custom settings.
    stamina: number(
      "stamina" in input.base
        ? input.base.stamina
        : DEFAULT_BALANCE.base.stamina,
      1,
      10000,
      "Starting stamina",
      true,
    ),
    damage: number(input.base.damage, 0.1, 10000, "Base damage"),
    tickMs: number(input.base.tickMs, 80, 10000, "Tick interval"),
    radius: number(input.base.radius, 10, 200, "Cursor radius"),
  };
  const skills = {} as Balance["skills"];
  const legacy = object(input.skills.species) && !("perch" in input.skills);
  const legacySpecies = legacy
    ? (input.skills.species as Record<string, unknown>)
    : null;
  for (const id of SKILL_IDS) {
    const skill =
      legacy && (id === "stamina" || isSpawnSkill(id))
        ? DEFAULT_BALANCE.skills[id]
        : input.skills[id];
    if (!object(skill)) throw new Error(`Missing ${id} settings.`);
    skills[id] = {
      cost:
        number(
          skill.cost,
          1,
          legacy ? 1000000 : 10000000,
          `${SKILLS[id].name} cost`,
        ) * (legacy && id !== "stamina" && !isSpawnSkill(id) ? 10 : 1),
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
        id === "speed" ? 75 : isSpawnSkill(id) ? SPAWN_CAP : 100,
        `${SKILLS[id].name} effect`,
        isSpawnSkill(id) || id === "population" || id === "stamina",
      ),
      max: number(skill.max, 1, 100, `${SKILLS[id].name} maximum`, true),
    };
    if (legacySpecies && isSpawnSkill(id)) {
      const cost = number(legacySpecies.cost, 1, 1000000, "New arrivals cost");
      const growth = number(
        legacySpecies.growth,
        1,
        10,
        "New arrivals cost growth",
      );
      skills[id].cost = Math.min(
        10000000,
        Math.ceil(cost * growth ** SPAWN_SKILLS.indexOf(id)) * 10,
      );
    }
  }
  const species = input.species.map((fish, i) => {
    if (!object(fish)) throw new Error(`Missing fish ${i + 1}.`);
    return {
      ...DEFAULT_BALANCE.species[i],
      hp: number(fish.hp, 0.1, 100000, "Fish health"),
      value:
        number(fish.value, 1, legacy ? 1000000 : 10000000, "Fish value") *
        (legacy ? 10 : 1),
    };
  });
  return {
    base,
    skills,
    species,
    rod: {
      cost:
        number(input.rod.cost, 1, legacy ? 10000000 : 100000000, "Rod price") *
        (legacy ? 10 : 1),
      multiplier: number(input.rod.multiplier, 1, 1000, "Rod multiplier"),
    },
  };
}
