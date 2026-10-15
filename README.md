# Facet

**Pressure finds the flaw.** A browser puzzle about cut stones and the reactions hidden between them.

Swap neighboring gems into lines of three or more. Clears strain the stones beside them; after three hits, a stone is flawed. Flawed stones join any clear touching them and score double. A well-placed swap can spend a whole corner's accumulated pressure in a traveling chain.

Four in a line leave a **brilliant**, which takes its surrounding ring. Crossing lines leave a **star**, which clears its row and column. Five or more leave a kindless **prism**: swap it with a stone to clear every stone of that kind. Reach each level's increasing target; the round ends when no legal swap remains.

## Run

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. No backend, credentials, network services, or runtime downloads are used.

### Production

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve that directory with any static HTTP server. Its page, JavaScript, sprites, font, particle definitions, and audio all use relative paths, so it also works mounted under a sub-path.

**Asset tools are not build dependencies.** Production simply bundles the committed files under `public/assets/`. Neither installation nor the build invokes an asset-generation binary.

## Controls

- **Mouse, pen, or finger:** press a stone, drag onto a neighboring stone, and release. Alternatively, tap one stone and then tap its neighbor.
- Drag back to the starting stone to withdraw the offer. Releasing without an offer plays nothing.
- **Menus:** point and click/tap, or use **↑ / ↓** and **Enter / Space**.
- **Pause/resume:** **P / Escape**, or the on-screen PAUSE control.
- **Back:** **Escape**, or BACK on the instructions page.
- **Mute everything:** **M**. Audio unlocks on the first interaction.
- **Diagnostics:** backtick.

The How to Play screen explains the rules and every cut. Progress and settings are intentionally session-local.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The 50 unit/integration tests cover notation validation, dealing, swap refusal and acceptance, prism seeding, minimal expansion waves, strain, cut placement and precedence, gravity, posed refills, multipliers, level/end conditions, pointer devices, keyboard controls, delta-time partitioning, loaded media, diagnostics, audio events, and the engine recorder. Tests use a real native canvas and counted engine frames, with local asset reads and a host audio-decoder adapter. Coverage is written to `coverage/`.

## Source map

- `src/game.ts`: public state types, engine registration, update-time audio, and game binding.
- `src/simulation.ts`: immutable simulation transitions, board algorithms, menus, pointer path, and debug surface.
- `src/presentation.ts`: media loading and canvas presentation. Live particle systems are evaluated with the supplied pure `ParticleSimulator`; rendering never advances the game or stores a hidden game clock.
- `src/*.test.ts`: simulation and engine integration tests.
- `public/assets/`: the complete shipped media set.
- `showcase/`: store-page description, actual game screenshots, and a compressed engine drawing replay.

The engine owns input, stage fitting, frame timing, audio/unlock/mute, asset loading, diagnostics, and recording. The debug surface is returned through `engine.debug`; the game installs no page globals. Every pose returns a new state, and all snapshot facts are derived directly from that state.

## Media production

All stone artwork, break frames, prism motion, particle effects, sound effects, and music were authored specifically for Facet in this build.

`scripts/produce-assets.mjs` is the **optional one-time authoring recipe**, not part of the build. It uses `draw` for 32 strain sprites, the brilliant/star overlays and the board surround; `draw-sheet` for seven seven-frame fracture sequences and a twelve-frame prism turn; `particle-2d` for four live systems; `sfx-synth` for eight event sounds and the eight-rung chain ladder; `sfx-sample` for the glass/debris shatter body; and `music` for the two original sequenced pieces. The music uses the gm-lite struck-instrument bank, and the shatter uses combat-core samples. Both music WAVs ship with their MIDI scores. The runtime composites original faceted sprites at native pixel resolution, rather than drawing substitute gems.

The bundled DejaVu Serif font is third-party typography, licensed under the Bitstream Vera/DejaVu terms reproduced in `public/assets/fonts/LICENSE.txt`. All other visual chrome is canvas-drawn.

To re-author media, those six tools and their staged audio packs must be available. They are deliberately unnecessary to reproduce the production build from source.

To recapture the showcase, run the development server at port 5173, then run `node scripts/capture.mjs`. It uses project-local Playwright/Chromium with `--no-sandbox`, creates its own harness-held engine, poses a pressure-loaded board through the debug API, plays a swap, and writes real screenshots plus the engine recorder's gzipped drawing stream. The first refill is posed to demonstrate a follow-on match; subsequent refills use ordinary random dealing.
