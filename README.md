# Double Pendulum

A map of every way a double pendulum can be let go, and the pendulum behind any point on it. Built to sit inside the Code lab on joncheng.ca.

Each pixel of the map is a pendulum released from rest at (θ₁, θ₂), coloured by how long it takes for either arm to flip over the top. Click a pixel and that pendulum swings on the right, drawing its path. Calm starts draw spirographs, chaotic ones scribble.

## Run it

```bash
pnpm add -D typescript vite prettier @types/node   # first time only; writes the versions and lockfile
pnpm dev        # http://localhost:5173
pnpm test       # Node's built-in test runner, needs Node 22.18 or newer
pnpm build      # type-checks, then builds to dist/
pnpm home-map   # recomputes public/home-map.bin, about a minute
```

Controls: click or tap the map to pick a start, drag to pan, scroll or pinch to zoom, double-click to zoom in. Hover the map to see that start's pose. Drag either bob to set a start by hand. The slider under the map shows only the flips that have happened by a given time; ▶ replays the map filling in, and every load opens with that replay.

Keys: `L` lessons, `C` calm-region curve, `V` colour by time or by which arm flips, `T` twin, `space` play/pause, `R` restart, `S` speed, `0` reset view, `+` / `-` zoom, arrows pan, `H` engine stats (on by default in dev).

## How it's laid out

```
src/main.ts           wires everything together
src/physics.ts        equations of motion, RK4, energy; the float64 reference
src/view.ts           map pan/zoom over the (θ₁, θ₂) square
src/map/engine.ts     engine contract, grid maths, pass budget
src/map/gpu.ts        WebGPU engine (step.wgsl, args.wgsl, draw.wgsl)
src/map/gl.ts         WebGL2 fallback (*.frag.glsl)
src/map/prior.ts      the precomputed home map's encoding
scripts/home-map.ts   writes public/home-map.bin on the CPU
src/pendulum.ts       the live pendulum: sim, arms, trail, bob dragging
src/overlay.ts        ticks, calm curve, start marker, live paths on the map
src/learn.ts          lesson cards
src/ui.ts             buttons and readouts
src/hash.ts           shareable links
```

## Performance notes

- The map is the expensive part, so it renders at up to 1.5× device pixels (1.25× on touch screens), not the full screen density.
- WebGPU keeps a list of the pixels still running. Each pass steps only those, then rebuilds the list. Most of the map flips in the first few time units, so the work shrinks fast.
- Starts inside the calm curve (`2cos θ₁ + cos θ₂ > 1`) can't flip and are never simulated.
- The number of passes per frame adapts to measured GPU time, so the page stays smooth while the map fills in.
- Panning and zooming show the last finished map, reprojected, until the new one catches up.
- The default view is precomputed into `public/home-map.bin` (512², one byte a pixel, about 60 kB gzipped), so the whole map is on screen before the live run starts. Rerun `pnpm home-map` if the physics changes.
- Each result stores the flip time plus which arm flipped and which way, so the time slider and the arm colouring are just redraws.
- The pendulum runs on the CPU in float64. Its trail is drawn into a canvas that's never cleared, so each frame only adds new segments.
- Nothing runs once the map is finished and the pendulum is paused, or while the frame is scrolled out of view.
- Without WebGPU it falls back to WebGL2 with float render targets: same maths, no live list, so it's slower.
- Views can be shared as links: `#v=cx,cy,zoom&p=θ₁,θ₂&twin&arm`.

## Embedding

The app is built for the root path and sends no frame-blocking headers. If a header is ever needed, use `frame-ancestors 'self' https://joncheng.ca https://*.joncheng.ca`.
