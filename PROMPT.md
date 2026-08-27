# Build Prompt — Paint Roller Game ("Fresh Coat", v2 · Room)

Build a browser-based 3D painting game in **three.js**, using **mint-threejs-skills** as the
build methodology and **Mint MCP** as the production asset pipeline.

The fantasy: you are a paint roller. You are shut in a genuinely disgusting room — mould,
soot, tags, water stains — and you roll all four walls out of existence. One verb, one room, and
the entire payoff is the before/after.

> This supersedes the v1 single-wall spec. v1 shipped and was then folded into this: the
> wall became a room of four walls, first person was cut, and the level system was dropped.

---

## 1. Core design decisions (locked)

| Decision | Choice |
|---|---|
| Genre | Single-player 3D painting / coverage game. One verb: roll paint onto a surface. |
| Scope | **One room, no levels, no menu.** Load straight into the room. Finish it, replay it. |
| Surfaces | **Four paintable surfaces**: the four walls. Floor and ceiling are scenery. |
| Room size | Deliberately small (3.0 × 3.0 × 2.4 m) so each wall is finishable in a pass or two. |
| Camera | **One model only.** Wall-locked, facing one surface at a time. **No first person.** |
| Wall switching | Roll the roller off a wall's left/right edge and it continues onto the adjacent wall while the camera swings 90°. The floor and ceiling lines are hard stops. |
| Avatar | **Roller only.** No character. The sleeve carries the active colour. |
| Colour | **8-swatch palette**, keys `1`–`8` or click. Switchable any time, mid-stroke, no penalty. |
| Pressure | **Paint capacity only.** The roller runs dry and you refill. |
| Refilling | **Hold `Space`, anywhere.** No buckets, no trays, no walking to a supply. An on-screen instruction always tells the player this. |
| No pressure from | No timer, no par time, no don't-paint zones, no multi-pass stains. Deliberately excluded. |
| Payoff | Camera pull-back reveal, before/after wipe, stats card, time-lapse replay. |
| Render style | **Stylized PBR.** Mint PBR map sets, interior lighting, ACES tonemapping, no post stack. |
| Audio | **None.** |
| Platform | **Desktop only.** Keyboard. Responsive, DPR-capped canvas; no touch path. |

---

## 2. Tech stack

Standalone Vite project, matching the sibling games in this folder.

- **TypeScript + Vite + vanilla three.js `^0.184.0`.** No React, no physics engine.
- Fixed-timestep simulation (60 Hz) decoupled from render. Paint stamping happens in the
  simulation step so stroke density is framerate-independent.
- All Mint GLB loading goes through a **shared Draco-capable loader**. Mint-optimized GLBs
  will not load with a bare `GLTFLoader` — this is non-negotiable.
- Keep Mint MCP calls out of runtime code. Assets are generated at authoring time and
  tracked in a project-root `mint-assets.json`.

---

## 3. The paint system

Get this right first. Everything else is scaffolding around it.

### 3.1 Paint target (visuals)

- Each surface owns a **`WebGLRenderTarget`** — RGBA8, `1024` on its long axis. `rgb` is the
  painted colour, `a` is coverage. Cleared to `(0,0,0,0)` = bare grime.
- Painting is a **stamp pass**: instanced rounded-rect quads rendered into the target in the
  surface's own UV space.
- **Never stamp a single quad per frame.** Interpolate between the previous and current
  roller position and emit stamps spaced at no more than half the roller's contact depth, so
  a fast sweep lays a continuous band instead of a dotted line.
- **The sleeve auto-orients perpendicular to travel**, like a real roller, so every stroke
  direction lays the same wide band.
- Store **linear premultiplied** colour and blend `src = ONE, dst = ONE_MINUS_SRC_ALPHA`, so a
  correct "over" composite falls out of fixed-function blending.

### 3.2 Surface material (compositing)

- `MeshStandardMaterial` with the Mint grime maps, extended via **`onBeforeCompile`**.
- `diffuse = mix(grime, paint.rgb, paint.a)` — with premultiplied paint this is
  `grime * (1 - a) + paint.rgb`, no divide.
- `roughness = mix(grimeRoughness, wetRoughness, paint.a)` — fresh paint is **glossier** than
  the grime. This wet sheen is most of what sells the before/after; do not skip it.
- Wipe uniform is a **world-space X plane**, not a per-surface UV cut. With four walls facing
  four directions, a UV wipe reads as four separate wipes instead of one line moving across
  the room.

### 3.3 Coverage scoring

- A **parallel CPU grid** per surface, updated by the same stroke path that queues GPU stamps.
  **Do not read pixels back from the GPU** to score — it stalls the pipeline and hitches.
- Room coverage is the **area-weighted** mean across all four walls.
- 100% is reached generously. Chasing the last 2% is not fun.

### 3.4 Stroke log (time-lapse)

- Record every stamp with its surface index. Replay = clear every target and re-stamp the
  log at ~9×. The targets are the only paint state, so this needs no snapshotting.

---

## 4. Room layout and movement

- Walls are ordered so that **moving right along wall N leads onto wall N+1**, and each
  wall's right edge is the next wall's left edge. That makes edge crossing one rule rather
  than four special cases.
- Each surface is described by an origin, an in-plane `right` and `up`, and an inward
  `normal`. Everything — roller orientation, crossings, camera framing — derives from those,
  so no system special-cases which surface it is looking at.
- The **floor and ceiling lines are hard stops**; only the side edges hand over. Vertical
  position carries across clamped, so running diagonally into a corner turns it rather than
  sticking.
- Crossing an edge paints up to the boundary on the old surface, then starts a fresh stroke
  on the new one — a corner is a real discontinuity and should not be interpolated across.

### Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move the roller across the current surface |
| `Shift` | Slow, precise movement |
| `Space` | Hold to refill, anywhere |
| `1`–`8` | Select swatch (or click the swatch bar) |
| `R` | Restart the room |

---

## 5. Cameras

- **Surface pose**: from inside the room, along the surface's normal, at a framing distance.
  If that distance is deeper than the room the camera ends up behind the opposite wall, which
  costs nothing — every surface faces inward, so the near wall is backface-culled and simply
  is not in the way.
- **Turns** are a 0.42s eased blend. Painting continues through them.
- **Reveal pose**: pulls back through the south wall, axis-aligned rather than a prettier
  corner view, so world X stays mapped to screen X and the wipe reads as one clean vertical
  line.

---

## 6. Paint capacity

- Roller holds 100 units, draining with **area rolled**, so cost tracks work done.
- **Empty roller lays nothing** — but still renders faint dry-brush streaks, so the feedback
  is visual and instant rather than only a HUD number hitting zero.
- **Refill is `Space`, held, anywhere in the room**, taking ~1.1s from empty to full. It is a
  beat, not a chore, and there is nothing to walk to.
- The instruction is always on screen in the hint row, and escalates to a prominent prompt
  when paint runs low and again when it hits zero.
- **Switching swatches instantly re-tints the loaded paint.** It costs nothing and never
  requires a refill — that freedom is the whole point of having a palette.

---

## 7. HUD

- Room coverage % (large, centre top).
- **Four per-wall progress pips** (N / E / S / W), with the current one highlighted and
  completed ones turning green. "Which wall did I miss?" is a real question and needs an
  answer at a glance.
- Paint meter, tinted to the active colour, pulsing when low.
- Swatch bar and a hint row that always includes `SPACE REFILL`.

---

## 8. The payoff

At full coverage, input locks and the sequence runs:

1. **Reveal** — camera pulls back out of the room, confetti in the active palette, ~2.6s.
2. **Before/after wipe** — a draggable handle drives the world-X wipe plane across the whole
   room at once. It slides in from the fully-painted side so the grime is revealed rather
   than just sitting there.
3. **Stats card** — coverage, time, refills, strokes, colours used.
4. **Time-lapse replay** — clears the targets and re-stamps the log at ~9×, so the room
   fills in over a few seconds.

---

## 9. Mint assets

Every generated asset requires **explicit approval of a 2D concept image before** the 3D or
material generation runs. One at a time; never batch-approve; iterate on the concept, not the
3D output. Approved concepts live in `concepts/`.

| Key | Type | Used for |
|---|---|---|
| `roller` | model | The player's roller |
| `mat-brick-grimy` | material | West wall |
| `mat-plaster-damp` | material | North and south walls |
| `mat-concrete-graffiti` | material | East wall |

The wall materials are produced with `image_to_maps` from approved flat texture swatches, so
the base colour in the game is exactly the swatch that was signed off.

The `tray` model is retired — refilling no longer has a prop — but stays in the registry.

---

## 10. Acceptance criteria

1. Loads straight into the room: four grimy walls, a plain scenery ceiling, a roller, no menu.
2. WASD lays a continuous, gap-free band at any speed, including at maximum speed on a low
   frame rate.
3. Rolling off a wall's left/right edge continues onto the adjacent wall and the camera
   swings a quarter turn without losing paint state or the roller's position.
4. The floor and ceiling lines stop the roller rather than throwing it somewhere.
5. Swatches `1`–`8` re-tint the roller sleeve and subsequent strokes instantly.
6. Holding `Space` anywhere refills; an empty roller lays only dry streaks; the instruction
   is visible.
7. Fresh paint is visibly glossier than the surrounding grime.
8. Per-wall pips and the room coverage % track accurately and reach 100% without
   pixel-hunting.
9. At 100%: reveal, confetti, stats card, a wipe that sweeps the whole room as one line, and
    a replay that fills the room in from empty.
10. `npm run build` passes typecheck and builds clean.

## 11. Explicitly out of scope

- First person, and any free-look camera.
- Paint buckets, trays, or any physical refill station.
- Levels, level select, menus, progression, persistence.
- Painting the floor or the ceiling — both are scenery.
- Masking / don't-paint zones, stubborn multi-pass stains, timers, star ratings.
- Audio. Touch / mobile controls.
- A mascot character.
