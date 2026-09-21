import "./style.css";
import { loadAssets } from "./assets.ts";
import { AudioManager } from "./audio.ts";
import {
  freshBalance,
  SKILLS,
  SKILL_IDS,
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
  spawnTrip,
  type GameState,
} from "./model.ts";
import { BUILDING_PLOTS, STATIONS, VIEW_H, VIEW_W } from "./layout.ts";
import { World } from "./world.ts";

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
let toastTimer = 0;
let lastZone = state.inCamp;
let lastTotal = state.caught;
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
  <header class="topbar">
    <a class="brand" href="#" aria-label="Stillwater home">${icon("fish", 34)}<span>stillwater<span class="brand-note">A LITTLE CATCH. A LITTLE GROWTH.</span></span></a>
    <nav class="place-nav" aria-label="Travel"><button data-travel="lake" class="nav-button">${icon("fish", 17)} The pond</button><button data-travel="camp" class="nav-button">${icon("home", 17)} Your base</button></nav>
    <div class="header-actions"><button class="icon-button" data-action="journal" aria-label="Open field guide" title="Field guide">${icon("book")}</button><button class="icon-button" data-action="sound" aria-label="Mute sound" title="Toggle sound"></button><button class="icon-button" data-action="settings" aria-label="Open settings" title="Settings">${icon("settings")}</button>${devMode ? `<span class="header-divider"></span><button class="dev-button" data-action="editor" aria-label="Edit balance" title="Edit balance (F2)">${icon("edit", 15)}<span>Edit balance</span><small>DEV</small></button>` : ""}</div>
  </header>
  <main class="game-shell">
    <div class="above-world"><div class="session-label"><span class="status-dot"></span><span id="session-title">A good day to go fishing.</span></div><div class="wallet" aria-label="Wallet"><span class="wallet-label">YOUR POCKET</span><span class="coin-dot">$</span><strong id="money" aria-live="polite">$0</strong></div></div>
    <section class="game-stage" aria-label="Stillwater game world">
      <canvas id="world" tabindex="0" aria-label="Fishing pond above your base. Move with WASD or arrow keys, hover over fish to catch them, and walk down to the skill tree, shop, and three empty building plots."></canvas>
      <div class="location-label"><span class="eyebrow" id="location-eyebrow">A PLACE TO SLOW DOWN</span><h1 id="location-name">Stillwater pond<span class="small-spark">✦</span></h1><span class="location-weather">${icon("sun", 13)} <span>A little sun. A little luck.</span></span></div>
      <div class="trip-card"><div class="trip-top"><span class="eyebrow">FISHING TRIP <span id="trip-number">01</span></span><span class="live-dot"></span></div><div class="trip-count">${icon("fish", 24)}<strong id="fish-left">3</strong><span>in the pond</span></div><div class="trip-progress"><span id="trip-progress"></span></div><div class="trip-bottom"><span id="trip-caught">0 / 3 caught</span><span id="trip-value">$1 per minnow</span></div></div>
      <button class="world-sign tree-sign" data-travel="tree" aria-label="Walk to the skill tree">${icon("tree", 17)}<span>The old willow<small>SKILL TREE</small></span><span class="sign-arrow">↗</span></button>
      <button class="world-sign shop-sign" data-travel="shop" aria-label="Walk to the tackle shop">${icon("bag", 16)}<span>Tackle & twine<small>ROD SHOP</small></span><span class="sign-arrow">↗</span></button>
      ${BUILDING_PLOTS.map((_, index) => `<div class="building-plot-label" data-plot="${index}" aria-label="Empty building plot ${index + 1}. To be revealed." hidden><span class="plot-mystery">?</span><span>To be revealed</span><small>FUTURE BUILDING</small></div>`).join("")}
      <div class="world-tip" id="world-tip"></div>
      <button class="travel-sign" id="travel-sign" data-travel="camp">${icon("down", 17)} Back to base <kbd>S</kbd></button>
      <div class="interaction-hint" id="interaction-hint" hidden></div>
      <div class="pond-empty" id="pond-empty" hidden><span class="empty-icon">${icon("check", 24)}</span><span class="eyebrow">A LITTLE WELL EARNED</span><h2>A good day's catch.</h2><p>Head down to base, plant an upgrade,<br>and see what the next trip brings.</p><button class="primary-button" data-travel="tree">Visit the skill tree ${icon("down", 17)}</button></div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div class="loading-screen" id="loading"><span class="loading-fish">${icon("fish", 48)}</span><h2>Finding a quiet spot…</h2><p>Unpacking your tackle box.</p></div>
      <div class="touch-controls" aria-label="Touch movement controls"><button data-direction="a" aria-label="Walk left">←</button><div><button data-direction="w" aria-label="Walk up">↑</button><button data-direction="s" aria-label="Walk down">↓</button></div><button data-direction="d" aria-label="Walk right">→</button></div>
    </section>
    <section class="equipment-bar" aria-label="Fishing stats"><div class="equipped">${item("rod")}<div><span class="eyebrow">YOUR TRUSTY COMPANION</span><strong id="rod-name">The beginner's rod</strong></div><span class="equipped-tag" id="rod-tag">STARTER</span></div><div class="stat">${icon("hook", 19)}<span><strong id="stat-damage">1</strong><small>damage / tick</small></span></div><div class="stat">${icon("bolt", 18)}<span><strong id="stat-speed">0.65s</strong><small>tick interval</small></span></div><div class="stat">${icon("radius", 19)}<span><strong id="stat-radius">34px</strong><small>cast radius</small></span></div><div class="lifetime">${icon("fish", 21)}<span><strong id="total-caught">0</strong><small>all-time catches</small></span></div></section>
    <footer class="game-footer"><div class="control-hints"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <span>move</span></span><i></i><span>${icon("mouse", 15)} Hover to fish</span><i></i><span><kbd>E</kbd> interact</span><i></i><span>Click a path to walk</span></div><span class="save-status" id="save-status">${icon("check", 13)} Progress saved locally</span><span class="version">STILLWATER <b>v0.1</b></span></footer>
  </main>
  <dialog id="modal" aria-labelledby="modal-title"></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;
const modal = $<HTMLDialogElement>("#modal");
const canvas = $<HTMLCanvasElement>("#world");
function save(): void {
  writeStorage(SAVE_KEY, JSON.stringify(state));
  $("#save-status").innerHTML = storageWorking
    ? `${icon("check", 13)} Progress saved locally`
    : `${icon("save", 13)} Storage unavailable · this session only`;
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
    balance,
  ]);
  if (!force && signature === uiSignature) return;
  uiSignature = signature;
  const stats = getStats(state, balance);
  $("#money").textContent = money(state.money);
  $("#fish-left").textContent = String(state.fish.length);
  $("#trip-number").textContent = String(state.trip).padStart(2, "0");
  $("#trip-caught").textContent =
    `${state.tripCaught} / ${state.tripTotal} caught`;
  $("#trip-value").textContent =
    `${money(balance.species[0].value)} per minnow`;
  $("#trip-progress").style.width =
    `${(state.tripCaught / state.tripTotal) * 100}%`;
  $("#stat-damage").textContent = num(stats.damage);
  $("#stat-speed").textContent = `${(stats.tickMs / 1000).toFixed(2)}s`;
  $("#stat-radius").textContent = `${num(stats.radius)}px`;
  $("#total-caught").textContent = num(state.caught);
  $("#rod-name").textContent = state.rod
    ? "The gilded reed"
    : "The beginner's rod";
  $("#rod-tag").textContent = state.rod ? "MASTERWORK" : "STARTER";
  $(".equipped .pixel-item").classList.toggle("goldrod", state.rod);
  document
    .querySelectorAll<HTMLElement>('[data-travel="lake"], [data-travel="camp"]')
    .forEach((el) => {
      if (el.classList.contains("nav-button")) {
        const active = el.dataset.travel === (state.inCamp ? "camp" : "lake");
        el.classList.toggle("active", active);
        el.setAttribute("aria-current", active ? "location" : "false");
      }
    });
  $("#location-name").innerHTML =
    `${state.inCamp ? "Your little base" : "Stillwater pond"}<span class="small-spark">✦</span>`;
  $("#location-eyebrow").textContent = state.inCamp
    ? "GROW SOMETHING GOOD"
    : "A PLACE TO SLOW DOWN";
  $("#session-title").textContent = state.inCamp
    ? "Big things start with little upgrades."
    : "A good day to go fishing.";
  $(".game-stage").classList.toggle("in-camp", state.inCamp);
  $(".trip-card").hidden = state.inCamp;
  $("#pond-empty").hidden = state.fish.length !== 0 || state.inCamp;
  const travel = $("#travel-sign");
  travel.dataset.travel = state.inCamp ? "lake" : "camp";
  travel.innerHTML = state.inCamp
    ? `${icon("up", 17)} Up to the pond <kbd>W</kbd>`
    : `${icon("down", 17)} Down to your base <kbd>S</kbd>`;
  if (state.inCamp)
    $("#world-tip").innerHTML =
      `<span class="tip-icon">${icon("home", 20)}</span><div><strong>A little room to grow.</strong><p>Two familiar places. Three possibilities.<br><b>${stats.population} fish</b> on your next trip north.</p></div>`;
  else if (state.caught === 0)
    $("#world-tip").innerHTML =
      `<span class="tip-icon">${icon("mouse", 21)}</span><div><strong>Patience pays.</strong><p>Hold your cursor over a fish.<br>Every little tick brings it closer.</p></div>`;
  else
    $("#world-tip").innerHTML =
      `<span class="tip-icon">${icon("fish", 21)}</span><div><strong>${state.levels.population === 0 ? "Your first little fortune." : "Cast. Catch. Grow. Repeat."}</strong><p>${state.levels.population === 0 ? "Three minnows. Three dollars.<br>Walk down to grow at the old willow." : `Catch the pond, then head down to base.<br>There’s always a little more to grow.`}</p></div>`;
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
const dialogHeader = (eyebrow: string, title: string, subtitle: string) =>
  `<div class="dialog-heading"><div><span class="eyebrow">${eyebrow}</span><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="close-button" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>`;
function skillEffect(id: SkillId, next = false): string {
  const clone = structuredClone(state);
  if (next) clone.levels[id]++;
  const stats = getStats(clone, balance);
  switch (id) {
    case "population":
      return `${stats.population} fish / trip`;
    case "damage":
      return `${num(stats.damage)} damage / tick`;
    case "speed":
      return `${(stats.tickMs / 1000).toFixed(2)}s between ticks`;
    case "radius":
      return `${num(stats.radius)}px cast radius`;
    case "species":
      return `${stats.species} fish species`;
  }
}
function openSkills(): void {
  if (!state.inCamp) {
    world.goTo("tree");
    return;
  }
  const id = selectedSkill,
    skill = SKILLS[id],
    level = state.levels[id],
    cost = skillCost(id, level, balance);
  const maxed = level >= balance.skills[id].max,
    requirement = skillRequirement(id, state);
  const affordable = state.money >= cost && !requirement && !maxed;
  openDialog(
    "skills",
    `${dialogHeader("THE OLD WILLOW · SKILL TREE", "Room to grow.", "A few coins. A stronger cast. A lake full of possibility.")}
    <div class="skills-body"><div class="skill-map"><span class="map-caption">IT ALL STARTS WITH A LITTLE POND LIFE</span>
      <svg class="skill-connections" viewBox="0 0 510 460" preserveAspectRatio="none" aria-hidden="true"><path d="M255 111V155H120V183M255 155H390V183M120 269V319M255 155V300H390V319"/><path class="unlocked" d="${state.levels.population > 0 ? "M255 111V155H120V183M255 155H390V183" : ""}${state.levels.damage > 0 ? "M120 269V319" : ""}${state.levels.population >= 3 ? "M255 155V300H390V319" : ""}"/></svg>
      ${SKILL_IDS.map((skillId) => {
        const info = SKILLS[skillId],
          locked = skillRequirement(skillId, state),
          lvl = state.levels[skillId];
        return `<button class="skill-node node-${skillId} ${selectedSkill === skillId ? "selected" : ""} ${locked ? "locked" : ""} ${lvl > 0 ? "learned" : ""}" data-skill="${skillId}" aria-label="${info.name}, level ${lvl}${locked ? ", " + locked : ""}" aria-pressed="${selectedSkill === skillId}"><span class="node-icon">${icon(info.icon, 29)}</span><strong>${info.name}</strong><span class="node-level">${locked ? icon("lock", 11) + " " : ""}${lvl} / ${balance.skills[skillId].max}</span>${!locked && lvl < balance.skills[skillId].max && state.money >= skillCost(skillId, lvl, balance) ? '<span class="node-affordable"></span>' : ""}</button>`;
      }).join("")}
      <div class="map-legend"><span class="status-dot"></span> Ready to grow <span class="legend-line"></span> Follow your own pace</div>
    </div><div class="skill-detail"><span class="detail-icon">${icon(skill.icon, 32)}</span><div class="level-tag">LEVEL ${level} / ${balance.skills[id].max}</div><h3>${skill.name}</h3><em>${skill.subtitle}</em><p>${skill.description}</p><div class="effect-comparison"><span>RIGHT NOW<strong>${skillEffect(id)}</strong></span>${!maxed ? `${icon("arrow", 19)}<span>AFTER UPGRADE<strong>${skillEffect(id, true)}</strong></span>` : '<span class="maxed-label">Fully grown. Nicely done.</span>'}</div>${id === "species" && !maxed ? `<div class="next-fish">${item(["fish", "perch", "koi", "trout"][Math.min(3, getStats(state, balance).species)] as "fish")}<span>Next arrival<strong>${balance.species[Math.min(3, getStats(state, balance).species)].name}</strong></span></div>` : ""}<div class="skill-buy-area"><div class="purchase-note">${requirement ?? (maxed ? "This skill has reached its full potential." : id === "population" && level < 3 ? "Your first three levels are just $1 each." : "One small upgrade, every future trip.")}</div><button class="primary-button purchase-button" data-action="buy-skill" ${!affordable ? "disabled" : ""}>${maxed ? `${icon("check", 17)} Fully grown` : `${icon("coin", 18)} Upgrade <strong>${money(cost)}</strong>`}</button><span class="balance-note">${!maxed && !requirement && state.money < cost ? `${money(cost - state.money)} more to go · ` : ""}In your pocket: ${money(state.money)}</span></div></div></div>
    <div class="dialog-footer"><span>${icon("save", 14)} Every upgrade stays with you.</span><button class="text-button" data-action="back-to-lake">Up to the pond ${icon("up", 16)}</button></div>`,
    true,
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
    `${dialogHeader("TACKLE & TWINE · THE VILLAGE SHOP", "Made for the long cast.", "Good tools. Quiet mornings. Something to save up for.")}
    <div class="shop-note"><span class="merchant-portrait"></span><p>“That old rod’s got heart. But this one?<br>This one’s got a little magic in it.”<small>— EDWIN, YOUR LOCAL TACKLE ENTHUSIAST</small></p></div>
    <div class="rod-product"><div class="rod-illustration">${item("goldrod", "large")}<span class="rod-spark one">✦</span><span class="rod-spark two">✧</span><span class="eyebrow">MASTERWORK NO. 001</span></div><div class="rod-description"><span class="level-tag">A LITTLE GOLD GOES A LONG WAY</span><h3>The gilded reed</h3><p>Light as a reed. Strong as your ambitions. A rod for the angler who’s ready for bigger things.</p><div class="rod-perk">${icon("hook", 21)}<span><strong>${num(balance.rod.multiplier)}× total damage</strong><small>Multiplies your hook upgrades, too.</small></span></div><button class="primary-button purchase-button" data-action="buy-rod" ${state.rod || !affordable ? "disabled" : ""}>${state.rod ? `${icon("check", 18)} Equipped & ready` : `Make it yours <strong>${money(balance.rod.cost)}</strong>`}</button><span class="balance-note">${state.rod ? "Here’s to your next big catch." : `${money(state.money)} saved of ${money(balance.rod.cost)}`}</span><div class="shop-progress"><span style="width:${Math.min(100, (state.money / balance.rod.cost) * 100)}%"></span></div></div></div>
    <div class="dialog-footer"><span>${icon("check", 14)} Your rod equips automatically.</span><button class="text-button" data-action="back-to-lake">Up to the pond ${icon("up", 16)}</button></div>`,
    true,
  );
}
function openJournal(): void {
  const unlocked = getStats(state, balance).species;
  openDialog(
    "journal",
    `${dialogHeader("NOTES FROM THE LAKE · FIELD GUIDE", "A few familiar fins.", `Every catch has a story. You’ve met ${state.collection.filter((n) => n > 0).length} of 4 species.`)}
    <div class="journal-grid">${balance.species.map((fish, i) => `<article class="fish-entry ${i >= unlocked ? "undiscovered" : ""}"><div class="fish-portrait">${item(["fish", "perch", "koi", "trout"][i] as "fish", "large")}${i >= unlocked ? `<span class="portrait-lock">${icon("lock", 16)}</span>` : ""}</div><span class="eyebrow">${["A HUMBLE BEGINNING", "A FLASH OF SUNSET", "A LITTLE RARER", "THE GOLDEN HOUR"][i]}</span><h3>${fish.name}</h3><p>${["Small fish. Big potential.", "A warm glow in the shallows.", "A quiet treasure among the reeds.", "Some things are worth the wait."][i]}</p><div class="fish-facts"><span>${icon("coin", 14)} ${money(fish.value)}</span><span>${icon("hook", 14)} ${num(fish.hp)} HP</span></div><div class="journal-count">${i >= unlocked ? `Unlock New arrivals level ${i}` : `${num(state.collection[i])} caught so far`}</div></article>`).join("")}</div><div class="journal-summary"><span>ALL-TIME CATCHES<strong>${num(state.caught)}</strong></span><span>TOTAL EARNED<strong>${money(state.earned)}</strong></span><span>FISHING TRIPS<strong>${num(state.trip)}</strong></span></div>`,
    true,
  );
}
function openSettings(): void {
  openDialog(
    "settings",
    `${dialogHeader("MAKE YOURSELF AT HOME", "The little things.", "Settle in. This is your little corner of the world.")}<div class="settings-content"><label class="setting-row"><span><strong>Sounds of a good catch</strong><small>Soft notes for ticks, catches, and upgrades.</small></span><input type="checkbox" id="sound-setting" ${audio.enabled ? "checked" : ""}></label><label class="setting-row"><span><strong>A little less motion</strong><small>Reduce water shimmer, clouds, and catch particles.</small></span><input type="checkbox" id="motion-setting" ${reducedMotion ? "checked" : ""}></label><div class="how-to"><h3>A quick field note</h3><p>Move with <b>WASD</b> or the <b>arrow keys</b>. You can also click a path or a destination sign to walk there.</p><p>Stand at the end of the dock and <b>hover over fish</b>. Catches automatically turn into money. Walk down to your base, then click the willow or shop; press <b>E</b> when nearby.</p><p>Walk north to the dock to restock the pond. Three empty plots in your base are reserved for future buildings. Each trip begins with your upgraded fish population. Your catches, upgrades, and current trip save in this browser.</p></div><div class="credits">CraftPix pixel art · Built with TypeScript & a little patience.<br>Keyboard and mouse recommended. Touch: hold a fish to catch it.</div></div>`,
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
  max = 1000000,
): string =>
  `<label class="editor-field"><span>${label}</span><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
function openEditor(): void {
  if (!devMode) return;
  openDialog(
    "editor",
    `${dialogHeader("DEVELOPER TOOLS · LIVE BALANCE", "Find the sweet spot.", "Changes apply immediately and save to this browser. Population changes start next trip.")}
    <form id="balance-form"><div class="editor-scroll"><section class="editor-section"><div class="editor-section-heading"><h3>The starting cast</h3><span>BASE STATS</span></div><div class="editor-fields">${numericField("Starting fish", "base.population", balance.base.population, 1, "1", 100)}${numericField("Damage per tick", "base.damage", balance.base.damage, 0.1, "any", 10000)}${numericField("Tick interval (ms)", "base.tickMs", balance.base.tickMs, 80, "any", 10000)}${numericField("Cursor radius (px)", "base.radius", balance.base.radius, 10, "any", 200)}</div></section>
    <section class="editor-section"><div class="editor-section-heading"><h3>Room to grow</h3><span>SKILL COSTS & EFFECTS</span></div><div class="editor-skill-table"><div class="editor-table-head"><span>SKILL</span><span>BASE COST $</span><span>COST ×</span><span>FLAT LEVELS</span><span>EFFECT / LVL</span><span>MAX LVL</span></div>${SKILL_IDS.map(
      (id) => {
        const b = balance.skills[id];
        return `<div class="editor-skill-row"><span><strong>${SKILLS[id].name}</strong><small>${SKILLS[id].unit}</small></span>${numericField(`${SKILLS[id].name} base cost`, `skills.${id}.cost`, b.cost, 1)}${numericField(`${SKILLS[id].name} cost multiplier`, `skills.${id}.growth`, b.growth, 1, "any", 10)}${numericField(`${SKILLS[id].name} flat levels`, `skills.${id}.flatLevels`, b.flatLevels, 0, "1", 100)}${numericField(`${SKILLS[id].name} effect`, `skills.${id}.amount`, b.amount, id === "speed" || id === "species" || id === "population" ? 1 : 0.1, id === "species" || id === "population" ? "1" : "any", id === "speed" ? 75 : id === "species" ? 3 : 100)}${numericField(`${SKILLS[id].name} maximum level`, `skills.${id}.max`, b.max, 1, "1", id === "species" ? 3 : 100)}</div>`;
      },
    ).join(
      "",
    )}</div><p class="editor-help">Price = base cost × multiplier<sup>max(0, level − max(0, flat levels − 1))</sup>, rounded up. Quick hands reduces the interval by its percentage each level; the minimum interval is 80ms. Cast radius caps at 220px; population caps at 150.</p></section>
    <section class="editor-section"><div class="editor-section-heading"><h3>Life in the lake</h3><span>FISH ECONOMY</span></div><div class="editor-fish-grid">${balance.species.map((fish, i) => `<div class="editor-fish"><h4>${fish.name}</h4>${numericField("Health", `species.${i}.hp`, fish.hp, 0.1, "any", 100000)}${numericField("Value ($)", `species.${i}.value`, fish.value, 1)}${numericField("Spawn weight", `species.${i}.weight`, fish.weight, 1, "any", 100)}</div>`).join("")}</div><p class="editor-help">Spawn weights are relative among unlocked species. Every trip guarantees one of your newest species. Existing fish keep their health percentage when health changes.</p></section>
    <section class="editor-section"><div class="editor-section-heading"><h3>The gilded reed</h3><span>SHOP</span></div><div class="editor-fields two-fields">${numericField("Rod price ($)", "rod.cost", balance.rod.cost, 1, "any", 10000000)}${numericField("Damage multiplier", "rod.multiplier", balance.rod.multiplier, 1, "any", 1000)}</div></section>
    <section class="editor-section sandbox-section"><div><h3>Playtest shortcuts</h3><p>Only changes this save. Keep your balance settings.</p></div><div class="sandbox-buttons"><button type="button" class="secondary-button" data-action="grant">+$100</button><button type="button" class="secondary-button" data-action="restock">Restock lake</button><button type="button" class="secondary-button danger-text" data-action="reset-save">New save</button></div></section>
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
        state.money += 100;
        save();
        updateUI();
        editorMessage(`Added $100. Pocket: ${money(state.money)}.`);
      }
      break;
    case "restock":
      if (devMode) {
        spawnTrip(state, balance);
        save();
        updateUI();
        editorMessage(`Restocked ${state.fish.length} fish for this playtest.`);
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
$(".brand").addEventListener("click", (e) => {
  e.preventDefault();
  if (world && !modal.open) world.goTo("lake");
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
        hint.innerHTML = `<kbd>E</kbd> ${nearest === "tree" ? "Grow your skills" : "Browse the shop"}`;
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
document.documentElement.style.setProperty(
  "--merchant-url",
  `url("${assetUrl("merchant")}")`,
);
