const files = [
  "ground",
  "coast",
  "dock",
  "village",
  "items",
  "water-plants",
  "merchant",
  "boy",
  ...[31, 34, 35, 45].map((id) => `pond-fish-${id}`),
  ...Array.from({ length: 10 }, (_, i) => `rod-${i + 1}`),
  ...["idle", "walk"].flatMap((state) =>
    ["head", "body"].map((part) => `player-${state}-${part}`),
  ),
  ...Array.from({ length: 5 }, (_, i) => `Tree${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `Bush${i + 1}`),
  ...Array.from({ length: 7 }, (_, i) => `Flower${i + 1}`),
];
export type Assets = Record<string, HTMLImageElement>;
export async function loadAssets(): Promise<Assets> {
  const entries = await Promise.all(
    files.map(
      (name) =>
        new Promise<[string, HTMLImageElement]>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve([name, img]);
          img.onerror = () => reject(new Error(`Could not load ${name}.png`));
          img.src = `${import.meta.env.BASE_URL}assets/${name}.png`;
        }),
    ),
  );
  return Object.fromEntries(entries);
}
