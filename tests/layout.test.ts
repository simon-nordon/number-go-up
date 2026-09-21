import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atFishingSpot,
  BUILDING_PLOTS,
  canvasYCorrection,
  cameraYFor,
  CAMP_CAMERA_Y,
  CAMP_START,
  isWalkable,
  LAKE_START,
  screenToViewPoint,
  STATIONS,
  TOUCH_AIM_OFFSET,
  VIEW_H,
  walkingRoute,
  type Point,
} from "../src/layout.ts";

test("portrait overlays stay proportional and touch aiming is lifted in screen space", () => {
  assert.equal(canvasYCorrection(1280, 720), 1);
  assert.equal(canvasYCorrection(360, 720), 0.28125);

  const bounds = { left: 10, top: 20, width: 360, height: 720 };
  const direct = screenToViewPoint(190, 380, bounds);
  const lifted = screenToViewPoint(190, 380, bounds, TOUCH_AIM_OFFSET);
  assert.deepEqual(direct, { x: 640, y: 360 });
  assert.equal(lifted.x, direct.x);
  assert.equal(direct.y - lifted.y, TOUCH_AIM_OFFSET);
});

test("camera framing keeps saved positions visible throughout the north-south journey", () => {
  assert.equal(cameraYFor(LAKE_START), 0);
  assert.equal(cameraYFor(CAMP_START), CAMP_CAMERA_Y);
  let previous = 0;
  for (let y = LAKE_START.y; y <= 1368; y++) {
    const cameraY = cameraYFor({ x: 640, y });
    assert.ok(cameraY >= previous, "heading south must not pan back north");
    assert.ok(cameraY >= 0 && cameraY <= CAMP_CAMERA_Y);
    assert.ok(
      y - cameraY >= 80 && y - cameraY <= VIEW_H - 60,
      "a character loaded along the path needs to be visible immediately",
    );
    previous = cameraY;
  }
});

test("the pond connects south to both base stations and all three empty plots", () => {
  assert.equal(BUILDING_PLOTS.length, 3);
  assert.ok(atFishingSpot(LAKE_START));
  assert.equal(atFishingSpot(CAMP_START), false);
  const places = [
    LAKE_START,
    CAMP_START,
    ...Object.values(STATIONS).map((s) => ({ x: s.targetX, y: s.targetY })),
    ...BUILDING_PLOTS,
  ];
  for (const from of places)
    for (const to of places) {
      const route = walkingRoute(from, to);
      assert.ok(
        route.length,
        `No route from ${JSON.stringify(from)} to ${JSON.stringify(to)}`,
      );
      assert.deepEqual(route.at(-1), to);
      assertWalkableRoute(from, route);
    }
});

function assertWalkableRoute(from: Point, route: Point[]): void {
  let current = from;
  for (const next of route) {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(next.x - current.x, next.y - current.y)),
    );
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = current.x + (next.x - current.x) * t,
        y = current.y + (next.y - current.y) * t;
      assert.ok(isWalkable(x, y), `Route enters blocked ground at ${x}, ${y}`);
    }
    current = next;
  }
}

test("click routes go around the shop and willow without entering water", () => {
  for (const [from, to] of [
    [{ x: 1100, y: 860 }, LAKE_START],
    [
      { x: 780, y: 900 },
      { x: 1120, y: 920 },
    ],
    [
      { x: 240, y: 920 },
      { x: STATIONS.tree.targetX, y: STATIONS.tree.targetY },
    ],
    [{ x: 340, y: 850 }, CAMP_START],
    [{ x: 1030, y: 780 }, BUILDING_PLOTS[0]],
  ]) {
    const route = walkingRoute(from, to);
    assert.ok(route.length);
    assertWalkableRoute(from, route);
    assert.deepEqual(route.at(-1), to);
  }
  assert.deepEqual(walkingRoute(CAMP_START, { x: 800, y: 500 }), []);
  assert.deepEqual(walkingRoute(CAMP_START, { x: 945, y: 920 }), []);
});
