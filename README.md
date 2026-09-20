# Stillwater

A small TypeScript browser game about a quiet lake and a growing fishing habit. Built with Vite, Canvas 2D, and the supplied CraftPix pixel art. No server or account is needed for gameplay.

## Run

Tested with Node.js 24.

```sh
npm ci
npm run dev
```

Vite prints the local URL. To choose a port: `npm run dev -- --port 5180`.

```sh
npm test          # Game rules, economy, saves, and balance validation
npm run build    # Strict TypeScript check + production bundle
npm run preview  # Play the production build
```

The production preview runs at `/number-go-up/`, matching the hosted game.

## Share with GitHub Pages

Play at **[simon-nordon.github.io/number-go-up](https://simon-nordon.github.io/number-go-up/)**.

Pushing to `main` runs the tests, builds the game, and publishes `dist` through [the Pages workflow](.github/workflows/pages.yml). You can also run it manually from the repository's **Actions** tab. Deployment status and errors appear there.

The repository's **Settings → Pages → Build and deployment → Source** must be **GitHub Actions**. No extra secrets, server, or paid hosting are required. If you fork or rename the repository, update the production base path in `vite.config.ts` to match its name and enable Pages in that repository.

Each player saves progress in their own browser. The hosted production build has no balance editor; use the local development server to tune values, then update `src/config.ts` and push to publish those defaults.

## Play the first slice

- Start at the dock with **three silver minnows**, **$0**, and a beginner's rod.
- **Hover over a fish** to deal 1 damage every 650ms. Minnows have 4 HP. Catches automatically earn **$1**.
- Move with **WASD / arrows**, or click a walkable path. Walk left off the dock to enter camp. The destination buttons also walk your character there.
- Click **The old willow**, or press **E** nearby, to open the skill tree. **B** walks to the tree. The first three **Pond life** upgrades cost **$1 each** and each add one fish to future trips.
- Return to the dock for a new trip. With three Pond life levels, **six fish** are waiting. Trips are finite: fish do not respawn until you visit camp and return. Leaving early starts a fresh trip when you return.
- Follow the branches for damage, faster ticks, a larger cursor, and three additional fish species. The latest unlocked species is guaranteed to appear at least once each trip.
- Visit **Tackle & twine** for **The gilded reed**, a **$1,000** rod that multiplies total damage by **5**.
- Open the book in the header for your field guide. **Escape** opens settings or closes a dialog.

Desktop keyboard and mouse are recommended. Touch users can hold a fish to catch it and use the direction pad to move.

## Live balance editing

During `npm run dev`, click **Edit balance** or press **F2**. Gameplay pauses while a dialog is open.

The editor changes starting population, base damage, tick interval, cursor radius, skill costs and scaling, effects and level caps, fish HP/value/spawn weights, and the rod's price and multiplier. **Apply changes** saves the balance in this browser. Population changes take effect on the next trip; existing fish retain their health percentage when you edit HP. Lowering a skill cap clamps its purchased level without refunding coins.

**Export JSON** applies and downloads the current settings. **Import** validates and applies a previously exported file. **Restore defaults** restores the code defaults while keeping the save. Playtest buttons grant $100, restock the lake, or reset progress after a confirmation. A new save keeps your custom balance.

The committed defaults live in [`src/config.ts`](src/config.ts). To ship a tuned balance, copy the exported numbers into that file and rebuild. The editor and the read-only `window.__STILLWATER__` inspection property are development-only and are removed from production builds.

## Saving

Progress saves after catches and purchases, on zone changes, every five seconds, and when the page is hidden. Your wallet, upgrades, collection, position, and partially caught current trip survive a reload. There is no offline income. Simulation pauses in background tabs and menus.

Storage keys:

- `stillwater.save.v1` — game progress
- `stillwater.balance.v1` — local balance overrides
- `stillwater.sound` / `stillwater.motion` — preferences

Malformed saves recover to a fresh game. Invalid balance imports are rejected. If browser storage is unavailable, play continues for the current session and the footer reports that progress cannot be saved.

## Assets

The original CraftPix ZIPs and extracted editable sources stay local and are ignored by Git. The 43 selected runtime PNGs and license references are in `public/assets`, so a fresh checkout does not need the source packs to run. The art is included for use within this game, not as a standalone asset pack.

To repeat asset preparation, place your original six source ZIPs in `assets/craft-pix`, then run from PowerShell:

```powershell
./scripts/extract-assets.ps1
npm run assets:prepare
```

The extraction script rejects paths outside each pack's destination and skips macOS metadata. It preserves the original archives and editable source files. Runtime art is copied from the supplied packs, with sprites cropped and animated by the renderer.

## Project map

| File                  | Responsibility                                                   |
| --------------------- | ---------------------------------------------------------------- |
| `src/config.ts`       | Default balance, skill definitions, import validation            |
| `src/model.ts`        | Pure game rules: ticks, trips, purchases, stats, save validation |
| `src/world.ts`        | Canvas scene, character movement, collision, camera, effects     |
| `src/main.ts`         | Interface, dialogs, live editor, local saves                     |
| `src/audio.ts`        | Small synthesized catch and upgrade sounds                       |
| `src/style.css`       | Interface and responsive layout                                  |
| `tests/model.test.ts` | Meaningful game-rule regression tests                            |

This is a first playable slice: one lake, one camp, five skill branches, four fish species, and one purchasable rod. Multiplayer, additional biomes, quests, and prestige are outside this slice.

## Design references

The catch / earn / upgrade rhythm draws on [Incremental Fishing](https://store.steampowered.com/app/4456630/Incremental_Fishing/), the reward progression of [Click the Button](https://store.steampowered.com/app/3946950/Click_the_Button/), and the branching upgrades and equipment progression of [Bills Must Be Paid](https://store.steampowered.com/app/4421010/). Stillwater adds a controllable character, a dock, and a walkable camp. See [CREDITS.md](CREDITS.md) for the supplied art packs.
