# Fresh Coat — Paint Roller Game

A browser paint-roller game built in Three.js (Vite + TypeScript, vanilla Three.js).
You are a roller. The room is disgusting. Cover all four walls.

Built to the spec in [PROMPT.md](PROMPT.md). Wall art and props are generated through the
Mint asset pipeline and composed in the browser.

## Run

```bash
npm install
```

```bash
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | The game, on a dev server |
| `npm run build` | Typecheck + production build of the game into `dist/` |
| `npm run build:site` | The above, then assembles `_site/` — landing page at `/`, game at `/play/` |
| `npm run preview:site` | Assembles and serves `_site/` on :4300, exactly as deployed |

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes
`_site/` to the `gh-pages` branch. The deployed shape is:

```
/       the landing page   (site/)
/play/  the game           (dist/)
```

Enable Pages under Settings → Pages → Deploy from a branch → `gh-pages` / root.

### The landing page

`site/index.html` is a single self-contained page — no bundler, three.js via import
map. Its hero is a live render using the game's own roller GLB and brick grime
maps: a roller lays vertical bands across a filthy wall and stops short of
covering it, because the boundary between the grime and the fresh coat is the
entire pitch. Clicking a palette swatch recolours it.

Two things the hero has to keep doing:

- **The title never waits on the module graph.** Copy and CTA are plain HTML;
  `poster.jpg` sits behind them; the canvas mounts underneath and fades the
  poster out on its first frame. If WebGL fails or the GLB never arrives, the
  poster simply stays and nothing breaks.
- **Hero textures are separate, lighter files.** `site/assets/textures/*.webp`
  are WebP re-encodes of the game's PNG maps — 4.8 MB down to 815 KB. The game
  still loads its own originals.

Regenerate `poster.jpg` by loading the page, letting the scene settle, and
capturing the hero canvas.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Move the roller across the current surface |
| `Shift` | Slow, precise movement |
| `Space` | Hold to refill — anywhere, no bucket to walk to |
| `1`–`8` | Select paint colour (or click a swatch) |
| `R` | Restart the room |

Painting is continuous: the roller is always against the surface, so moving *is* painting.
Roll off a wall's left or right edge and the roller carries onto the next wall while the
camera swings a quarter turn. The floor and ceiling lines are hard stops.

## How the paint works

The paint layer is the core system; everything else hangs off it.

| Concern | Owner |
| --- | --- |
| Renderer, sizing, tone mapping | `src/core/Renderer.ts` |
| Fixed-timestep sim / render split | `src/core/Loop.ts` |
| Input intent | `src/core/Input.ts` |
| Paint render target and stamp pass | `src/systems/PaintTarget.ts` |
| Grime/paint compositing into a surface material | `src/systems/WallMaterial.ts` |
| CPU coverage scoring | `src/systems/CoverageGrid.ts` |
| Stroke log and time-lapse playback | `src/systems/StrokeRecorder.ts` |
| Wall and reveal camera poses | `src/systems/CameraRig.ts` |
| HUD and results | `src/systems/Hud.ts`, `Results.ts` |
| A paintable surface | `src/entities/Surface.ts` |
| Roller | `src/entities/Roller.ts` |
| State machine and rules | `src/game/Game.ts` |
| Room layout and palette | `src/game/room.ts`, `palette.ts` |

Four decisions worth knowing before changing any of it:

- **The render target stores linear premultiplied paint.** Stamps output
  `vec4(colour * a, a)` and blend with `src = ONE, dst = ONE_MINUS_SRC_ALPHA`, so a correct
  "over" composite falls out of fixed-function blending. The wall shader reads it back as
  `grime * (1 - a) + paint.rgb` with no divide.
- **Scoring never reads back from the GPU.** The same stroke path that queues GPU stamps
  rasterises them into a coarse `Uint8Array` grid. Reading pixels back would stall the
  pipeline and hitch visibly.
- **Strokes are interpolated by distance, not per frame.** A fast swipe emits many stamps
  spaced at a fraction of the roller's contact depth, which is why a swipe lays a continuous
  band at 20fps and at 144fps alike.
- **The before/after wipe is a shader uniform, not a screenshot.** It masks the paint layer
  against a **world-space X plane**, so the "before" side is the live grime and one handle
  sweeps the whole room at once. A per-surface UV wipe would have read as four separate
  wipes on four walls facing four directions.

Every surface is described by an origin, an in-plane `right`/`up`, and an inward `normal`
(`src/game/room.ts`). Roller orientation, edge crossings, and camera framing all derive from
those, so all four walls are one code path rather than four special cases. Walls are ordered
so moving right along wall N leads onto wall N+1, which makes edge crossing a single rule.
The ceiling is plain scenery — deliberately not grimy, so it does not look like a surface the
player was meant to be able to paint.

## Deviations from the spec

Two things in [PROMPT.md](PROMPT.md) did not survive contact with the generated assets:

- **Sleeve tinting.** The spec asked for the sleeve as a separate material slot. Mint
  returned the roller as a single mesh with one baked material, so overriding its colour
  would tint the wood and chrome too. Instead a thin paint-coat cylinder is fitted over the
  sleeve — which is what actually happens to a roller — and that carries the active colour
  and fades out as the roller runs dry. The generated asset is used exactly as delivered.
- **The tray's paint puddle** is built in code rather than generated, because it has to tint
  to the active swatch. The generated tray is deliberately empty and neutral grey.

The `tray` model is retired — refilling is now `Space` anywhere, with no physical station —
but it stays in the registry rather than being deleted.

## Asset pipeline

Generated assets are tracked in `mint-assets.json` (logical keys → files under
`public/assets/mint/`). Concept art approved before 3D generation is kept in `concepts/`.

The registry deliberately records every artifact Mint produced, but the game only
fetches the four PBR maps and the GLB. A Vite plugin drops the map archives,
preview images, and height maps from the production build — 22.5 MB of a 41 MB
output. It is a denylist rather than an allowlist, so a newly generated material's
maps ship automatically and getting the list wrong yields a bigger build rather
than a broken one.

Re-sync with the skill's script:

```bash
node <mint-threejs-skills>/scripts/sync-mint-assets.mjs --project . --manifest <manifest.json> --key <logical-key>
```

### Mint generation handoff (developer reference)

| Logical key | Asset | Open in Mint |
| --- | --- | --- |
| `roller` | Chunky Chrome Wool Roller (model) | https://mint.gg/chat/ph7azk17585fkx3qw08zj61e0h8d74yw |
| `tray` | Charcoal Ribbed Paint Tray (model, unused) | https://mint.gg/chat/ph73tgj51fxtg6e2mvfgs5atw18d7mmp |
| `mat-brick-grimy` | Grimy Brick (material) | https://mint.gg/chat/ph7dg5nnk0bz4kdyq7jrchfz8n8d689e |
| `mat-plaster-damp` | Damp Plaster (material) | https://mint.gg/chat/ph7627pgzq8pabq3z3r0vhz29n8d78se |
| `mat-concrete-graffiti` | Graffiti Concrete (material) | https://mint.gg/chat/ph77cxh56j7bg8tne94faftces8d7p1v |

Both GLBs are uncompressed, but every GLB load still goes through the shared Draco-capable
loader in `src/assets/gltf-runtime.ts`, because Mint's optimizer emits
`KHR_draco_mesh_compression` and a bare `GLTFLoader` would reject a re-optimised asset.

The wall materials were produced with `image_to_maps` from approved flat texture swatches, so
the base colour in the game is exactly the swatch that was signed off. They are assigned
around the room as: damp plaster on the north and south walls, graffiti concrete on the east
wall, grimy brick on the west.
