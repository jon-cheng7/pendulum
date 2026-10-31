// Map engine contract and grid maths

import { DT } from '../physics.ts';
import type { Size, View } from '../view.ts';

/** θ at pixel (i, j) = origin + (i + ½, j + ½) · pitch, j down */
export interface Grid {
    ox: number;
    oy: number;
    px: number;
    py: number;
    w: number;
    h: number;
}

/** colouring; scrub null = show everything known */
export interface Look {
    scrub: number | null;
    mode: ColourMode;
}

export type ColourMode = 'time' | 'arm';

export interface MapEngine {
    readonly name: string;
    /** restarts the run */
    setGrid(grid: Grid): void;
    /** redraw needed after */
    setLook(look: Look): void;
    /** placeholder results for a grid, until the run catches up */
    setPrior(grid: Grid, results: Float32Array): void;
    /** one frame of work + draw; false once finished */
    frame(frameMs: number | null): boolean;
    /** simulated time every live pixel has reached */
    readonly t: number;
    /** live pixels, when known */
    readonly live: number | null;
    readonly passes: number;
    dispose(): void;
}

/** steps per pass: shorter passes drop finished pixels sooner */
export const STEPS = 32;
export const PASS_T = STEPS * DT;
/** far enough along to reuse while panning */
export const SNAPSHOT_T = 20;
export const MAX_PASSES = 400;

export function gridFor(view: View, css: Size, buffer: Size): Grid {
    return {
        ox: view.cx - (css.w / 2) * view.scale,
        oy: view.cy + (css.h / 2) * view.scale,
        px: (css.w * view.scale) / buffer.w,
        py: -(css.h * view.scale) / buffer.h,
        w: buffer.w,
        h: buffer.h,
    };
}

/** result = flip time + code · CODE_SPAN, code = arm · 2 + clockwise */
export const CODE_SPAN = 2048;
export const NEVER = -1;
export const TIMEOUT = 1e9;

/** cur + prev grids, dt, tMax, steps, prevValid, scrub, mode */
export const PARAMS_BYTES = 96;

export function writeParams(
    out: ArrayBuffer,
    cur: Grid,
    prev: Grid | null,
    tMax: number,
    look: Look,
): void {
    const f = new Float32Array(out);
    const u = new Uint32Array(out);
    const put = (at: number, g: Grid): void => {
        f[at] = g.ox;
        f[at + 1] = g.oy;
        f[at + 2] = g.px;
        f[at + 3] = g.py;
        u[at + 4] = g.w;
        u[at + 5] = g.h;
    };
    put(0, cur);
    put(8, prev ?? cur);
    f[16] = DT;
    f[17] = tMax;
    u[18] = STEPS;
    u[19] = prev ? 1 : 0;
    f[20] = look.scrub ?? tMax;
    u[21] = look.mode === 'arm' ? 1 : 0;
}

/** AIMD on measured cost per frame */
export function adaptPasses(
    passes: number,
    ms: number,
    targetMs: number,
): number {
    if (ms > targetMs) return Math.max(1, Math.floor(passes * 0.7));
    if (ms < targetMs * 0.7)
        return Math.min(
            MAX_PASSES,
            passes + Math.max(1, Math.round(passes * 0.2)),
        );
    return passes;
}
