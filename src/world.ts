import type { Assets } from "./assets.ts";
import type { Balance } from "./config.ts";
import {
  atFishingSpot,
  BUILDING_PLOTS,
  cameraYFor,
  CAMP_ENTRY_Y,
  CAMP_START,
  DOCK,
  inPond,
  isWalkable,
  LAKE_START,
  shoreY,
  STATIONS,
  VIEW_H,
  VIEW_W,
  walkingRoute,
  WORLD_H,
  type Point,
} from "./layout.ts";
import {
  enterCamp,
  enterLake,
  fishPosition,
  getStats,
  tickFishing,
  type GameEvent,
  type GameState,
} from "./model.ts";

type Station = keyof typeof STATIONS;
type Decoration = {
  image: string;
  x: number;
  y: number;
  scale: number;
  crop?: number[];
  maxHeight?: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  text?: string;
};

export class World {
  readonly canvas: HTMLCanvasElement;
  cameraY = 0;
  pointer: Point | null = null;
  keys = new Set<string>();
  paused = false;
  reducedMotion = false;
  moving = false;
  onChange: () => void = () => {};
  onEvent: (event: GameEvent) => void = () => {};
  onStation: (station: Station) => void = () => {};
  onTravel: (message: string) => void = () => {};
  private context: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private assets: Assets;
  private sprites: Record<string, HTMLCanvasElement> = {};
  private decorations: Decoration[] = [];
  private particles: Particle[] = [];
  private direction = 3;
  private route: Point[] = [];
  private destination: Station | null = null;
  private lastTime = 0;
  private waterTime = 0;
  private hoveredFish: number | null = null;
  private step = 0;
  // Preserve the proportions of pixel sprites even in a short browser viewport.
  private get spriteYScale(): number {
    return Math.max(
      0.35,
      Math.min(
        1.85,
        this.canvas.clientWidth / this.canvas.clientHeight / (VIEW_W / VIEW_H),
      ),
    );
  }

  constructor(
    canvas: HTMLCanvasElement,
    public state: GameState,
    public balance: Balance,
    assets: Assets,
  ) {
    this.canvas = canvas;
    this.assets = assets;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    this.context = canvas.getContext("2d")!;
    this.context.imageSmoothingEnabled = false;
    this.terrain = document.createElement("canvas");
    this.terrain.width = VIEW_W;
    this.terrain.height = WORLD_H;
    this.cameraY = cameraYFor(state.player);
    this.direction = state.inCamp ? 0 : 3;
    for (const [key, image] of Object.entries(assets))
      if (/^(Tree|Bush|Flower)/.test(key)) this.sprites[key] = this.trim(image);
    this.buildTerrain();
    this.buildDecorations();
    canvas.addEventListener("pointermove", (e) => this.updatePointer(e));
    canvas.addEventListener("pointerleave", () => {
      this.pointer = null;
    });
    canvas.addEventListener("pointerdown", (e) => {
      this.updatePointer(e);
      if (this.paused || !this.pointer) return;
      const point = this.worldPointer()!;
      const station = (Object.keys(STATIONS) as Station[]).find((id) => {
        const s = STATIONS[id];
        return (
          Math.abs(point.x - s.x) < (id === "shop" ? 114 : 90) &&
          point.y > s.y - 190 * this.spriteYScale &&
          point.y < s.y + 15
        );
      });
      if (station) {
        if (this.nearestStation() === station) this.onStation(station);
        else this.goTo(station);
        return;
      }
      if (isWalkable(point.x, point.y)) this.travelTo(point);
    });
    window.addEventListener("keydown", (e) => {
      if (
        this.paused ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const key = e.key.toLowerCase();
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
        ].includes(key)
      ) {
        e.preventDefault();
        this.keys.add(key);
        this.route = [];
        this.destination = null;
      }
      if (key === "e") this.interact();
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => this.clearInput());
    document.addEventListener("visibilitychange", () => {
      this.clearInput();
      this.lastTime = 0;
    });
  }
  start(): void {
    requestAnimationFrame(this.frame);
  }
  clearInput(): void {
    this.keys.clear();
    this.pointer = null;
  }
  stopWalking(): void {
    this.route = [];
    this.destination = null;
    this.clearInput();
  }
  replaceState(state: GameState): void {
    this.state = state;
    this.stopWalking();
    this.cameraY = cameraYFor(state.player);
    this.direction = state.inCamp ? 0 : 3;
    this.particles = [];
  }
  get targetFish(): number | null {
    return this.hoveredFish;
  }
  private updatePointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = {
      x: ((e.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((e.clientY - rect.top) / rect.height) * VIEW_H,
    };
  }
  worldPointer(): Point | null {
    return this.pointer
      ? { x: this.pointer.x, y: this.pointer.y + this.cameraY }
      : null;
  }
  private trim(image: HTMLImageElement): HTMLCanvasElement {
    const source = document.createElement("canvas");
    source.width = image.width;
    source.height = image.height;
    const ctx = source.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    let minX = image.width,
      minY = image.height,
      maxX = 0,
      maxY = 0;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++)
        if (data[(y * image.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    const result = document.createElement("canvas");
    result.width = maxX - minX + 1;
    result.height = maxY - minY + 1;
    result
      .getContext("2d")!
      .drawImage(
        source,
        minX,
        minY,
        result.width,
        result.height,
        0,
        0,
        result.width,
        result.height,
      );
    return result;
  }
  private seeded(seed: number): () => number {
    let n = seed;
    return () => {
      n = (n * 1664525 + 1013904223) >>> 0;
      return n / 4294967296;
    };
  }
  private buildTerrain(): void {
    const c = this.terrain.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    const rand = this.seeded(329);
    c.fillStyle = "#4f9499";
    c.fillRect(0, 0, VIEW_W, WORLD_H);
    for (let i = 0; i < 230; i++) {
      c.fillStyle = ["#51989c", "#4c9197", "#559b9e", "#509699"][i % 4];
      c.fillRect(
        Math.floor((rand() * VIEW_W) / 16) * 16,
        Math.floor((rand() * 700) / 8) * 8,
        48 + Math.floor(rand() * 8) * 16,
        16 + Math.floor(rand() * 5) * 8,
      );
    }
    // The southern shore leads straight down from the pond into the base.
    for (let x = 0; x < VIEW_W; x += 16) {
      const edge = shoreY(x);
      for (const [offset, color] of [
        [-32, "#69aaab"],
        [-18, "#8bc1b5"],
        [-7, "#c0c18d"],
        [0, "#657c49"],
        [7, "#8dab61"],
      ] as const) {
        c.fillStyle = color;
        c.fillRect(x, edge + offset, 16, WORLD_H - edge - offset);
      }
    }
    c.save();
    c.beginPath();
    c.moveTo(0, WORLD_H);
    for (let x = 0; x <= VIEW_W; x += 16) {
      c.lineTo(x, shoreY(x) + 12);
      c.lineTo(x + 16, shoreY(x) + 12);
    }
    c.lineTo(VIEW_W, WORLD_H);
    c.closePath();
    c.clip();
    for (let y = 640; y < WORLD_H; y += 32)
      for (let x = 0; x < VIEW_W; x += 32)
        c.drawImage(this.assets.ground, 144, 208, 16, 16, x, y, 32, 32);
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = ["#94ae62", "#7f9c52", "#a0b66b", "#87a459"][i % 4];
      c.fillRect(
        Math.floor((rand() * VIEW_W) / 2) * 2,
        640 + Math.floor((rand() * 800) / 2) * 2,
        2 + Math.floor(rand() * 4) * 2,
        2,
      );
    }
    // One central path, two working stations, and three spaces to grow into.
    c.lineCap = "round";
    c.lineJoin = "round";
    for (const [width, color] of [
      [90, "#94a362"],
      [66, "#b9b07f"],
      [48, "#c8bc91"],
    ] as const) {
      c.lineWidth = width;
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(640, 668);
      c.lineTo(640, 1140);
      c.moveTo(280, 1060);
      c.lineTo(1000, 1060);
      c.moveTo(335, 1060);
      c.lineTo(335, 1140);
      c.moveTo(945, 1060);
      c.lineTo(945, 1140);
      c.stroke();
    }
    for (let i = 0; i < 110; i++) {
      c.fillStyle = i % 2 ? "#b5a980" : "#d5c797";
      c.fillRect(623 + rand() * 32, 730 + rand() * 378, 4, 2);
      c.fillRect(280 + rand() * 720, 1043 + rand() * 32, 4, 2);
    }
    for (const plot of BUILDING_PLOTS) {
      const left = plot.x - 104,
        top = plot.y - 64;
      c.fillStyle = "#6e875538";
      c.fillRect(left + 8, top + 8, 192, 112);
      c.fillStyle = "#abb47848";
      c.fillRect(left + 12, top + 12, 184, 104);
      c.strokeStyle = "#e4dbab90";
      c.lineWidth = 2;
      c.setLineDash([7, 9]);
      c.strokeRect(left + 2, top + 2, 204, 120);
      c.setLineDash([]);
      for (const dx of [0, 204])
        for (const dy of [0, 120]) {
          c.fillStyle = "#526c3e50";
          c.fillRect(left + dx, top + dy + 5, 12, 4);
          c.fillStyle = "#88704c";
          c.fillRect(left + dx - 2, top + dy - 9, 5, 16);
          c.fillStyle = "#decc99";
          c.fillRect(left + dx - 2, top + dy - 10, 5, 4);
        }
    }
    c.restore();
    // Horizontal planks run across a north-facing pier; sprites stay upright.
    c.fillStyle = "#255e6650";
    c.fillRect(578, 469, 144, 286);
    c.fillStyle = "#655044";
    c.fillRect(574, 458, 132, 286);
    for (let y = 462; y < 742; y += 40)
      c.drawImage(this.assets.dock, 0, 8, 112, 40, 578, y, 124, 40);
    for (const x of [564, 702])
      for (const y of [452, 572, 696])
        c.drawImage(this.assets.dock, 56, 144, 9, 19, x, y, 18, 38);
    // Glimpses of a wooded far bank frame the open fishing water.
    for (const side of [0, 1]) {
      c.save();
      if (side) {
        c.translate(VIEW_W, 0);
        c.scale(-1, 1);
      }
      for (const [offset, color] of [
        [20, "#6dafac"],
        [8, "#bfbc85"],
        [0, "#829d55"],
      ] as const) {
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(310 + offset, 0);
        c.lineTo(230 + offset, 30 + offset);
        c.lineTo(130 + offset, 43 + offset);
        c.lineTo(65 + offset, 70 + offset);
        c.lineTo(0, 80 + offset);
        c.fill();
      }
      c.restore();
    }
    for (const [x, y] of [
      [165, 175],
      [198, 190],
      [1030, 170],
      [1070, 188],
      [1120, 544],
      [1085, 564],
      [230, 565],
      [255, 582],
      [814, 610],
    ]) {
      c.fillStyle = "#337d72";
      c.fillRect(x - 12, y + 2, 27, 8);
      c.fillStyle = "#81aa65";
      c.fillRect(x - 10, y - 2, 23, 8);
      c.fillRect(x - 6, y - 6, 15, 5);
      c.fillStyle = "#a9c97b";
      c.fillRect(x - 6, y - 5, 11, 2);
      c.fillStyle = "#4f9499";
      c.fillRect(x, y + 2, 3, 4);
    }
    for (const x of [84, 180, 354, 480, 805, 900, 1104, 1190]) {
      const y = shoreY(x) - 12;
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? "#547957" : "#849858";
        c.fillRect(x + i * 5, y - (i % 3) * 7, 3, 24);
        c.fillStyle = "#a89163";
        c.fillRect(x + i * 5 - 1, y - (i % 3) * 7 - 4, 5, 10);
      }
    }
  }
  private buildDecorations(): void {
    const add = (
      image: string,
      x: number,
      y: number,
      scale = 2,
      crop?: number[],
      maxHeight?: number,
    ) => this.decorations.push({ image, x, y, scale, crop, maxHeight });
    const rand = this.seeded(735);
    for (let y = 792; y < WORLD_H + 180; y += 106) {
      add(`Tree${1 + Math.floor(rand() * 4)}`, 35 + rand() * 24, y, 2.25);
      add(
        `Tree${1 + Math.floor(rand() * 4)}`,
        1218 + rand() * 34,
        y + 18,
        2.25,
      );
    }
    for (let x = 135; x < VIEW_W - 90; x += 94) {
      add(`Tree${1 + Math.floor(rand() * 4)}`, x, 1560 + rand() * 30, 2.3);
      if (x < 500 || x > 770) add("Bush3", x, 759 + rand() * 25, 1.4);
    }
    // Keep the working stations inside their row even in a short window.
    add("Tree1", STATIONS.tree.x, STATIONS.tree.y, 2.5, undefined, 244);
    add(
      "village",
      STATIONS.shop.x,
      STATIONS.shop.y,
      1.85,
      [12, 0, 104, 112],
      244,
    );
    add("village", 741, 751, 1.25, [166, 500, 29, 43]);
    add("village", 604, 709, 1.1, [0, 509, 30, 32]);
    for (const [x, y] of [
      [205, 1000],
      [460, 989],
      [800, 984],
      [1100, 999],
      [159, 1290],
      [1110, 1270],
    ])
      add("Bush1", x, y, 1.65);
    for (let i = 0; i < 45; i++) {
      const x = 140 + rand() * 990,
        y = 815 + rand() * 550;
      if (
        Math.abs(x - 640) < 90 ||
        (y > 1010 && y < 1320) ||
        (x > 815 && y < 1010)
      )
        continue;
      add(`Flower${1 + (i % 7)}`, x, y, 1.5);
    }
    for (let x = -20; x < 280; x += 66) {
      add(`Tree${1 + Math.floor(rand() * 3)}`, x, 43 - x * 0.12, 1.7);
      add(`Tree${1 + Math.floor(rand() * 3)}`, VIEW_W - x, 43 - x * 0.12, 1.7);
    }
  }
  private travelTo(point: Point): void {
    this.destination = null;
    this.route = walkingRoute(this.state.player, point);
  }

  goTo(place: "camp" | "lake" | Station): void {
    if (place === "lake") {
      this.travelTo(LAKE_START);
      this.onTravel("Taking the path to the dock…");
    } else if (place === "camp") {
      this.travelTo(CAMP_START);
      this.onTravel("Heading down to your base…");
    } else {
      const station = STATIONS[place];
      this.travelTo({ x: station.targetX, y: station.targetY });
      this.destination = place;
      this.onTravel(
        place === "tree"
          ? "Walking to the old willow…"
          : "Walking to the tackle shop…",
      );
    }
  }
  nearestStation(): Station | null {
    if (!this.state.inCamp) return null;
    for (const [id, s] of Object.entries(STATIONS))
      if (
        Math.hypot(
          this.state.player.x - s.targetX,
          this.state.player.y - s.targetY,
        ) < 100
      )
        return id as Station;
    return null;
  }
  interact(): void {
    const station = this.nearestStation();
    if (station) {
      this.stopWalking();
      this.onStation(station);
    }
  }
  private updateMovement(dt: number): void {
    let dx =
      Number(this.keys.has("d") || this.keys.has("arrowright")) -
      Number(this.keys.has("a") || this.keys.has("arrowleft"));
    let dy =
      Number(this.keys.has("s") || this.keys.has("arrowdown")) -
      Number(this.keys.has("w") || this.keys.has("arrowup"));
    const p = this.state.player;
    const distance = 238 * dt;
    if (!dx && !dy && this.route.length) {
      const target = this.route[0],
        length = Math.hypot(target.x - p.x, target.y - p.y);
      if (length < distance + 2) {
        p.x = target.x;
        p.y = target.y;
        this.route.shift();
        if (!this.route.length && this.destination) {
          const station = this.destination;
          this.destination = null;
          this.onStation(station);
        }
      } else {
        dx = (target.x - p.x) / length;
        dy = (target.y - p.y) / length;
      }
    }
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      let moved = false;
      if (isWalkable(p.x + dx * distance, p.y)) {
        p.x += dx * distance;
        moved = true;
      }
      if (isWalkable(p.x, p.y + dy * distance)) {
        p.y += dy * distance;
        moved = true;
      }
      if (!moved) this.route = [];
      this.direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 1) : dy > 0 ? 0 : 3;
      this.step += dt;
    }
    if (p.y >= CAMP_ENTRY_Y && !this.state.inCamp) {
      enterCamp(this.state);
      this.onChange();
    }
    if (atFishingSpot(p) && this.state.inCamp) {
      enterLake(this.state, this.balance);
      this.onChange();
    }
  }
  private frame = (now: number): void => {
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = now;
    if (!document.hidden && !this.paused) {
      this.state.playedSeconds += dt;
      this.waterTime += dt;
      this.updateMovement(dt);
      const events = tickFishing(
        this.state,
        this.balance,
        dt,
        this.worldPointer(),
      );
      for (const event of events) {
        this.particle(event);
        this.onEvent(event);
      }
      if (events.length) this.onChange();
    }
    const cameraTarget = cameraYFor(this.state.player);
    this.cameraY += (cameraTarget - this.cameraY) * Math.min(1, dt * 5);
    if (Math.abs(this.cameraY - cameraTarget) < 0.15)
      this.cameraY = cameraTarget;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.text) p.vy += 60 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.render();
    requestAnimationFrame(this.frame);
  };
  private particle(event: GameEvent): void {
    this.particles.push({
      x: event.x,
      y: event.y - 25,
      vx: 0,
      vy: -27,
      life: 1.15,
      maxLife: 1.15,
      color: event.type === "catch" ? "#ffe5a0" : "#fff9e8",
      text:
        event.type === "catch"
          ? `+$${event.amount}`
          : `−${Number(event.amount.toFixed(1))}`,
    });
    if (!this.reducedMotion)
      for (let i = 0; i < (event.type === "catch" ? 13 : 4); i++)
        this.particles.push({
          x: event.x,
          y: event.y,
          vx: (Math.random() - 0.5) * 110,
          vy: -25 - Math.random() * 70,
          life: 0.5 + Math.random() * 0.5,
          maxLife: 1,
          color: event.type === "catch" ? "#e9c980" : "#b1e1d5",
        });
  }
  private drawDecoration(d: Decoration): void {
    const c = this.context,
      sprite = this.sprites[d.image];
    if (d.y < this.cameraY - 40 || d.y > this.cameraY + VIEW_H + 400) return;
    const vertical = this.spriteYScale;
    const scale = Math.min(
      d.scale,
      (d.maxHeight ?? Infinity) /
        ((sprite?.height ?? d.crop?.[3] ?? 1) * vertical),
    );
    if (sprite)
      c.drawImage(
        sprite,
        Math.round(d.x - (sprite.width * scale) / 2),
        Math.round(d.y - sprite.height * scale * vertical),
        Math.round(sprite.width * scale),
        Math.round(sprite.height * scale * vertical),
      );
    else if (d.crop) {
      const [sx, sy, sw, sh] = d.crop;
      c.drawImage(
        this.assets[d.image],
        sx,
        sy,
        sw,
        sh,
        Math.round(d.x - (sw * scale) / 2),
        Math.round(d.y - sh * scale * vertical),
        sw * scale,
        sh * scale * vertical,
      );
    }
  }
  private drawPlayer(): void {
    const c = this.context,
      p = this.state.player;
    c.fillStyle = "#233e4540";
    c.beginPath();
    c.ellipse(p.x, p.y + 1, 17, 6, 0, 0, Math.PI * 2);
    c.fill();
    const mode = this.moving ? "walk" : "idle";
    // The north-facing idle row has four frames; later sheet cells are empty.
    const frame = this.moving
      ? Math.floor(this.step * 9) % 6
      : Math.floor(this.waterTime * 3) % 4;
    const vertical = this.spriteYScale;
    for (const part of ["body", "head"])
      c.drawImage(
        this.assets[`player-${mode}-${part}`],
        frame * 64,
        this.direction * 64,
        64,
        64,
        Math.round(p.x - 64),
        Math.round(p.y - 84 * vertical),
        128,
        128 * vertical,
      );
    if (!this.state.inCamp && atFishingSpot(p) && !this.moving) {
      const point = this.worldPointer();
      c.lineWidth = 3;
      c.strokeStyle = this.state.rod ? "#e2c784" : "#6b4535";
      c.beginPath();
      c.moveTo(p.x + 8, p.y - 18);
      c.lineTo(p.x + 34, p.y - 62);
      c.stroke();
      c.lineWidth = 1;
      c.strokeStyle = "#f3edcbb0";
      c.beginPath();
      c.moveTo(p.x + 34, p.y - 62);
      if (point && inPond(point) && !this.paused) {
        c.quadraticCurveTo((p.x + point.x) / 2, point.y - 85, point.x, point.y);
      } else {
        c.quadraticCurveTo(p.x + 44, p.y - 100, p.x + 24, p.y - 108);
      }
      c.stroke();
      if (!point || !inPond(point)) {
        c.fillStyle = "#f2e7bf";
        c.fillRect(p.x + 22, p.y - 111, 5, 6);
        c.fillStyle = "#d47e66";
        c.fillRect(p.x + 22, p.y - 108, 5, 3);
      }
    }
    if (this.route.length) {
      const target = this.route[this.route.length - 1];
      c.strokeStyle = "#ffefd280";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(target.x, target.y, 12, 5, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  private render(): void {
    const c = this.context;
    c.clearRect(0, 0, VIEW_W, VIEW_H);
    c.save();
    c.translate(0, -Math.round(this.cameraY));
    c.drawImage(this.terrain, 0, 0);
    // Shade the scenery before drawing fish so catch targets retain their contrast.
    c.fillStyle = "#081a36";
    c.globalAlpha = 0.32;
    c.fillRect(0, 0, VIEW_W, WORLD_H);
    c.globalAlpha = 1;
    const time = this.reducedMotion ? 0 : this.waterTime;
    for (let i = 0; i < 125; i++) {
      const x = 75 + ((i * 139.7) % 1130),
        y = 125 + ((i * 71.9) % 480);
      if (x > 555 && x < 724 && y > DOCK.top - 30) continue;
      c.globalAlpha = 0.12 + (Math.sin(time * 0.9 + i * 2.3) + 1) * 0.12;
      c.fillStyle = "#c2e5d6";
      c.fillRect(
        Math.floor(x + Math.sin(time * 0.4 + i) * 6),
        y,
        6 + (i % 4) * 5,
        2,
      );
      if (i % 5 === 0) c.fillRect(x + 8, y + 5, 9, 2);
    }
    c.globalAlpha = 1;
    // Soft, slow cloud shadows in the water.
    if (!this.reducedMotion) {
      c.fillStyle = "#2a6d7720";
      for (let i = 0; i < 4; i++) {
        const x = 160 + ((i * 281 + time * 4) % 980);
        c.beginPath();
        c.ellipse(x, 150 + i * 90, 95, 35, -0.15, 0, Math.PI * 2);
        c.fill();
      }
    }
    const stats = getStats(this.state, this.balance),
      pointer = this.worldPointer();
    this.hoveredFish = null;
    for (const fish of this.state.fish) {
      const pos = fishPosition(fish, this.state.playedSeconds);
      const active =
        !!pointer &&
        !this.paused &&
        !this.state.inCamp &&
        this.state.stamina > 0 &&
        atFishingSpot(this.state.player) &&
        Math.hypot(pos.x - pointer.x, pos.y - pointer.y) <= stats.radius + 12;
      if (active) this.hoveredFish = fish.id;
      c.fillStyle = "#1e56655a";
      c.beginPath();
      c.ellipse(pos.x, pos.y + 9, 23, 6, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = active ? "#d7ecd08a" : "#8dcac271";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(
        pos.x,
        pos.y + 10,
        34 + Math.sin(time * 1.7 + fish.phase) * 3,
        9,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
      const species = this.balance.species[fish.species];
      const animation = Math.floor(time * 2.5 + fish.phase) % 3;
      c.save();
      c.translate(Math.round(pos.x), Math.round(pos.y));
      if (Math.cos(fish.phase) > 0) c.scale(-1, 1);
      c.drawImage(
        this.assets[`fish-${species.sprite}`],
        animation * 32,
        0,
        32,
        32,
        -48,
        -51 * this.spriteYScale,
        96,
        96 * this.spriteYScale,
      );
      c.restore();
      if (active || fish.hp < fish.maxHp) {
        c.fillStyle = "#234e50";
        c.fillRect(pos.x - 24, pos.y + 25, 48, 7);
        c.fillStyle = "#c8d68e";
        c.fillRect(pos.x - 22, pos.y + 27, (44 * fish.hp) / fish.maxHp, 3);
      }
      if (active) {
        const label = `${species.name} · $${species.value}`;
        c.font = "16px Pixelify, monospace";
        c.textAlign = "center";
        const width = c.measureText(label).width + 20;
        c.fillStyle = "#25494c";
        c.beginPath();
        c.rect(pos.x - width / 2, pos.y - 52, width, 24);
        c.fill();
        c.fillStyle = "#f5f0d9";
        c.fillText(label, pos.x, pos.y - 36);
      }
    }
    const decorations = [...this.decorations].sort((a, b) => a.y - b.y);
    let drawn = false;
    for (const decoration of decorations) {
      if (!drawn && decoration.y > this.state.player.y) {
        this.drawPlayer();
        drawn = true;
      }
      this.drawDecoration(decoration);
    }
    if (!drawn) this.drawPlayer();
    // Fireflies around the skill tree, inviting you to spend your first coins.
    for (let i = 0; i < 7; i++) {
      c.globalAlpha = 0.35 + (0.4 * (Math.sin(time * 1.5 + i) + 1)) / 2;
      c.fillStyle = "#ffefae";
      c.fillRect(
        STATIONS.tree.x - 47 + i * 15 + Math.sin(time + i) * 8,
        STATIONS.tree.y -
          85 * this.spriteYScale +
          Math.sin(i * 2) * 30 +
          Math.cos(time + i) * 8,
        3,
        3,
      );
    }
    c.globalAlpha = 1;
    if (
      pointer &&
      inPond(pointer) &&
      !this.state.inCamp &&
      !this.paused &&
      this.state.stamina > 0 &&
      atFishingSpot(this.state.player)
    ) {
      c.lineWidth = 1.5;
      c.strokeStyle = "#fff5d6bc";
      c.fillStyle = "#fff5d612";
      c.beginPath();
      c.arc(pointer.x, pointer.y, stats.radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = "#fff2c8";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(pointer.x - 5, pointer.y);
      c.lineTo(pointer.x + 5, pointer.y);
      c.moveTo(pointer.x, pointer.y - 5);
      c.lineTo(pointer.x, pointer.y + 5);
      c.stroke();
      const target = this.state.fish.find((f) => f.id === this.hoveredFish);
      if (target) {
        c.lineWidth = 3;
        c.strokeStyle = "#f7d997";
        c.beginPath();
        c.arc(
          pointer.x,
          pointer.y,
          stats.radius + 4,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.PI * 2 * this.state.castTick) / stats.tickMs,
        );
        c.stroke();
      }
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2);
      c.fillStyle = p.color;
      if (p.text) {
        c.font = `500 ${p.text.startsWith("+") ? 26 : 20}px Pixelify, monospace`;
        c.textAlign = "center";
        c.strokeStyle = "#315c57";
        c.lineWidth = 3;
        c.strokeText(p.text, p.x, p.y);
        c.fillText(p.text, p.x, p.y);
      } else c.fillRect(Math.round(p.x), Math.round(p.y), 4, 4);
    }
    c.globalAlpha = 1;
    c.restore();
    // A restrained vignette anchors the scenery, without hiding the fish.
    const vignette = c.createLinearGradient(0, 0, 0, 720);
    vignette.addColorStop(0, "#1f484019");
    vignette.addColorStop(0.22, "#173e3600");
    vignette.addColorStop(0.7, "#173e3600");
    vignette.addColorStop(1, "#163f402c");
    c.fillStyle = vignette;
    c.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
