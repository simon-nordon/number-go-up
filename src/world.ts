import type { Assets } from "./assets.ts";
import type { Balance } from "./config.ts";
import {
  enterCamp,
  enterLake,
  fishPosition,
  getStats,
  tickFishing,
  type GameEvent,
  type GameState,
} from "./model.ts";

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STATIONS = {
  tree: { x: 567, y: 300, targetX: 567, targetY: 385 },
  shop: { x: 280, y: 324, targetX: 285, targetY: 402 },
};
type Station = keyof typeof STATIONS;
type Decoration = {
  image: string;
  x: number;
  y: number;
  scale: number;
  crop?: number[];
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
type Point = { x: number; y: number };

export class World {
  readonly canvas: HTMLCanvasElement;
  camera = 640;
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
  private direction = 2;
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
    this.terrain.width = 1920;
    this.terrain.height = VIEW_H;
    this.camera = state.inCamp ? 0 : 640;
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
      const station =
        Math.abs(point.x - STATIONS.tree.x) < 88 &&
        point.y > 115 &&
        point.y < 328
          ? "tree"
          : point.x > 175 && point.x < 390 && point.y > 140 && point.y < 377
            ? "shop"
            : null;
      if (station) {
        if (this.nearestStation() === station) this.onStation(station);
        else this.goTo(station);
        return;
      }
      if (point.x < 1120 && this.walkable(point.x, point.y))
        this.travelTo(point);
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
    this.camera = state.inCamp ? 0 : 640;
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
      ? { x: this.pointer.x + this.camera, y: this.pointer.y }
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
  private shore(y: number): number {
    return (
      784 +
      Math.floor((Math.sin(y * 0.012) * 22 + Math.cos(y * 0.027) * 12) / 16) *
        16
    );
  }
  private buildTerrain(): void {
    const c = this.terrain.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    const rand = this.seeded(329);
    c.fillStyle = "#4f9499";
    c.fillRect(0, 0, 1920, 720);
    // Low-contrast patches keep the lake readable without a flat backdrop.
    for (let i = 0; i < 250; i++) {
      c.fillStyle = ["#51989c", "#4c9197", "#559b9e", "#509699"][i % 4];
      c.fillRect(
        Math.floor((rand() * 1920) / 16) * 16,
        Math.floor((rand() * 720) / 8) * 8,
        48 + Math.floor(rand() * 11) * 16,
        16 + Math.floor(rand() * 7) * 8,
      );
    }
    for (let y = 0; y < 720; y += 16) {
      const edge = this.shore(y);
      c.fillStyle = "#69aaab";
      c.fillRect(0, y, edge + 32, 16);
      c.fillStyle = "#8bc1b5";
      c.fillRect(0, y, edge + 16, 16);
      c.fillStyle = "#c0c18d";
      c.fillRect(0, y, edge + 6, 16);
      c.fillStyle = "#657c49";
      c.fillRect(0, y, edge, 16);
      c.fillStyle = "#8dab61";
      c.fillRect(0, y, edge - 7, 16);
    }
    // Actual grassland ground tiles, mixed with small vegetation decals.
    c.save();
    c.beginPath();
    c.moveTo(0, 0);
    for (let y = 0; y <= 720; y += 16) c.lineTo(this.shore(y) - 12, y);
    c.lineTo(0, 720);
    c.closePath();
    c.clip();
    for (let y = 0; y < 720; y += 32)
      for (let x = 0; x < 820; x += 32)
        c.drawImage(this.assets.ground, 144, 208, 16, 16, x, y, 32, 32);
    for (let i = 0; i < 1400; i++) {
      const x = Math.floor((rand() * 830) / 2) * 2,
        y = Math.floor((rand() * 720) / 2) * 2;
      c.fillStyle = ["#94ae62", "#7f9c52", "#a0b66b", "#87a459"][i % 4];
      c.fillRect(x, y, 2 + Math.floor(rand() * 4) * 2, 2);
    }
    // A worn path joins the cottage, the tree, and the dock.
    c.lineCap = "round";
    c.lineJoin = "round";
    const path = () => {
      c.beginPath();
      c.moveTo(165, 413);
      c.lineTo(352, 413);
      c.lineTo(460, 431);
      c.lineTo(608, 414);
      c.lineTo(810, 414);
      c.stroke();
    };
    c.strokeStyle = "#94a362";
    c.lineWidth = 88;
    path();
    c.strokeStyle = "#b9b07f";
    c.lineWidth = 65;
    path();
    c.strokeStyle = "#c8bc91";
    c.lineWidth = 49;
    path();
    for (let i = 0; i < 100; i++) {
      c.fillStyle = i % 2 ? "#b5a980" : "#d5c797";
      c.fillRect(180 + rand() * 610, 397 + rand() * 32, 3, 2);
    }
    c.restore();
    // Dock planks and supports from the fishing village tileset.
    c.fillStyle = "#255e6650";
    c.fillRect(754, 470, 344, 21);
    c.drawImage(this.assets.dock, 0, 0, 112, 56, 752, 345, 336, 144);
    for (const x of [773, 914, 1061])
      for (const y of [337, 458])
        c.drawImage(this.assets.dock, 56, 144, 9, 19, x, y, 18, 38);
    // A small, wooded far bank gives the lake a sense of place.
    c.fillStyle = "#6dafac";
    c.beginPath();
    c.moveTo(1536, 0);
    c.lineTo(1590, 38);
    c.lineTo(1680, 58);
    c.lineTo(1738, 48);
    c.lineTo(1810, 89);
    c.lineTo(1920, 98);
    c.lineTo(1920, 0);
    c.fill();
    c.fillStyle = "#bfbc85";
    c.beginPath();
    c.moveTo(1560, 0);
    c.lineTo(1602, 25);
    c.lineTo(1680, 45);
    c.lineTo(1744, 32);
    c.lineTo(1815, 74);
    c.lineTo(1920, 82);
    c.lineTo(1920, 0);
    c.fill();
    c.fillStyle = "#829d55";
    c.beginPath();
    c.moveTo(1580, 0);
    c.lineTo(1630, 22);
    c.lineTo(1690, 33);
    c.lineTo(1750, 22);
    c.lineTo(1820, 60);
    c.lineTo(1920, 70);
    c.lineTo(1920, 0);
    c.fill();
    // Lily pads, reeds and a few submerged stones.
    for (const [x, y] of [
      [896, 184],
      [908, 198],
      [918, 165],
      [1800, 611],
      [1828, 599],
      [1785, 586],
      [1692, 106],
      [1650, 96],
      [859, 569],
      [884, 585],
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
    for (const y of [102, 130, 263, 551, 586, 637]) {
      const x = this.shore(y) - 3;
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
    ) => this.decorations.push({ image, x, y, scale, crop });
    const rand = this.seeded(735);
    for (let x = -20; x < 790; x += 62) {
      add(`Tree${1 + Math.floor(rand() * 4)}`, x, 135 + rand() * 48, 2.3);
      if (x < 180 || x > 640)
        add(`Tree${1 + Math.floor(rand() * 2)}`, x, 228 + rand() * 38, 2.05);
    }
    for (let y = 300; y < 720; y += 105) add("Tree2", 45 + rand() * 35, y, 2.4);
    for (let x = 80; x < 790; x += 80) {
      add(`Tree${1 + Math.floor(rand() * 4)}`, x, 900 + rand() * 60, 2.5);
      add("Bush3", x + 18, 640 + rand() * 30, 1.7);
    }
    for (const [x, y] of [
      [695, 208],
      [114, 524],
    ])
      add("Tree1", x, y, 2.05);
    add("Tree1", 715, 690, 1.7);
    add("Tree1", 700, 645, 1.7);
    add("Tree1", 567, 325, 2.85);
    add("village", 280, 377, 2.1, [12, 0, 104, 112]);
    add("village", 421, 329, 1.4, [72, 270, 64, 45]);
    add("village", 169, 400, 1.5, [0, 274, 64, 68]);
    add("village", 762, 353, 1.35, [166, 500, 29, 43]);
    add("village", 811, 475, 1.4, [0, 509, 30, 32]);
    add("village", 958, 360, 1.1, [205, 305, 29, 33]);
    for (let i = 0; i < 36; i++) {
      const x = 100 + rand() * 650,
        y = 485 + rand() * 136;
      add(`Flower${1 + (i % 7)}`, x, y, 1.7);
    }
    for (const [x, y] of [
      [717, 300],
      [648, 297],
      [128, 355],
      [515, 329],
      [734, 578],
      [690, 150],
      [132, 604],
    ])
      add("Bush1", x, y, 1.9);
    for (let x = 1640; x < 1980; x += 68)
      add(`Tree${1 + Math.floor(rand() * 3)}`, x, 20 + (x - 1640) * 0.15, 1.9);
  }
  private walkable(x: number, y: number): boolean {
    if (x < 87 || x > 1071 || y < 180 || y > 622) return false;
    if (x > 744 && (y < 382 || y > 440)) return false;
    if (x > 175 && x < 390 && y < 378) return false;
    if (Math.hypot(x - 567, y - 299) < 41) return false;
    if (x > 389 && x < 464 && y > 286 && y < 332) return false;
    return true;
  }
  private travelTo(point: Point): void {
    this.destination = null;
    this.route = [];
    if (this.state.player.x > 744 || point.x > 744)
      this.route.push({ x: this.state.player.x, y: 409 }, { x: 722, y: 409 });
    // Stay on the open path when routing past the hut or the tree.
    if (point.x < 744)
      this.route.push(
        { x: this.state.player.x > 744 ? 722 : this.state.player.x, y: 409 },
        { x: point.x, y: 409 },
      );
    this.route.push(point);
  }
  goTo(place: "camp" | "lake" | Station): void {
    if (place === "lake") {
      this.travelTo({ x: 1030, y: 409 });
      this.onTravel("Taking the path to the dock…");
    } else if (place === "camp") {
      this.travelTo({ x: 635, y: 409 });
      this.onTravel("Heading back to camp…");
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
      if (this.walkable(p.x + dx * distance, p.y)) {
        p.x += dx * distance;
        moved = true;
      }
      if (this.walkable(p.x, p.y + dy * distance)) {
        p.y += dy * distance;
        moved = true;
      }
      if (!moved) this.route = [];
      this.direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 1) : dy > 0 ? 0 : 3;
      this.step += dt;
    }
    if (p.x < 752 && !this.state.inCamp) {
      enterCamp(this.state);
      this.onChange();
    }
    if (p.x >= 920 && this.state.inCamp) {
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
    const cameraTarget = this.state.inCamp ? 0 : 640;
    this.camera += (cameraTarget - this.camera) * Math.min(1, dt * 3.6);
    if (Math.abs(this.camera - cameraTarget) < 0.15) this.camera = cameraTarget;
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
    if (d.x < this.camera - 180 || d.x > this.camera + VIEW_W + 180) return;
    const vertical = this.spriteYScale;
    if (sprite)
      c.drawImage(
        sprite,
        Math.round(d.x - (sprite.width * d.scale) / 2),
        Math.round(d.y - sprite.height * d.scale * vertical),
        Math.round(sprite.width * d.scale),
        Math.round(sprite.height * d.scale * vertical),
      );
    else if (d.crop) {
      const [sx, sy, sw, sh] = d.crop;
      c.drawImage(
        this.assets[d.image],
        sx,
        sy,
        sw,
        sh,
        Math.round(d.x - (sw * d.scale) / 2),
        Math.round(d.y - sh * d.scale * vertical),
        sw * d.scale,
        sh * d.scale * vertical,
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
    const body = this.assets[`player-${mode}-body`];
    const frame = this.moving
      ? Math.floor(this.step * 9) % 6
      : Math.floor(this.waterTime * 3) % (body.width / 64);
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
    if (!this.state.inCamp && !this.moving) {
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
      if (point && point.x > 1110 && !this.paused) {
        c.quadraticCurveTo((p.x + point.x) / 2, point.y - 85, point.x, point.y);
      } else {
        c.quadraticCurveTo(p.x + 75, p.y - 32, p.x + 63, p.y + 35);
      }
      c.stroke();
      if (!point || point.x <= 1110) {
        c.fillStyle = "#f2e7bf";
        c.fillRect(p.x + 61, p.y + 32, 5, 6);
        c.fillStyle = "#d47e66";
        c.fillRect(p.x + 61, p.y + 35, 5, 3);
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
    c.translate(-Math.round(this.camera), 0);
    c.drawImage(this.terrain, 0, 0);
    const time = this.reducedMotion ? 0 : this.waterTime;
    for (let i = 0; i < 125; i++) {
      const x = 822 + ((i * 139.7) % 1090),
        y = 105 + ((i * 71.9) % 610);
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
        const x = 950 + ((i * 323 + time * 4) % 1040);
        c.beginPath();
        c.ellipse(x, 80 + i * 160, 95, 35, -0.15, 0, Math.PI * 2);
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
        this.state.player.x >= 920 &&
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
        c.font = '600 12px "Trebuchet MS", sans-serif';
        c.textAlign = "center";
        const width = c.measureText(label).width + 20;
        c.fillStyle = "#25494c";
        c.beginPath();
        c.roundRect(pos.x - width / 2, pos.y - 52, width, 24, 4);
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
        520 + i * 15 + Math.sin(time + i) * 8,
        240 + Math.sin(i * 2) * 50 + Math.cos(time + i) * 8,
        3,
        3,
      );
    }
    c.globalAlpha = 1;
    if (
      pointer &&
      pointer.x > 1110 &&
      pointer.y > 110 &&
      !this.state.inCamp &&
      !this.paused &&
      this.state.player.x >= 920
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
          -Math.PI / 2 + (Math.PI * 2 * target.tick) / stats.tickMs,
        );
        c.stroke();
      }
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2);
      c.fillStyle = p.color;
      if (p.text) {
        c.font = `700 ${p.text.startsWith("+") ? 23 : 17}px "Trebuchet MS", sans-serif`;
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
