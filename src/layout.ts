export type Point = { x: number; y: number };

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const WORLD_H = 1440;
export const TOUCH_AIM_OFFSET = 56;
export const CAMP_CAMERA_Y = WORLD_H - VIEW_H;
export const DOCK = { left: 594, right: 686, top: 474, bottom: 750 };
export const LAKE_START: Point = { x: 640, y: 500 };
export const CAMP_START: Point = { x: 640, y: 1060 };
export const CAMP_ENTRY_Y = 770;
export const STATIONS = {
  tree: { x: 335, y: 992, targetX: 335, targetY: 1060 },
  shop: { x: 945, y: 992, targetX: 945, targetY: 1060 },
};
export const BUILDING_PLOTS = [
  { x: 335, y: 1230 },
  { x: 640, y: 1230 },
  { x: 945, y: 1230 },
] as const;

/** Correct vertical canvas units when the fixed view is stretched to the screen. */
export function canvasYCorrection(width: number, height: number): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return 1;
  return (width * VIEW_H) / (height * VIEW_W);
}

/** Convert a browser pointer to view coordinates, with an optional screen-space lift. */
export function screenToViewPoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  yOffset = 0,
): Point {
  return {
    x: ((clientX - bounds.left) / bounds.width) * VIEW_W,
    y: ((clientY - bounds.top - yOffset) / bounds.height) * VIEW_H,
  };
}

/** Use the same framing on load as when walking between the pond and base. */
export function cameraYFor(point: Point): number {
  return Math.min(
    CAMP_CAMERA_Y,
    Math.max(0, ((point.y - 550) / (CAMP_START.y - 550)) * CAMP_CAMERA_Y),
  );
}

export function shoreY(x: number): number {
  return (
    680 +
    Math.floor((Math.sin(x * 0.012) * 18 + Math.cos(x * 0.024) * 10) / 16) * 16
  );
}

export function atFishingSpot(point: Point): boolean {
  return (
    point.x >= DOCK.left &&
    point.x <= DOCK.right &&
    point.y >= DOCK.top &&
    point.y <= 550
  );
}

export function inPond(point: Point): boolean {
  return (
    point.x > 60 && point.x < VIEW_W - 60 && point.y > 100 && point.y < 455
  );
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 100 || x > 1180 || y < DOCK.top || y > 1368) return false;
  if (
    y < shoreY(x) + 18 &&
    !(x >= DOCK.left && x <= DOCK.right && y <= DOCK.bottom)
  )
    return false;
  if (x > 831 && x < 1059 && y > 808 && y < 1010) return false;
  if (Math.hypot(x - STATIONS.tree.x, y - (STATIONS.tree.y - 24)) < 46)
    return false;
  return true;
}

function clearSegment(from: Point, to: Point): boolean {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4);
  for (let step = 0; step <= steps; step++) {
    const t = steps ? step / steps : 0;
    if (!isWalkable(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t))
      return false;
  }
  return true;
}

/** Route clicks around buildings and through the narrow dock entrance. */
export function walkingRoute(from: Point, to: Point): Point[] {
  if (!isWalkable(from.x, from.y) || !isWalkable(to.x, to.y)) return [];
  if (clearSegment(from, to)) return [{ ...to }];
  const grid = 24;
  const key = (p: Point) => `${p.x},${p.y}`;
  const snap = (p: Point): Point | undefined => {
    const nearby: Point[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        nearby.push({
          x: (Math.round(p.x / grid) + dx) * grid,
          y: (Math.round(p.y / grid) + dy) * grid,
        });
    return nearby
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
      )
      .find((q) => clearSegment(p, q));
  };
  const start = snap(from),
    end = snap(to);
  if (!start || !end) return [];
  const queue = [start];
  const previous = new Map<string, Point | null>([[key(start), null]]);
  for (
    let index = 0;
    index < queue.length && !previous.has(key(end));
    index++
  ) {
    const current = queue[index];
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const next = { x: current.x + dx * grid, y: current.y + dy * grid };
      if (!previous.has(key(next)) && clearSegment(current, next)) {
        previous.set(key(next), current);
        queue.push(next);
      }
    }
  }
  if (!previous.has(key(end))) return [];
  const route: Point[] = [{ ...to }];
  for (let p: Point | null = end; p; p = previous.get(key(p)) ?? null)
    route.push(p);
  route.push({ ...from });
  route.reverse();
  const simplified: Point[] = [];
  for (let index = 0; index < route.length - 1;) {
    let next = route.length - 1;
    while (next > index + 1 && !clearSegment(route[index], route[next])) next--;
    simplified.push(route[next]);
    index = next;
  }
  return simplified;
}
