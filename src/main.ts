// Wires the map, the pendulum and the chrome together

import './style.css';
import { formatHash, parseHash } from './hash.ts';
import { attachMapInput } from './input.ts';
import { createLearn } from './learn.ts';
import { createLoop } from './loop.ts';
import { gridFor, type MapEngine } from './map/engine.ts';
import { createGlMap } from './map/gl.ts';
import { createGpuMap } from './map/gpu.ts';
import { createOverlay } from './overlay.ts';
import { TWIN_GAP, createPendulum } from './pendulum.ts';
import { SECONDS_PER_UNIT, T_MAX, canFlip, energy } from './physics.ts';
import { createUi } from './ui.ts';
import {
    fitView,
    inSquare,
    panBy,
    screenToPlane,
    settle,
    zoomAt,
    zoomLevel,
    type Size,
    type View,
} from './view.ts';

const SPEEDS = [1, 4, 16, 64];
const BUTTON_ZOOM = 0.5;
const DOUBLE_TAP_ZOOM = 0.4;
const START: [number, number] = [0.9, 1.7];
const READOUT_MS = 100;
const GPU_WAIT_MS = 4000;

const coarse = matchMedia('(pointer: coarse)').matches;
// map pixels cost most: cap below screen density
const MAP_DPR = coarse ? 1.25 : 1.5;
const TARGET_MS = coarse ? 6 : 9;

function fmt(n: number, digits = 3): string {
    return n.toFixed(digits).replace('-', '−');
}

async function start(root: HTMLElement): Promise<void> {
    const mapEl = root.querySelector<HTMLElement>('.pd-map');
    const pendEl = root.querySelector<HTMLElement>('.pd-pend');
    const canvas = mapEl?.querySelector<HTMLCanvasElement>('canvas');
    if (!mapEl || !pendEl || !canvas) return;
    const surface = canvas;

    let css: Size = { w: 1, h: 1 };
    let buffer: Size = { w: 1, h: 1 };
    let view: View = fitView(css);
    let fitted = false;
    let viewDirty = true;
    let mapBusy = false;
    let overlayDirty = true;
    let curve = false;
    let twin = false;
    let stats = import.meta.env.DEV;
    let speedIndex = 0;
    let hover: { x: number; y: number } | null = null;
    let engine: MapEngine | null = null;
    let lastReadout = 0;
    let frameMs: number | null = null;

    const shared = parseHash(location.hash);
    twin = shared.twin;

    const drawOverlay = createOverlay(mapEl);
    const pendulum = createPendulum(pendEl, (_t1, _t2, live) => {
        overlayDirty = true;
        if (!live) syncHash();
        loop.request();
    });

    const ui = createUi(mapEl, pendEl, {
        toggleLearn: () => learn.toggle(),
        zoomIn: () => zoomBy(BUTTON_ZOOM, css.w / 2, css.h / 2),
        zoomOut: () => zoomBy(1 / BUTTON_ZOOM, css.w / 2, css.h / 2),
        reset: () => setView(fitView(css)),
        toggleCurve: () => setCurve(!curve),
        toggleStats: () => {
            stats = !stats;
            ui.setPressed('stats', stats);
            loop.request();
        },
        togglePlay: () => setPlaying(!pendulum.playing),
        restart: () => pick(...pendulum.origin),
        toggleTwin: () => setTwin(!twin),
        cycleSpeed: () => cycleSpeed(),
        clearTrail: () => pendulum.clearTrail(),
    });

    const learn = createLearn(
        root,
        {
            reset: () => setView(fitView(css)),
            flyTo: (cx, cy, zoom) =>
                setView({ cx, cy, scale: fitView(css).scale / zoom }),
            pick: (t1, t2) => pick(t1, t2),
            setTwin,
            setCurve,
        },
        (open) => ui.setPressed('learn', open),
    );

    const loop = createLoop((dt, _now, ms) => {
        frameMs = ms;
        if (viewDirty && engine) {
            engine.setGrid(gridFor(view, css, buffer));
            viewDirty = false;
            mapBusy = true;
            overlayDirty = true;
        }
        if (mapBusy && engine) mapBusy = engine.frame(frameMs);
        if (pendulum.tick(dt)) overlayDirty = true;
        if (overlayDirty) {
            overlayDirty = false;
            drawOverlay({
                view,
                size: css,
                curve,
                origin: pendulum.origin,
                runs: pendulum.runs,
            });
        }
        const now = performance.now();
        if (now - lastReadout > READOUT_MS) {
            lastReadout = now;
            readouts();
        }
        if (mapBusy || pendulum.playing) loop.request();
    });

    function setView(next: View): void {
        view = settle(next, css);
        viewDirty = true;
        syncHash();
        loop.request();
    }

    function zoomBy(factor: number, px: number, py: number): void {
        setView(zoomAt(view, css, px, py, factor));
    }

    function setCurve(on: boolean): void {
        curve = on;
        ui.setPressed('curve', on);
        overlayDirty = true;
        loop.request();
    }

    function setTwin(on: boolean): void {
        twin = on;
        ui.setPressed('twin', on);
        pendulum.setTwin(on);
        syncHash();
        loop.request();
    }

    function cycleSpeed(): void {
        speedIndex = (speedIndex + 1) % SPEEDS.length;
        const speed = SPEEDS[speedIndex] ?? 1;
        pendulum.setSpeed(speed);
        ui.setSpeed(speed);
    }

    function setPlaying(on: boolean): void {
        pendulum.setPlaying(on);
        ui.setPlaying(on);
        loop.request();
    }

    function pick(t1: number, t2: number): void {
        pendulum.start(t1, t2);
        setPlaying(true);
        overlayDirty = true;
        syncHash();
    }

    let hashTimer = 0;
    function syncHash(): void {
        // replaceState is rate limited
        window.clearTimeout(hashTimer);
        hashTimer = window.setTimeout(() => {
            const home = fitView(css);
            const zoom = zoomLevel(view, css);
            const atHome =
                Math.abs(zoom - 1) < 1e-3 &&
                view.cx === home.cx &&
                view.cy === home.cy;
            const hash = formatHash({
                view: atHome ? null : { cx: view.cx, cy: view.cy, zoom },
                pick: pendulum.origin,
                twin,
            });
            history.replaceState(null, '', `#${hash}`);
        }, 250);
    }

    function readouts(): void {
        const runs = pendulum.runs;
        const main = runs[0];
        const t = pendulum.time;
        const lines: string[] = [];
        const [a, b] = pendulum.origin;
        lines.push(`START\tθ₁ ${fmt(a)}  θ₂ ${fmt(b)}`);
        lines.push(
            `TIME\t${t.toFixed(1)}  (${(t * SECONDS_PER_UNIT).toFixed(1)} s)`,
        );
        if (main) {
            const flip = main.flipAt;
            lines.push(
                `FLIP\t${
                    flip !== null
                        ? `at ${flip.toFixed(2)}`
                        : canFlip(a, b)
                          ? 'not yet'
                          : 'never: not enough energy'
                }`,
            );
            lines.push(`ΔE\t${(energy(main.s) - main.e0).toExponential(1)}`);
            const other = runs[1];
            if (other) {
                const gap = Math.hypot(
                    main.s.t1 - other.s.t1,
                    main.s.t2 - other.s.t2,
                );
                lines.push(
                    `GAP\t${gap.toExponential(1)} rad  (×${Math.round(gap / TWIN_GAP)})`,
                );
            }
        }
        ui.setReadout(lines);

        let text = '';
        if (engine) {
            const done = !mapBusy;
            text = done
                ? 'MAP DONE'
                : `MAP t ${Math.floor(engine.t)} / ${T_MAX}`;
            const zoom = zoomLevel(view, css);
            if (zoom > 1.01)
                text += ` · ${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×`;
            if (stats) {
                const live = engine.live;
                text += ` · ${engine.name} ${buffer.w}×${buffer.h} · ${engine.passes} PASS`;
                if (live !== null)
                    text += ` · ${live.toLocaleString('en')} LIVE`;
                if (frameMs !== null)
                    text += ` · ${Math.round(1000 / Math.max(frameMs, 1))} FPS`;
            }
        }
        ui.setMap(text);
        if (hover) {
            const p = screenToPlane(view, css, hover.x, hover.y);
            ui.setHint(
                inSquare(p.x, p.y)
                    ? `θ₁ ${fmt(p.x, 2)}  θ₂ ${fmt(p.y, 2)}`
                    : '',
            );
        } else {
            ui.setHint(coarse ? 'TAP · DRAG · PINCH' : 'CLICK · DRAG · SCROLL');
        }
    }

    let pinchFrom = view;
    attachMapInput(mapEl, {
        pan: (dx, dy) => setView(panBy(view, css, dx, dy)),
        zoom: (factor, px, py) => zoomBy(factor, px, py),
        pinchStart: () => {
            pinchFrom = view;
        },
        pinch: (px, py, spread) =>
            setView(zoomAt(pinchFrom, css, px, py, 1 / spread)),
        tap: (px, py) => {
            const p = screenToPlane(view, css, px, py);
            if (inSquare(p.x, p.y)) pick(p.x, p.y);
        },
        doubleTap: (px, py) => zoomBy(DOUBLE_TAP_ZOOM, px, py),
        hover: (px, py) => {
            hover = { x: px, y: py };
        },
        leave: () => {
            hover = null;
        },
    });
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target instanceof HTMLInputElement) return;
        const step = e.shiftKey ? 240 : 80;
        switch (e.key) {
            case 'ArrowLeft':
                setView(panBy(view, css, step, 0));
                break;
            case 'ArrowRight':
                setView(panBy(view, css, -step, 0));
                break;
            case 'ArrowUp':
                setView(panBy(view, css, 0, step));
                break;
            case 'ArrowDown':
                setView(panBy(view, css, 0, -step));
                break;
            case '+':
            case '=':
                zoomBy(BUTTON_ZOOM, css.w / 2, css.h / 2);
                break;
            case '-':
            case '_':
                zoomBy(1 / BUTTON_ZOOM, css.w / 2, css.h / 2);
                break;
            case '0':
                setView(fitView(css));
                break;
            case ' ':
                // buttons own space when focused
                if (e.target instanceof HTMLButtonElement) return;
                setPlaying(!pendulum.playing);
                break;
            default:
                switch (e.key.toLowerCase()) {
                    case 'l':
                        learn.toggle();
                        break;
                    case 'c':
                        setCurve(!curve);
                        break;
                    case 't':
                        setTwin(!twin);
                        break;
                    case 'r':
                        pick(...pendulum.origin);
                        break;
                    case 's':
                        cycleSpeed();
                        break;
                    case 'h':
                        stats = !stats;
                        ui.setPressed('stats', stats);
                        break;
                    default:
                        return;
                }
        }
        e.preventDefault();
        loop.request();
    });

    new ResizeObserver((entries) => {
        const rect = entries[entries.length - 1]?.contentRect;
        if (!rect) return;
        const before = css;
        css = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
        const dpr = Math.min(window.devicePixelRatio || 1, MAP_DPR);
        buffer = {
            w: Math.max(1, Math.round(css.w * dpr)),
            h: Math.max(1, Math.round(css.h * dpr)),
        };
        canvas.width = buffer.w;
        canvas.height = buffer.h;
        if (!fitted) {
            fitted = true;
            const v = shared.view;
            view = v
                ? settle(
                      {
                          cx: v.cx,
                          cy: v.cy,
                          scale: fitView(css).scale / v.zoom,
                      },
                      css,
                  )
                : fitView(css);
        } else {
            // keep the zoom level across resizes
            view = settle(
                {
                    ...view,
                    scale:
                        (view.scale * fitView(css).scale) /
                        fitView(before).scale,
                },
                css,
            );
        }
        viewDirty = true;
        overlayDirty = true;
        loop.request();
    }).observe(mapEl);

    new IntersectionObserver((entries) => {
        const latest = entries[entries.length - 1];
        if (latest) loop.setVisible(latest.isIntersecting);
    }).observe(root);

    // framed by joncheng.ca: report pointer for its custom cursor
    if (window.parent !== window) {
        window.addEventListener(
            'pointermove',
            (e) =>
                window.parent.postMessage(
                    { type: 'pointer', x: e.clientX, y: e.clientY },
                    '*',
                ),
            { passive: true },
        );
    }

    async function makeEngine(): Promise<MapEngine | null> {
        const onLost = (): void => {
            engine = null;
            void makeEngine().then((next) => {
                engine = next;
                viewDirty = true;
                loop.request();
            });
        };
        try {
            // some drivers never answer
            const timeout = new Promise<null>((resolve) =>
                window.setTimeout(() => resolve(null), GPU_WAIT_MS),
            );
            const gpu = await Promise.race([
                createGpuMap(surface, TARGET_MS, onLost),
                timeout,
            ]);
            if (gpu) return gpu;
        } catch (err) {
            console.warn('WebGPU unavailable, using WebGL2', err);
        }
        return createGlMap(surface);
    }

    const [t1, t2] = shared.pick ?? START;
    pendulum.setTwin(twin);
    ui.setPressed('twin', twin);
    ui.setPressed('stats', stats);
    pick(t1, t2);

    engine = await makeEngine();
    if (!engine) {
        mapEl.dataset.failed = '';
        ui.setMap(
            'THIS BROWSER CAN’T RUN THE MAP: NEEDS WEBGPU OR WEBGL2 FLOAT TARGETS',
        );
    }
    viewDirty = true;
    loop.request();

    // first visit, no link: open lessons
    if (!shared.pick) learn.toggle();
}

const root = document.querySelector<HTMLElement>('#pd-app');
if (root) void start(root);
