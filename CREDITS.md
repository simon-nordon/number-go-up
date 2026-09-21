# Art and references

Pixel art is from the seven CraftPix packs supplied in `assets/craft-pix`:

- **180537** — Free swordsman 1–3 level pixel top-down sprite character. The level-one body and head layers provide the walking and idle character; sword layers are omitted.
- **189510** — Grassland top-down tileset pixel art. Ground, trees, bushes, and flowers provide the shoreline and camp scenery.
- **219768** — Fishing game icons pixel art. Extracted and available for further development.
- **255216** — Free basic pixel art UI for RPG. Extracted and available for further development.
- **596440** — Fishing and gathering pixel art RPG icons. Water plants provide pond scenery; the original fish and item sheets remain available locally.
- **885927** — 2D pixel fishing village pack: dock, interior, boats, NPCs. Dock planks, buildings, and props provide the camp and fishing pier.
- **912940** — Pixel art medieval fishing 32×32 icon pack. Herring (35), perch (31), carp (34), and rainbow trout (45) provide pond fish and field-guide art. Their alpha masks produce the submerged silhouettes. All ten fishing rods (1–10) appear in the shop.

The license reference files included in the supplied packs are retained under `public/assets/licenses`. Original source archives and extracted editable sources are kept locally under `assets/craft-pix` and excluded from the public repository. Selected runtime sprites are included as part of this game; CraftPix art is not offered as a standalone asset pack.

The interface icons are original pixel-grid SVG paths. Water patterns, shoreline shapes, ripples, the fishing line, and particles are drawn in Canvas. Sound effects are synthesized locally with Web Audio; the game does not request external fonts, media, or services.

The interface uses [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) by the Pixelify Sans Project Authors, distributed under the SIL Open Font License 1.1. The font is self-hosted in `public/fonts`, alongside its `OFL.txt` license.
