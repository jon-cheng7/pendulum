// Precomputed home map: one byte per pixel, shown before the live run

import { T_MAX } from '../physics.ts';
import { CODE_SPAN, NEVER, TIMEOUT, type Grid } from './engine.ts';

export const PRIOR_N = 512;
export const PRIOR_URL = '/home-map.bin';

// byte: 0 never, 1 timeout, else 2 + code · 63 + level
const LEVELS = 62;

export const PRIOR_GRID: Grid = {
    ox: -Math.PI,
    oy: Math.PI,
    px: (2 * Math.PI) / PRIOR_N,
    py: (-2 * Math.PI) / PRIOR_N,
    w: PRIOR_N,
    h: PRIOR_N,
};

export function encodeFlip(t: number, code: number): number {
    const level = Math.round(
        (Math.log(Math.max(t, 1)) / Math.log(T_MAX)) * LEVELS,
    );
    return 2 + code * (LEVELS + 1) + Math.min(LEVELS, level);
}

/** same flip seen from (−θ₁, −θ₂): other way round */
export function mirrorFlip(b: number): number {
    if (b < 2) return b;
    const code = Math.floor((b - 2) / (LEVELS + 1));
    return b + ((code ^ 1) - code) * (LEVELS + 1);
}

export function decodePrior(bytes: Uint8Array): Float32Array {
    const out = new Float32Array(bytes.length);
    bytes.forEach((b, i) => {
        if (b === 0) out[i] = NEVER;
        else if (b === 1) out[i] = TIMEOUT;
        else {
            const code = Math.floor((b - 2) / (LEVELS + 1));
            const level = (b - 2) % (LEVELS + 1);
            out[i] = T_MAX ** (level / LEVELS) + code * CODE_SPAN;
        }
    });
    return out;
}

export async function loadPrior(): Promise<Float32Array | null> {
    try {
        const res = await fetch(PRIOR_URL);
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return bytes.length === PRIOR_N * PRIOR_N ? decodePrior(bytes) : null;
    } catch {
        return null;
    }
}
