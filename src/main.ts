import "./style.css";
import { loadAssets } from "./assets.ts";
import { AudioManager } from "./audio.ts";
import {
  freshBalance,
  SKILLS,
  SKILL_IDS,
  SPAWN_SKILLS,
  SPAWN_CAP,
  isSpawnSkill,
  validateBalance,
  type Balance,
  type SkillId,
} from "./config.ts";
import { icon } from "./icons.ts";
import {
  BALANCE_KEY,
  getStats,
  newGame,
  parseSave,
  purchaseRod,
  purchaseSkill,
  reconcileBalance,
  SAVE_KEY,
  skillCost,
  skillRequirement,
  spawnCapReached,
  spawnTrip,
  type GameState,
} from "./model.ts";
import { BUILDING_PLOTS, STATIONS, VIEW_H, VIEW_W } from "./layout.ts";
import { World } from "./world.ts";
import { mountSkillTree, TREE_NODES, type TreeCamera } from "./skill-tree.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
const devMode = import.meta.env.DEV;
const audio = new AudioManager();
let balance: Balance = freshBalance();
let storageWorking = true;
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    storageWorking = false;
    return null;
  }
}
function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    storageWorking = false;
  }
}
try {
  const stored = readStorage(BALANCE_KEY);
  if (stored) balance = validateBalance(JSON.parse(stored));
} catch {
  /* Recover from an invalid old balance. */
}
let state: GameState =
  parseSave(readStorage(SAVE_KEY), balance) ?? newGame(balance);
audio.enabled = readStorage("stillwater.sound") !== "off";
let reducedMotion = readStorage("stillwater.motion") === "reduced";
let world: World;
let currentDialog = "";
let selectedSkill: SkillId = "population";
let treeCamera: TreeCamera | null = null;
let destroySkillTree: (() => void) | undefined;
let toastTimer = 0;
let lastZone = state.inCamp;
let lastTotal = state.caught;
let lastStamina = state.stamina;
let uiSignature = "";
let returnFocus: HTMLElement | null = null;
const money = (n: number): string =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const assetUrl = (name: string) =>
  `${import.meta.env.BASE_URL}assets/${name}.png`;
const item = (
  kind: "rod" | "goldrod" | "fish" | "perch" | "koi" | "trout",
  size = "normal",
) => `<span class="pixel-item ${kind} ${size}" aria-hidden="true"></span>`;

app.innerHTML = `
  <main class="game-shell">
    <h1 class="sr-only">Stillwater</h1>
    <section class="game-stage" aria-label="Stillwater game world">
      <canvas id="world" tabindex="0" aria-label="Fishing pond above your base. Move with WASD or arrow keys, hover over fish to catch them, and walk down to the skill tree, shop, and three empty building plots."></canvas>
      <header class="topbar">
        <div class="wallet" aria-label="Wallet"><span class="coin-dot" aria-hidden="true">${icon("coin", 24)}</span><strong id="money" aria-live="polite">$0</strong></div>
        <div class="header-actions"><button class="icon-button" data-action="journal" aria-label="Open field guide" title="Field guide">${icon("book")}</button><button class="icon-button" data-action="sound" aria-label="Mute sound" title="Toggle sound"></button><button class="icon-button" data-action="settings" aria-label="Open settings" title="Settings">${icon("settings")}</button>${devMode ? `<button class="icon-button dev-button" data-action="editor" aria-label="Edit balance" title="Edit balance (F2)">${icon("edit")}</button>` : ""}</div>
      </header>
      <div class="trip-card" aria-label="Stamina"><div class="trip-count">${icon("bolt", 20)}<strong id="stamina-left">10</strong><span>/ <span id="stamina-max">10</span></span></div><div class="trip-progress" id="stamina-meter" role="progressbar" aria-label="Stamina" aria-valuemin="0"><span id="trip-progress"></span></div></div>
      <button class="world-sign tree-sign" data-travel="tree" aria-label="Walk to the skill tree">${icon("tree", 20)}<span>Skills</span>${icon("arrow", 12)}</button>
      <button class="world-sign shop-sign" data-travel="shop" aria-label="Walk to the tackle shop">${icon("bag", 20)}<span>Rod shop</span>${icon("arrow", 12)}</button>
      ${BUILDING_PLOTS.map((_, index) => `<div class="building-plot-label" data-plot="${index}" aria-label="Empty building plot ${index + 1}. To be revealed." hidden><span class="plot-mystery">?</span><span>To be revealed</span></div>`).join("")}
      <button class="travel-sign" id="travel-sign" data-travel="camp">${icon("down", 16)} Base <kbd>S</kbd></button>
      <div class="interaction-hint" id="interaction-hint" hidden></div>
      <div class="trip-ended" id="trip-ended" role="status" hidden><h2>Out of stamina</h2><button class="primary-button" data-travel="camp">${icon("home", 18)} Base ${icon("down", 16)}</button></div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div class="loading-screen" id="loading"><span class="loading-fish">${icon("fish", 48)}</span><h2>Loading pond…</h2></div>
      <div class="touch-controls" aria-label="Touch movement controls"><button data-direction="a" aria-label="Walk left">←</button><div><button data-direction="w" aria-label="Walk up">↑</button><button data-direction="s" aria-label="Walk down">↓</button></div><button data-direction="d" aria-label="Walk right">→</button></div>
      <span class="save-status" id="save-status" role="status" hidden></span>
    </section>
  </main>
  <dialog id="modal" aria-labelledby="modal-title"></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;
const modal = $<HTMLDialogElement>("#modal");
const canvas = $<HTMLCanvasElement>("#world");
function save(): void {
  writeStorage(SAVE_KEY, JSON.stringify(state));
  const status = $("#save-status");
  status.hidden = storageWorking;
  status.textContent = storageWorking
    ? ""
    : "Storage unavailable · this session only";
}
function toast(message: string): void {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("visible"), 3100);
}
function updateSound(): void {
  const button = $<HTMLButtonElement>('[data-action="sound"]');
  button.innerHTML = icon(audio.enabled ? "volume" : "muted");
  button.setAttribute(
    "aria-label",
    audio.enabled ? "Mute sound" : "Enable sound",
  );
  button.setAttribute("aria-pressed", String(audio.enabled));
}
function updateUI(force = false): void {
  const signature = JSON.stringify([
    state.money,
    state.fish.length,
    state.caught,
    state.levels,
    state.inCamp,
    state.trip,
    state.rod,
    state.stamina,
    state.maxStamina,
    balance,
  ]);
  if (!force && signature === uiSignature) return;
  uiSignature = signature;
  $("#money").textContent = money(state.money);
  $("#stamina-left").textContent = String(state.stamina);
  $("#stamina-max").textContent = String(state.maxStamina);
  $("#trip-progress").style.width =
    `${(state.stamina / state.maxStamina) * 100}%`;
  $("#stamina-meter").setAttribute("aria-valuenow", String(state.stamina));
  $("#stamina-meter").setAttribute("aria-valuemax", String(state.maxStamina));
  $(".trip-card").classList.toggle(
    "low-stamina",
    state.stamina <= state.maxStamina * 0.3,
  );
  $(".game-stage").classList.toggle("in-camp", state.inCamp);
  $(".trip-card").hidden = state.inCamp;
  $("#trip-ended").hidden = state.stamina > 0 || state.inCamp;
  const travel = $("#travel-sign");
  travel.dataset.travel = state.inCamp ? "lake" : "camp";
  travel.innerHTML = state.inCamp
    ? `${icon("up", 16)} Pond <kbd>W</kbd>`
    : `${icon("down", 16)} Base <kbd>S</kbd>`;
  if (state.inCamp !== lastZone) {
    lastZone = state.inCamp;
    save();
  }
  if (state.caught > lastTotal) {
    lastTotal = state.caught;
    save();
    $("#money").classList.remove("coin-pop");
    void $("#money").offsetWidth;
    $("#money").classList.add("coin-pop");
  }
  if (state.stamina !== lastStamina) {
    lastStamina = state.stamina;
    save();
  }
}

function openDialog(name: string, content: string, wide = false): void {
  if (!world) return;
  const activeButton =
    modal.open && document.activeElement instanceof HTMLButtonElement
      ? document.activeElement
      : null;
  const focusSelector = activeButton?.dataset.skill
    ? `[data-skill="${activeButton.dataset.skill}"]`
    : activeButton?.dataset.action
      ? `[data-action="${activeButton.dataset.action}"]`
      : null;
  if (!modal.open)
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  world.paused = true;
  world.stopWalking();
  currentDialog = name;
  destroySkillTree?.();
  destroySkillTree = undefined;
  modal.className = `dialog ${wide ? "wide-dialog" : ""} ${name}-dialog`;
  modal.innerHTML = content;
  if (!modal.open) modal.showModal();
  else if (focusSelector) {
    const target = modal.querySelector<HTMLButtonElement>(focusSelector);
    const fallback = modal.querySelector<HTMLButtonElement>(
      ".skill-node.selected, .close-button",
    );
    (target && !target.disabled ? target : fallback)?.focus({
      preventScroll: true,
    });
  }
}
function closeDialog(): void {
  modal.close();
}
modal.addEventListener("close", () => {
  destroySkillTree?.();
  destroySkillTree = undefined;
  if (world) {
    world.paused = false;
    world.clearInput();
  }
  currentDialog = "";
  save();
  returnFocus?.focus({ preventScroll: true });
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
const dialogHeader = (eyebrow: string, title: string, subtitle = "") =>
  `<div class="dialog-heading"><div>${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ""}<h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div><button class="close-button" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>`;
const shopHeader = (title: string, symbol: string) =>
  `<div class="dialog-heading shop-heading"><h2 id="modal-title">${icon(symbol, 24)} ${title}</h2><div class="wallet dialog-wallet" aria-label="Available coins"><span class="coin-dot" aria-hidden="true">${icon("coin", 24)}</span><strong aria-live="polite">${money(state.money)}</strong></div><button class="close-button" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>`;
function skillEffect(id: SkillId, next = false): string {
  const clone = structuredClone(state);
  if (next) clone.levels[id]++;
  const stats = getStats(clone, balance);
  if (isSpawnSkill(id))
    return `${stats.spawnRates[SPAWN_SKILLS.indexOf(id) + 1]}% spawn`;
  switch (id) {
    case "population":
      return `${stats.population} fish / school`;
    case "damage":
      return `${num(stats.damage)} damage / tick`;
    case "speed":
      return `${(stats.tickMs / 1000).toFixed(2)}s between ticks`;
    case "radius":
      return `${num(stats.radius)}px cast radius`;
    case "stamina":
      return `${stats.stamina} stamina`;
  }
}
function openSkills(): void {
  if (!state.inCamp) {
    world.goTo("tree");
    return;
  }
  const id = selectedSkill,
    skill = SKILLS[id],
    level = state.levels[id];
  const cost = skillCost(id, level, balance);
  const maxed = level >= balance.skills[id].max;
  const capped = spawnCapReached(id, state, balance);
  const requirement = skillRequirement(id, state);
  const affordable = state.money >= cost && !requirement && !maxed && !capped;
  const advancedRate = 100 - getStats(state, balance).spawnRates[0];
  const visual = (skillId: SkillId, size: number) =>
    isSpawnSkill(skillId)
      ? item(skillId, "node-fish")
      : icon(SKILLS[skillId].icon, size);
  openDialog(
    "skills",
    `${shopHeader("Skills", "tree")}
    <div class="skills-body"><div class="skill-map" tabindex="0" role="group" aria-label="Skill tree. Drag to pan, pinch or scroll to zoom. Arrow keys pan; plus and minus zoom; Home fits the tree.">
      <canvas class="skill-connections" aria-hidden="true"></canvas>
      <div class="skill-map-content">${SKILL_IDS.map((skillId) => {
        const info = SKILLS[skillId],
          locked = skillRequirement(skillId, state),
          lvl = state.levels[skillId];
        const point = TREE_NODES[skillId];
        const chance = isSpawnSkill(skillId)
          ? `${getStats(state, balance).spawnRates[SPAWN_SKILLS.indexOf(skillId) + 1]}%`
          : `${lvl} / ${balance.skills[skillId].max}`;
        return `<button class="skill-node ${selectedSkill === skillId ? "selected" : ""} ${locked ? "locked" : ""} ${lvl > 0 ? "learned" : ""}" style="left:${point.x}px;top:${point.y}px" data-skill="${skillId}" aria-label="${info.name}, level ${lvl}${isSpawnSkill(skillId) ? `, ${chance} spawn chance` : ""}${locked ? ", " + locked : ""}" aria-pressed="${selectedSkill === skillId}"><span class="node-icon">${visual(skillId, 28)}</span><strong>${info.name}</strong><span class="node-level">${locked ? icon("lock", 10) + " " : ""}${chance}</span>${!locked && !spawnCapReached(skillId, state, balance) && lvl < balance.skills[skillId].max && state.money >= skillCost(skillId, lvl, balance) ? '<span class="node-affordable" aria-label="Upgrade available">+</span>' : ""}</button>`;
      }).join("")}</div>
      <div class="tree-controls" role="group" aria-label="Canvas controls"><button class="icon-button" data-tree-control="out" aria-label="Zoom out" title="Zoom out">−</button><button class="icon-button" data-tree-control="fit" aria-label="Fit skill tree" title="Fit skill tree">${icon("radius", 20)}</button><button class="icon-button" data-tree-control="in" aria-label="Zoom in" title="Zoom in">+</button></div>
    </div><div class="skill-detail"><div class="skill-detail-heading"><span class="detail-icon">${visual(id, 32)}</span><div><div class="level-tag">LVL ${level} / ${balance.skills[id].max}</div><h3>${skill.name}</h3></div></div><div class="effect-comparison"><span>NOW<strong>${skillEffect(id)}</strong></span>${!maxed && !capped ? `${icon("arrow", 16)}<span>NEXT<strong>${skillEffect(id, true)}</strong></span>` : `<span class="maxed-label">${capped ? "80% CAP" : "MAX LEVEL"}</span>`}</div>${isSpawnSkill(id) ? `<div class="spawn-budget" aria-label="Combined advanced fish spawn chance">Shared: ${advancedRate}% / ${SPAWN_CAP}%</div>` : ""}<div class="skill-buy-area">${requirement ? `<p class="purchase-note">${icon("lock", 12)} ${requirement}</p>` : ""}<button class="primary-button purchase-button" data-action="buy-skill" ${!affordable ? "disabled" : ""}>${maxed ? `${icon("check", 18)} Max level` : capped ? "Spawn cap reached" : `${icon("bolt", 18)} Upgrade <strong>${money(cost)}</strong>`}</button></div></div></div>`,
    true,
  );
  destroySkillTree = mountSkillTree(
    $(".skill-map"),
    treeCamera,
    (skillId) => !skillRequirement(skillId, state),
    (camera) => {
      treeCamera = camera;
    },
  );
}
function openShop(): void {
  if (!state.inCamp) {
    world.goTo("shop");
    return;
  }
  const affordable = state.money >= balance.rod.cost;
  openDialog(
    "shop",
    `${shopHeader("Rod shop", "bag")}
    <div class="rod-product"><div class="rod-illustration">${item("goldrod", "large")}<span class="rod-spark one">✦</span><span class="rod-spark two">✧</span><span class="eyebrow">MASTERWORK</span></div><div class="rod-description"><span class="level-tag">EQUIPMENT</span><h3>The gilded reed</h3><div class="rod-perk">${icon("hook", 21)}<span><strong>${num(balance.rod.multiplier)}× total damage</strong><small>Multiplies your hook upgrades, too.</small></span></div><button class="primary-button purchase-button" data-action="buy-rod" ${state.rod || !affordable ? "disabled" : ""}>${state.rod ? `${icon("check", 18)} Equipped` : `Equip rod <strong>${money(balance.rod.cost)}</strong>`}</button><span class="balance-note">${state.rod ? "Rod equipped." : `${money(state.money)} saved of ${money(balance.rod.cost)}`}</span><div class="shop-progress"><span style="width:${Math.min(100, (state.money / balance.rod.cost) * 100)}%"></span></div></div></div>
    <div class="dialog-footer"><span>${icon("check", 14)} Equips automatically.</span><button class="text-button" data-action="back-to-lake">Pond ${icon("up", 16)}</button></div>`,
    true,
  );
}
function openJournal(): void {
  const stats = getStats(state, balance);
  openDialog(
    "journal",
    `${dialogHeader("", "Field guide", `${state.collection.filter((n) => n > 0).length} / 4 species discovered`)}
    <div class="loadout"><div class="loadout-rod">${item(state.rod ? "goldrod" : "rod")}<span class="eyebrow">EQUIPPED<strong>${state.rod ? "The gilded reed" : "The beginner's rod"}</strong></span></div><div class="loadout-stats"><span>${icon("hook", 16)}<strong>${num(stats.damage)}</strong> damage</span><span>${icon("bolt", 16)}<strong>${(stats.tickMs / 1000).toFixed(2)}s</strong> / tick</span><span>${icon("radius", 16)}<strong>${num(stats.radius)}px</strong> radius</span></div></div>
    <div class="journal-grid">${balance.species.map((fish, i) => `<article class="fish-entry ${stats.spawnRates[i] === 0 ? "undiscovered" : ""}"><div class="fish-portrait">${item(["fish", "perch", "koi", "trout"][i] as "fish", "large")}${stats.spawnRates[i] === 0 ? `<span class="portrait-lock">${icon("lock", 16)}</span>` : ""}</div><h3>${fish.name}</h3><div class="fish-facts"><span>${icon("coin", 14)} ${money(fish.value)}</span><span>${icon("hook", 14)} ${num(fish.hp)} HP</span></div><div class="journal-count">${stats.spawnRates[i]}% spawn · ${num(state.collection[i])} caught</div></article>`).join("")}</div><div class="journal-summary"><span>ALL-TIME CATCHES<strong>${num(state.caught)}</strong></span><span>TOTAL EARNED<strong>${money(state.earned)}</strong></span><span>FISHING TRIPS<strong>${num(state.trip)}</strong></span></div>`,
    true,
  );
}
function openSettings(): void {
  openDialog(
    "settings",
    `${dialogHeader("", "Settings")}<div class="settings-content"><label class="setting-row"><span><strong>Sound effects</strong><small>Soft notes for ticks, catches, and upgrades.</small></span><input type="checkbox" id="sound-setting" ${audio.enabled ? "checked" : ""}></label><label class="setting-row"><span><strong>Reduce motion</strong><small>Reduce water shimmer, clouds, and catch particles.</small></span><input type="checkbox" id="motion-setting" ${reducedMotion ? "checked" : ""}></label><div class="how-to"><h3>How to play</h3><p>Use the <b>direction pad</b>, <b>WASD</b>, or <b>arrow keys</b> to move. Tap a path or destination sign to walk there.</p><p>At the end of the dock, <b>hold a fish</b> to catch it, or hover with a mouse. Catches earn coins automatically. Each damage tick uses <b>1 stamina</b>, even when it hits several fish.</p><p>Walk down to base and tap <b>Skills</b> or <b>Rod shop</b> to upgrade. Clearing the pond brings a new school without restoring stamina. At <b>0 stamina</b>, the trip ends. Visit base and return to start a new trip with full stamina. Your progress saves in this browser.</p></div><div class="credits">CraftPix pixel art · Stillwater<br>Mobile: portrait recommended. Desktop: press E to interact.</div></div>`,
  );
  $("#sound-setting").addEventListener("change", (e) => {
    audio.enabled = (e.target as HTMLInputElement).checked;
    writeStorage("stillwater.sound", audio.enabled ? "on" : "off");
    audio.unlock();
    updateSound();
  });
  $("#motion-setting").addEventListener("change", (e) => {
    reducedMotion = (e.target as HTMLInputElement).checked;
    world.reducedMotion = reducedMotion;
    writeStorage("stillwater.motion", reducedMotion ? "reduced" : "full");
  });
}
const numericField = (
  label: string,
  name: string,
  value: number,
  min = 0,
  step = "any",
  max = 10000000,
): string =>
  `<label class="editor-field"><span>${label}</span><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
function openEditor(): void {
  if (!devMode) return;
  openDialog(
    "editor",
    `${dialogHeader("DEVELOPER TOOLS · LIVE BALANCE", "Find the sweet spot.", "Changes apply immediately and save to this browser. Population and stamina changes start next trip.")}
    <form id="balance-form"><div class="editor-scroll"><section class="editor-section"><div class="editor-section-heading"><h3>The starting cast</h3><span>BASE STATS</span></div><div class="editor-fields">${numericField("Starting fish", "base.population", balance.base.population, 1, "1", 100)}${numericField("Starting stamina", "base.stamina", balance.base.stamina, 1, "1", 10000)}${numericField("Damage per tick", "base.damage", balance.base.damage, 0.1, "any", 10000)}${numericField("Tick interval (ms)", "base.tickMs", balance.base.tickMs, 80, "any", 10000)}${numericField("Cursor radius (px)", "base.radius", balance.base.radius, 10, "any", 200)}</div></section>
    <section class="editor-section"><div class="editor-section-heading"><h3>Room to grow</h3><span>SKILL COSTS & EFFECTS</span></div><div class="editor-skill-table"><div class="editor-table-head"><span>SKILL</span><span>BASE COST $</span><span>COST ×</span><span>FLAT LEVELS</span><span>EFFECT / LVL</span><span>MAX LVL</span></div>${SKILL_IDS.map(
      (id) => {
        const b = balance.skills[id];
        return `<div class="editor-skill-row"><span><strong>${SKILLS[id].name}</strong><small>${SKILLS[id].unit}</small></span>${numericField(`${SKILLS[id].name} base cost`, `skills.${id}.cost`, b.cost, 1)}${numericField(`${SKILLS[id].name} cost multiplier`, `skills.${id}.growth`, b.growth, 1, "any", 10)}${numericField(`${SKILLS[id].name} flat levels`, `skills.${id}.flatLevels`, b.flatLevels, 0, "1", 100)}${numericField(`${SKILLS[id].name} effect`, `skills.${id}.amount`, b.amount, id === "speed" || isSpawnSkill(id) || id === "population" || id === "stamina" ? 1 : 0.1, isSpawnSkill(id) || id === "population" || id === "stamina" ? "1" : "any", id === "speed" ? 75 : isSpawnSkill(id) ? SPAWN_CAP : 100)}${numericField(`${SKILLS[id].name} maximum level`, `skills.${id}.max`, b.max, 1, "1", 100)}</div>`;
      },
    ).join(
      "",
    )}</div><p class="editor-help">Price = base cost × multiplier<sup>max(0, level − max(0, flat levels − 1))</sup>, rounded up to the next $10. Quick hands reduces the interval by its percentage each level; the minimum interval is 80ms. Cast radius caps at 220px; population caps at 150. Stamina caps at 10,000; advanced fish share an 80% cap. Raising spawn effects clamps purchased levels in tree order to stay within that cap.</p></section>
    <section class="editor-section"><div class="editor-section-heading"><h3>Life in the lake</h3><span>FISH ECONOMY</span></div><div class="editor-fish-grid">${balance.species.map((fish, i) => `<div class="editor-fish"><h4>${fish.name}</h4>${numericField("Health", `species.${i}.hp`, fish.hp, 0.1, "any", 100000)}${numericField("Value ($)", `species.${i}.value`, fish.value, 1)}</div>`).join("")}</div><p class="editor-help">Each species skill adds its percentage to the spawn chance. Advanced fish share an 80% cap; minnows keep the remainder. Existing fish keep their health percentage when health changes.</p></section>
    <section class="editor-section"><div class="editor-section-heading"><h3>The gilded reed</h3><span>SHOP</span></div><div class="editor-fields two-fields">${numericField("Rod price ($)", "rod.cost", balance.rod.cost, 1, "any", 100000000)}${numericField("Damage multiplier", "rod.multiplier", balance.rod.multiplier, 1, "any", 1000)}</div></section>
    <section class="editor-section sandbox-section"><div><h3>Playtest shortcuts</h3><p>Only changes this save. Keep your balance settings.</p></div><div class="sandbox-buttons"><button type="button" class="secondary-button" data-action="grant">+$1,000</button><button type="button" class="secondary-button" data-action="restock">Restock lake</button><button type="button" class="secondary-button danger-text" data-action="reset-save">New save</button></div></section>
    </div><div class="editor-bottom"><div id="editor-message" role="status">${icon("edit", 14)} Your game is paused while you edit.</div><div class="editor-buttons"><button type="button" class="text-button" data-action="default-balance">Restore defaults</button><button type="button" class="secondary-button" data-action="import-balance">Import</button><button type="button" class="secondary-button" data-action="export-balance">Export JSON</button><button type="submit" class="primary-button">${icon("check", 17)} Apply changes</button></div></div></form><input id="balance-file" type="file" accept=".json,application/json" hidden>`,
    true,
  );
  $("#balance-form").addEventListener("submit", (e) => {
    e.preventDefault();
    applyEditor();
  });
  $("#balance-file").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = validateBalance(JSON.parse(await file.text()));
      setBalance(parsed);
      openEditor();
      editorMessage("Balance imported and applied.");
    } catch (error) {
      editorMessage(
        error instanceof Error ? error.message : "Invalid balance file.",
        true,
      );
    }
  });
}
function editorMessage(message: string, error = false): void {
  const el = $("#editor-message");
  if (el) {
    el.textContent = message;
    el.classList.toggle("error", error);
  }
}
function setBalance(next: Balance): void {
  balance = next;
  world.balance = balance;
  reconcileBalance(state, balance);
  writeStorage(BALANCE_KEY, JSON.stringify(balance));
  save();
  updateUI(true);
}
function draftBalance(): Balance {
  const draft = structuredClone(balance) as unknown as Record<string, unknown>;
  for (const [key, raw] of new FormData($<HTMLFormElement>("#balance-form"))) {
    const path = key.split(".");
    let obj = draft;
    for (let i = 0; i < path.length - 1; i++)
      obj = obj[path[i]] as Record<string, unknown>;
    obj[path[path.length - 1]] = raw === "" ? NaN : Number(raw);
  }
  return validateBalance(draft);
}
function applyEditor(): boolean {
  try {
    const next = draftBalance();
    setBalance(next);
    editorMessage("Applied & saved. Close the editor to try your changes.");
    audio.play("buy");
    return true;
  } catch (error) {
    editorMessage(
      error instanceof Error
        ? error.message
        : "Check the values and try again.",
      true,
    );
    return false;
  }
}
function confirmReset(): void {
  openDialog(
    "reset",
    `${dialogHeader("A FRESH LITTLE START", "Cast from the beginning?", "This resets your wallet, catches, upgrades, and current trip.")}<div class="reset-content"><p>Your custom balance settings will stay. This replaces the saved progress in this browser.</p><div class="reset-actions"><button class="secondary-button" data-action="editor">Keep fishing</button><button class="primary-button" data-action="confirm-reset">Start a new save</button></div></div>`,
  );
}

document.addEventListener("pointerdown", () => audio.unlock(), { once: true });
document.addEventListener("keydown", () => audio.unlock(), { once: true });
document.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!button || button.disabled || !world) return;
  audio.unlock();
  if (button.dataset.travel) {
    if (modal.open) closeDialog();
    world.goTo(button.dataset.travel as "camp" | "lake" | "tree" | "shop");
    return;
  }
  if (button.dataset.skill) {
    selectedSkill = button.dataset.skill as SkillId;
    audio.play("click");
    openSkills();
    return;
  }
  switch (button.dataset.action) {
    case "close":
      closeDialog();
      break;
    case "journal":
      openJournal();
      break;
    case "settings":
      openSettings();
      break;
    case "sound":
      audio.enabled = !audio.enabled;
      writeStorage("stillwater.sound", audio.enabled ? "on" : "off");
      updateSound();
      if (audio.enabled) {
        audio.unlock();
        audio.play("catch");
      }
      break;
    case "editor":
      openEditor();
      break;
    case "buy-skill":
      if (purchaseSkill(state, selectedSkill, balance)) {
        audio.play("buy");
        save();
        updateUI();
        openSkills();
      }
      break;
    case "buy-rod":
      if (purchaseRod(state, balance)) {
        audio.play("buy");
        save();
        updateUI();
        openShop();
      }
      break;
    case "back-to-lake":
      closeDialog();
      world.goTo("lake");
      break;
    case "grant":
      if (devMode) {
        state.money += 1000;
        save();
        updateUI();
        editorMessage(`Added $1,000. Pocket: ${money(state.money)}.`);
      }
      break;
    case "restock":
      if (devMode) {
        spawnTrip(state, balance);
        save();
        updateUI();
        editorMessage(
          `Restocked ${state.fish.length} fish and refilled stamina for this playtest.`,
        );
      }
      break;
    case "reset-save":
      if (devMode) confirmReset();
      break;
    case "confirm-reset":
      if (devMode) {
        state = newGame(balance);
        world.replaceState(state);
        lastTotal = 0;
        save();
        updateUI(true);
        closeDialog();
        toast("A fresh start. The lake is all yours.");
      }
      break;
    case "default-balance":
      if (devMode) {
        setBalance(freshBalance());
        openEditor();
        editorMessage("Default balance restored. Your progress is kept.");
      }
      break;
    case "import-balance":
      if (devMode) $<HTMLInputElement>("#balance-file").click();
      break;
    case "export-balance":
      if (devMode && applyEditor()) {
        const blob = new Blob([JSON.stringify(balance, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "stillwater-balance.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        editorMessage("Current balance applied and exported.");
      }
      break;
  }
});
window.addEventListener("keydown", (e) => {
  if (
    !world ||
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.repeat
  )
    return;
  if (e.key === "F2" && devMode) {
    e.preventDefault();
    currentDialog === "editor" ? closeDialog() : openEditor();
  }
  if (e.key.toLowerCase() === "b" && !modal.open) {
    e.preventDefault();
    world.goTo("tree");
  }
  if (e.key === "Escape" && !modal.open) {
    e.preventDefault();
    openSettings();
  }
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-direction]",
)) {
  button.addEventListener("pointerdown", (e) => {
    if (!world || modal.open) return;
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    world.stopWalking();
    world.keys.add(button.dataset.direction!);
  });
  button.addEventListener("pointerup", () =>
    world?.keys.delete(button.dataset.direction!),
  );
  button.addEventListener("pointercancel", () =>
    world?.keys.delete(button.dataset.direction!),
  );
}
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerType === "touch" && world) world.pointer = null;
});
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save();
});
setInterval(save, 5000);
updateSound();
updateUI(true);

async function boot(): Promise<void> {
  try {
    const assets = await loadAssets();
    world = new World(canvas, state, balance, assets);
    world.reducedMotion = reducedMotion;
    world.onChange = () => updateUI();
    world.onStation = (station) =>
      station === "tree" ? openSkills() : openShop();
    world.onTravel = toast;
    world.onEvent = (event) => audio.play(event.type);
    $("#loading").remove();
    world.start();
    // Positioned DOM signs remain accessible while following the world camera.
    const signs = () => {
      for (const [id, station] of Object.entries(STATIONS)) {
        const sign = $(`.${id}-sign`),
          y = station.y + 2 - world.cameraY;
        sign.style.left = `${(station.x / VIEW_W) * 100}%`;
        sign.style.top = `${(y / VIEW_H) * 100}%`;
        sign.hidden = !state.inCamp || y < 135 || y > VIEW_H - 65;
      }
      BUILDING_PLOTS.forEach((plot, index) => {
        const label = $(`[data-plot="${index}"]`);
        const y = plot.y - world.cameraY;
        label.style.left = `${(plot.x / VIEW_W) * 100}%`;
        label.style.top = `${(y / VIEW_H) * 100}%`;
        label.hidden = !state.inCamp || y < 100 || y > VIEW_H - 70;
      });
      const nearest = world.nearestStation();
      const hint = $("#interaction-hint");
      hint.hidden = !nearest || modal.open;
      if (nearest) {
        hint.innerHTML = `<kbd>E</kbd> ${nearest === "tree" ? "Skills" : "Rod shop"}`;
        hint.style.left = `${(state.player.x / VIEW_W) * 100}%`;
        hint.style.top = `${((state.player.y + 49 - world.cameraY) / VIEW_H) * 100}%`;
      }
      requestAnimationFrame(signs);
    };
    requestAnimationFrame(signs);
    save();
  } catch (error) {
    $("#loading").innerHTML =
      `${icon("fish", 40)}<h2>The tackle box got stuck.</h2><p>Some game assets couldn’t load. Please reload to try again.</p><button class="primary-button" id="retry">Try again</button>`;
    console.error(error);
    $("#retry").addEventListener("click", () => location.reload());
  }
}
void boot();

// Read-only observability for local balance work and browser smoke tests.
// Vite removes this branch from production builds.
if (devMode)
  Object.defineProperty(window, "__STILLWATER__", {
    get: () => ({
      state: structuredClone(state),
      balance: structuredClone(balance),
      stats: getStats(state, balance),
      cameraY: world?.cameraY,
      paused: world?.paused,
      dialog: currentDialog,
      ready: !!world,
    }),
  });

// Keep sprite paths local and bundler-base aware, including subdirectory deployments.
document.documentElement.style.setProperty(
  "--items-url",
  `url("${assetUrl("items")}")`,
);
