// Live pendulum: float64 sim, arms, accumulated trail

import {
    DT,
    SECONDS_PER_UNIT,
    energy,
    flipped,
    rest,
    rk4,
    wrap,
    type State,
} from './physics.ts';

export interface Run {
    s: State;
    e0: number;
    flipAt: number | null;
    /** wrapped (θ₁, θ₂) history for the map, ring buffer */
    path: Float32Array;
    pathLen: number;
    pathHead: number;
    /** last trail point, CSS px */
    last: [number, number] | null;
}

export interface Pendulum {
    readonly runs: readonly Run[];
    readonly time: number;
    readonly playing: boolean;
    readonly origin: [number, number];
    start(t1: number, t2: number): void;
    setTwin(on: boolean): void;
    setPlaying(on: boolean): void;
    setSpeed(speed: number): void;
    clearTrail(): void;
    /** faint pose for a start under the pointer */
    setGhost(angles: [number, number] | null): void;
    /** real seconds; true if anything moved */
    tick(dt: number): boolean;
}

/** twin starts this far off in θ₂ */
export const TWIN_GAP = 1e-3;
const PATH_POINTS = 1500;
// time between path samples
const PATH_T = 0.02;
const MAX_STEPS_PER_TICK = 6000;
const HIT_PX = 32;
const MAX_DPR = 2;
const RESIZE_MS = 120;

const LIME = '#c5fb45';
const CYAN = '#45f0fb';
const TRAILS = ['rgba(197,251,69,0.45)', 'rgba(69,240,251,0.45)'];

function newRun(t1: number, t2: number): Run {
    const s = rest(t1, t2);
    return {
        s,
        e0: energy(s),
        flipAt: null,
        path: new Float32Array(PATH_POINTS * 2),
        pathLen: 0,
        pathHead: 0,
        last: null,
    };
}

function record(run: Run): void {
    run.path[run.pathHead * 2] = wrap(run.s.t1);
    run.path[run.pathHead * 2 + 1] = wrap(run.s.t2);
    run.pathHead = (run.pathHead + 1) % PATH_POINTS;
    run.pathLen = Math.min(PATH_POINTS, run.pathLen + 1);
}

export function createPendulum(
    root: HTMLElement,
    /** dragging a bob: live = still moving */
    onSet: (t1: number, t2: number, live: boolean) => void,
): Pendulum {
    const trail = document.createElement('canvas');
    trail.className = 'pd-trail';
    const arms = document.createElement('canvas');
    arms.className = 'pd-arms';
    root.append(trail, arms);
    const trailCtx = trail.getContext('2d');
    const armsCtx = arms.getContext('2d');

    let w = 1;
    let h = 1;
    let dpr = 1;
    let runs: Run[] = [];
    let origin: [number, number] = [0, 0];
    let time = 0;
    let playing = true;
    let twin = false;
    let speed = 1;
    let sinceSample = 0;
    let dirty = true;
    let ghost: [number, number] | null = null;

    const arm = (): number => Math.min(w, h) * 0.22;
    const pivot = (): [number, number] => [w / 2, h / 2];

    function bobs(s: State): [[number, number], [number, number]] {
        const [px, py] = pivot();
        const l = arm();
        const x1 = px + l * Math.sin(s.t1);
        const y1 = py + l * Math.cos(s.t1);
        return [
            [x1, y1],
            [x1 + l * Math.sin(s.t2), y1 + l * Math.cos(s.t2)],
        ];
    }

    function resize(): void {
        const oldArm = arm() * dpr;
        const old = document.createElement('canvas');
        old.width = trail.width;
        old.height = trail.height;
        old.getContext('2d')?.drawImage(trail, 0, 0);

        w = Math.max(1, root.clientWidth);
        h = Math.max(1, root.clientHeight);
        dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        for (const c of [trail, arms]) {
            c.width = Math.round(w * dpr);
            c.height = Math.round(h * dpr);
        }
        armsCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (trailCtx) {
            // keep the trail: scale it about the pivot
            const k = (arm() * dpr) / oldArm;
            trailCtx.setTransform(1, 0, 0, 1, 0, 0);
            trailCtx.drawImage(
                old,
                trail.width / 2 - (old.width / 2) * k,
                trail.height / 2 - (old.height / 2) * k,
                old.width * k,
                old.height * k,
            );
            trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        for (const run of runs) run.last = null;
        dirty = true;
    }

    // first size now, later ones once a drag settles
    let resizeTimer = 0;
    new ResizeObserver(() => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, RESIZE_MS);
    }).observe(root);
    resize();

    function clearTrail(): void {
        trailCtx?.clearRect(0, 0, w, h);
        for (const run of runs) run.last = null;
    }

    function start(t1: number, t2: number): void {
        origin = [t1, t2];
        time = 0;
        sinceSample = 0;
        runs = [newRun(t1, t2)];
        if (twin) runs.push(newRun(t1, t2 + TWIN_GAP));
        for (const run of runs) record(run);
        clearTrail();
        dirty = true;
    }

    function drawTrail(points: [number, number][][]): void {
        if (!trailCtx) return;
        trailCtx.globalCompositeOperation = 'lighter';
        trailCtx.lineWidth = 1.2;
        trailCtx.lineJoin = 'round';
        // twin underneath
        for (let i = points.length - 1; i >= 0; i--) {
            const run = runs[i];
            const line = points[i];
            if (!run || !line || line.length === 0) continue;
            trailCtx.strokeStyle = TRAILS[i] ?? TRAILS[0]!;
            trailCtx.beginPath();
            const from = run.last ?? line[0]!;
            trailCtx.moveTo(from[0], from[1]);
            for (const [x, y] of line) trailCtx.lineTo(x, y);
            trailCtx.stroke();
            run.last = line[line.length - 1] ?? run.last;
        }
    }

    function drawArms(): void {
        if (!armsCtx) return;
        armsCtx.clearRect(0, 0, w, h);
        const [px, py] = pivot();
        if (ghost) {
            const [b1, b2] = bobs(rest(ghost[0], ghost[1]));
            armsCtx.strokeStyle = 'rgba(69,240,251,0.6)';
            armsCtx.lineWidth = 1.5;
            armsCtx.setLineDash([4, 4]);
            armsCtx.beginPath();
            armsCtx.moveTo(px, py);
            armsCtx.lineTo(b1[0], b1[1]);
            armsCtx.lineTo(b2[0], b2[1]);
            armsCtx.stroke();
            armsCtx.setLineDash([]);
            for (const [[x, y], r] of [
                [b1, 6],
                [b2, 8],
            ] as const) {
                armsCtx.beginPath();
                armsCtx.arc(x, y, r, 0, Math.PI * 2);
                armsCtx.stroke();
            }
        }
        // twin underneath
        for (let i = runs.length - 1; i >= 0; i--) {
            const run = runs[i];
            if (!run) continue;
            const [b1, b2] = bobs(run.s);
            const main = i === 0;
            armsCtx.globalAlpha = main ? 1 : 0.7;
            armsCtx.strokeStyle = main ? 'rgba(229,229,229,0.85)' : CYAN;
            armsCtx.lineWidth = 2;
            armsCtx.beginPath();
            armsCtx.moveTo(px, py);
            armsCtx.lineTo(b1[0], b1[1]);
            armsCtx.lineTo(b2[0], b2[1]);
            armsCtx.stroke();
            armsCtx.fillStyle = main ? '#e5e5e5' : CYAN;
            armsCtx.beginPath();
            armsCtx.arc(b1[0], b1[1], 7, 0, Math.PI * 2);
            armsCtx.fill();
            armsCtx.fillStyle = main ? LIME : CYAN;
            armsCtx.beginPath();
            armsCtx.arc(b2[0], b2[1], 9, 0, Math.PI * 2);
            armsCtx.fill();
        }
        armsCtx.globalAlpha = 1;
        armsCtx.fillStyle = '#e5e5e5';
        armsCtx.fillRect(px - 3, py - 3, 6, 6);
    }

    function advance(units: number): void {
        const n = Math.min(MAX_STEPS_PER_TICK, Math.round(units / DT));
        const lines: [number, number][][] = runs.map(() => []);
        // fewer trail points at high speed
        const every = Math.max(1, Math.floor(n / 400));
        for (let k = 0; k < n; k++) {
            time += DT;
            sinceSample += DT;
            const sample = sinceSample >= PATH_T;
            if (sample) sinceSample = 0;
            runs.forEach((run, i) => {
                run.s = rk4(run.s, DT);
                if (run.flipAt === null && flipped(run.s)) run.flipAt = time;
                if (sample) record(run);
                if (k % every === 0 || k === n - 1)
                    lines[i]?.push(bobs(run.s)[1]);
            });
        }
        drawTrail(lines);
    }

    // drag a bob to set the start
    let drag: 1 | 2 | null = null;
    function local(e: PointerEvent): [number, number] {
        const box = root.getBoundingClientRect();
        return [e.clientX - box.left, e.clientY - box.top];
    }
    root.addEventListener('pointerdown', (e) => {
        const run = runs[0];
        if (
            !run ||
            (e.target instanceof Element && e.target.closest('[data-pd-ui]'))
        )
            return;
        const [x, y] = local(e);
        const [b1, b2] = bobs(run.s);
        const d1 = Math.hypot(x - b1[0], y - b1[1]);
        const d2 = Math.hypot(x - b2[0], y - b2[1]);
        if (Math.min(d1, d2) > HIT_PX) return;
        drag = d2 <= d1 ? 2 : 1;
        root.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    root.addEventListener('pointermove', (e) => {
        const run = runs[0];
        if (!drag || !run) return;
        const [x, y] = local(e);
        const [px, py] = pivot();
        let { t1, t2 } = run.s;
        if (drag === 1) {
            // top arm moves, bottom keeps its absolute angle
            t1 = Math.atan2(x - px, y - py);
            t2 = wrap(t2);
        } else {
            const b1 = bobs(run.s)[0];
            t1 = wrap(t1);
            t2 = Math.atan2(x - b1[0], y - b1[1]);
        }
        start(t1, t2);
        onSet(t1, t2, true);
    });
    const end = (): void => {
        if (!drag) return;
        drag = null;
        onSet(origin[0], origin[1], false);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);

    return {
        get runs() {
            return runs;
        },
        get time() {
            return time;
        },
        get playing() {
            return playing && drag === null;
        },
        get origin() {
            return origin;
        },
        start,
        setTwin(on) {
            twin = on;
            start(origin[0], origin[1]);
        },
        setPlaying(on) {
            playing = on;
        },
        setSpeed(next) {
            speed = next;
        },
        clearTrail,
        setGhost(angles) {
            ghost = angles;
            dirty = true;
        },
        tick(dt) {
            const moving = playing && drag === null && runs.length > 0;
            if (moving) advance((dt * speed) / SECONDS_PER_UNIT);
            if (!moving && !dirty) return false;
            dirty = false;
            drawArms();
            return true;
        },
    };
}
