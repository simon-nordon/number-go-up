import { test } from "node:test";
import assert from "node:assert/strict";
import {
  constrainCamera,
  fitCamera,
  transformCamera,
  TREE_NODES,
} from "../src/skill-tree.ts";

test("wheel zoom and two-finger pinch keep their world anchor under the gesture", () => {
  const camera = { x: -130, y: 27, scale: 0.85 };
  const from = { x: 140, y: 210 },
    to = { x: 170, y: 240 };
  for (const target of [from, to]) {
    const next = transformCamera(camera, from, target, 1.5);
    assert.ok(
      Math.abs(
        (from.x - camera.x) / camera.scale - (target.x - next.x) / next.scale,
      ) < 1e-9,
    );
    assert.ok(
      Math.abs(
        (from.y - camera.y) / camera.scale - (target.y - next.y) / next.scale,
      ) < 1e-9,
    );
  }
  assert.equal(transformCamera(camera, from, from, 999).scale, 2.5);
  assert.equal(transformCamera(camera, from, from, 0.01).scale, 0.2);
});

test("fit shows every node on portrait and desktop canvases and dragging stays recoverable", () => {
  for (const [width, height] of [
    [292, 260],
    [360, 480],
    [760, 600],
  ]) {
    const camera = fitCamera(width, height);
    for (const point of Object.values(TREE_NODES)) {
      assert.ok((point.x - 72) * camera.scale + camera.x >= 0);
      assert.ok((point.x + 72) * camera.scale + camera.x <= width);
      assert.ok((point.y - 47) * camera.scale + camera.y >= 0);
      assert.ok((point.y + 47) * camera.scale + camera.y <= height - 48);
    }
    const left = constrainCamera({ x: -1e6, y: -1e6, scale: 1 }, width, height);
    const right = constrainCamera({ x: 1e6, y: 1e6, scale: 1 }, width, height);
    assert.ok(left.x > -766 && left.y > -722);
    assert.ok(right.x < width && right.y < height);
  }
});
