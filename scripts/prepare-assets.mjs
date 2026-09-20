import { cpSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
const source = resolve("assets/craft-pix/extracted");
if (!existsSync(source))
  throw new Error("Run scripts/extract-assets.ps1 first.");
const dest = resolve("public/assets");
mkdirSync(dest, { recursive: true });
const assets = {
  "ground.png": "grassland/PNG/ground_grasss.png",
  "coast.png": "grassland/PNG/Water_coasts.png",
  "dock.png": "village/PNG/Exterior_tiles.png",
  "village.png": "village/PNG/Exterior_objetcs.png",
  "items.png": "fishing/PNG_n_Tiled/Icons.png",
  "water-plants.png": "fishing/PNG_n_Tiled/Objects.png",
  "boy.png": "village/PNG/Characters/Boy_looking.png",
  "merchant.png": "village/PNG/Characters/Old_man_idle_without_shadow.png",
};
for (let i = 1; i <= 10; i++)
  assets[`fish-${i}.png`] = `fishing/PNG_n_Tiled/Fish${i}.png`;
for (const state of ["Walk", "Idle"])
  for (const part of ["head", "body"]) {
    assets[`player-${state.toLowerCase()}-${part}.png`] =
      `characters/PNG/Swordsman_lvl1/Parts/Swordsman_lvl1_${state}_${part}.png`;
  }
for (const file of readdirSync(
  join(source, "grassland/PNG/Objects_separated"),
)) {
  if (/^(Tree[1-5]|Bush[1-9]|Flower[1-7]|Stone[1-3])\.png$/.test(file)) {
    assets[file] = `grassland/PNG/Objects_separated/${file}`;
  }
}
for (const [name, path] of Object.entries(assets))
  cpSync(join(source, path), join(dest, name));
mkdirSync(join(dest, "licenses"), { recursive: true });
for (const pack of readdirSync(source)) {
  const license = readdirSync(join(source, pack)).find((name) =>
    /^license\.txt$/i.test(name),
  );
  if (license)
    cpSync(join(source, pack, license), join(dest, "licenses", `${pack}.txt`));
}
console.log(`Prepared ${Object.keys(assets).length} CraftPix assets.`);
