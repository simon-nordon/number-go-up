import type { SkillId } from "./config.ts";

export interface Point {
  x: number;
  y: number;
}
export interface TreeCamera extends Point {
  scale: number;
}
export const TREE_NODES: Record<SkillId, Point> = {
  population: { x: 340, y: 80 },
  stamina: { x: 120, y: 260 },
  damage: { x: 340, y: 260 },
  speed: { x: 230, y: 455 },
  radius: { x: 450, y: 455 },
  perch: { x: 560, y: 260 },
  koi: { x: 670, y: 455 },
  trout: { x: 670, y: 650 },
};
const EDGES: [SkillId, SkillId][] = [
  ["population", "stamina"],
  ["population", "damage"],
  ["population", "perch"],
  ["population", "speed"],
  ["damage", "radius"],
  ["perch", "koi"],
  ["koi", "trout"],
];
const BOUNDS = { left: 24, top: 8, right: 766, bottom: 722 };
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** Keep the same world point under the gesture as it moves and scales. */
export function transformCamera(
  camera: TreeCamera,
  from: Point,
  to: Point,
  scale: number,
): TreeCamera {
  scale = clamp(scale, 0.2, 2.5);
  return {
    x: to.x - ((from.x - camera.x) * scale) / camera.scale,
    y: to.y - ((from.y - camera.y) * scale) / camera.scale,
    scale,
  };
}
export function constrainCamera(
  camera: TreeCamera,
  width: number,
  height: number,
): TreeCamera {
  // Leave enough of the tree on screen to recover it after a long drag.
  return {
    ...camera,
    x: clamp(
      camera.x,
      60 - BOUNDS.right * camera.scale,
      width - 60 - BOUNDS.left * camera.scale,
    ),
    y: clamp(
      camera.y,
      60 - BOUNDS.bottom * camera.scale,
      height - 60 - BOUNDS.top * camera.scale,
    ),
  };
}
export function fitCamera(width: number, height: number): TreeCamera {
  const scale = clamp(
    Math.min(
      (width - 24) / (BOUNDS.right - BOUNDS.left),
      (height - 72) / (BOUNDS.bottom - BOUNDS.top),
    ),
    0.2,
    1,
  );
  return {
    scale,
    x: width / 2 - ((BOUNDS.left + BOUNDS.right) / 2) * scale,
    y: (height - 48) / 2 - ((BOUNDS.top + BOUNDS.bottom) / 2) * scale,
  };
}

/** Canvas connections and accessible DOM nodes share one pan/zoom transform. */
export function mountSkillTree(
  root: HTMLElement,
  initial: TreeCamera | null,
  unlocked: (id: SkillId) => boolean,
  changed: (camera: TreeCamera) => void,
): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
  const content = root.querySelector<HTMLElement>(".skill-map-content")!;
  const ctx = canvas.getContext("2d")!;
  const controller = new AbortController();
  const signal = controller.signal;
  let width = root.clientWidth,
    height = root.clientHeight;
  let camera = initial ?? {
    scale: 0.85,
    x: width / 2 - TREE_NODES.population.x * 0.85,
    y: 12,
  };
  const pointers = new Map<number, Point>();
  let origin: Point | null = null;
  let dragging = false;
  let suppressClick = false;

  function render(): void {
    camera = constrainCamera(camera, width, height);
    content.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
    const dpr = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(width * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    ctx.fillStyle = "#294049";
    const left = Math.floor(-camera.x / camera.scale / 28) * 28;
    const top = Math.floor(-camera.y / camera.scale / 28) * 28;
    for (let x = left; x < (width - camera.x) / camera.scale; x += 28)
      for (let y = top; y < (height - camera.y) / camera.scale; y += 28)
        ctx.fillRect(x, y, 2, 2);
    ctx.lineWidth = 3;
    for (const [parent, child] of EDGES) {
      const a = TREE_NODES[parent],
        b = TREE_NODES[child];
      // Speed shares the population prerequisite, but routes below the hook.
      const via = child === "speed" ? TREE_NODES.damage : a;
      ctx.strokeStyle = unlocked(child) ? "#74a989" : "#3c525e";
      ctx.setLineDash(unlocked(child) ? [] : [7, 7]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 47);
      ctx.lineTo(via.x, (via.y + b.y) / 2);
      ctx.lineTo(b.x, (via.y + b.y) / 2);
      ctx.lineTo(b.x, b.y - 47);
      ctx.stroke();
    }
    ctx.restore();
    changed({ ...camera });
  }
  const local = (event: PointerEvent): Point => {
    const bounds = root.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const center = () => ({ x: width / 2, y: height / 2 });
  const zoom = (factor: number, anchor = center()) => {
    camera = transformCamera(camera, anchor, anchor, camera.scale * factor);
    render();
  };
  root.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const bounds = root.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      zoom(Math.exp(-clamp(delta, -300, 300) * 0.003), {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    },
    { passive: false, signal },
  );
  root.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.button !== 0 ||
        (event.target as Element).closest(".tree-controls")
      )
        return;
      suppressClick = false;
      pointers.set(event.pointerId, local(event));
      if (pointers.size === 1) {
        origin = local(event);
        dragging = false;
      } else {
        dragging = true;
        suppressClick = true;
        for (const id of pointers.keys()) root.setPointerCapture(id);
      }
      if (!(event.target as Element).closest(".skill-node")) {
        root.setPointerCapture(event.pointerId);
        root.focus({ preventScroll: true });
      }
    },
    { signal },
  );
  root.addEventListener(
    "pointermove",
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const next = local(event);
      if (
        !dragging &&
        origin &&
        Math.hypot(next.x - origin.x, next.y - origin.y) > 5
      ) {
        dragging = true;
        suppressClick = true;
        root.setPointerCapture(event.pointerId);
      }
      if (dragging) {
        const other = [...pointers.entries()].find(
          ([id]) => id !== event.pointerId,
        )?.[1];
        if (other) {
          const before = {
            x: (previous.x + other.x) / 2,
            y: (previous.y + other.y) / 2,
          };
          const after = {
            x: (next.x + other.x) / 2,
            y: (next.y + other.y) / 2,
          };
          const distance = Math.hypot(
            previous.x - other.x,
            previous.y - other.y,
          );
          const ratio =
            distance > 0
              ? Math.hypot(next.x - other.x, next.y - other.y) / distance
              : 1;
          camera = transformCamera(camera, before, after, camera.scale * ratio);
        } else {
          camera.x += next.x - previous.x;
          camera.y += next.y - previous.y;
        }
        root.classList.add("dragging");
        render();
      }
      pointers.set(event.pointerId, next);
    },
    { signal },
  );
  function release(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (root.hasPointerCapture(event.pointerId))
      root.releasePointerCapture(event.pointerId);
    if (!pointers.size) {
      dragging = false;
      origin = null;
      root.classList.remove("dragging");
    }
  }
  root.addEventListener("pointerup", release, { signal });
  root.addEventListener("pointercancel", release, { signal });
  root.addEventListener(
    "lostpointercapture",
    (event) => {
      // Touch starts with implicit capture on the node. Taking that capture for
      // a drag or pinch must not treat the node's bubbling loss as a gesture end.
      if (event.target === root) release(event);
    },
    { signal },
  );
  root.addEventListener(
    "click",
    (event) => {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
        return;
      }
      const control = (event.target as Element).closest<HTMLElement>(
        "[data-tree-control]",
      )?.dataset.treeControl;
      if (control === "in") zoom(1.25);
      if (control === "out") zoom(0.8);
      if (control === "fit") {
        camera = fitCamera(width, height);
        render();
      }
    },
    { capture: true, signal },
  );
  root.addEventListener(
    "keydown",
    (event) => {
      switch (event.key) {
        case "+":
        case "=":
          zoom(1.25);
          break;
        case "-":
          zoom(0.8);
          break;
        case "Home":
          camera = fitCamera(width, height);
          render();
          break;
        case "ArrowLeft":
          camera.x += 50;
          render();
          break;
        case "ArrowRight":
          camera.x -= 50;
          render();
          break;
        case "ArrowUp":
          camera.y += 50;
          render();
          break;
        case "ArrowDown":
          camera.y -= 50;
          render();
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    { signal },
  );
  root.addEventListener(
    "focusin",
    (event) => {
      const id = (event.target as HTMLElement).dataset.skill as
        SkillId | undefined;
      if (!id) return;
      const pos = TREE_NODES[id];
      const x = pos.x * camera.scale + camera.x,
        y = pos.y * camera.scale + camera.y;
      const marginX = 76 * camera.scale + 8,
        marginY = 50 * camera.scale + 8;
      camera.x += clamp(x, marginX, width - marginX) - x;
      camera.y += clamp(y, marginY, height - marginY - 54) - y;
      render();
    },
    { signal },
  );
  const observer = new ResizeObserver(() => {
    const nextWidth = root.clientWidth,
      nextHeight = root.clientHeight;
    camera.x += (nextWidth - width) / 2;
    camera.y += (nextHeight - height) / 2;
    width = nextWidth;
    height = nextHeight;
    render();
  });
  observer.observe(root);
  render();
  return () => {
    observer.disconnect();
    controller.abort();
  };
}
