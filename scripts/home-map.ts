// Writes public/home-map.bin: the default view, precomputed

import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import {
    Worker,
    isMainThread,
    parentPort,
    workerData,
} from 'node:worker_threads';
import { PRIOR_N, encodeFlip, mirrorFlip } from '../src/map/prior.ts';
import {
    DT,
    T_MAX,
    canFlip,
    flipCode,
    flipped,
    rest,
    rk4,
} from '../src/physics.ts';

const N = PRIOR_N;
const STEPS = Math.round(T_MAX / DT);

function row(j: number): Uint8Array {
    const out = new Uint8Array(N);
    const t2 = Math.PI - ((j + 0.5) * 2 * Math.PI) / N;
    for (let i = 0; i < N; i++) {
        const t1 = -Math.PI + ((i + 0.5) * 2 * Math.PI) / N;
        if (!canFlip(t1, t2)) continue;
        let s = rest(t1, t2);
        out[i] = 1;
        for (let k = 1; k <= STEPS; k++) {
            s = rk4(s, DT);
            if (flipped(s)) {
                out[i] = encodeFlip(k * DT, flipCode(s));
                break;
            }
        }
    }
    return out;
}

if (isMainThread) {
    const map = new Uint8Array(N * N);
    // (θ₁, θ₂) → (−θ₁, −θ₂) mirrors the map: compute the top half
    const rows = Array.from({ length: N / 2 }, (_, j) => j);
    const workers = availableParallelism();
    let done = 0;
    const started = performance.now();
    await Promise.all(
        Array.from({ length: workers }, (_, w) => {
            const mine = rows.filter((j) => j % workers === w);
            return new Promise<void>((resolve, reject) => {
                const worker = new Worker(new URL(import.meta.url), {
                    workerData: mine,
                });
                worker.on(
                    'message',
                    ({ j, data }: { j: number; data: Uint8Array }) => {
                        map.set(data, j * N);
                        for (let i = 0; i < N; i++) {
                            map[(N - 1 - j) * N + (N - 1 - i)] = mirrorFlip(
                                data[i] ?? 0,
                            );
                        }
                        if (++done % 16 === 0)
                            process.stdout.write(
                                `\r${done}/${rows.length} rows`,
                            );
                    },
                );
                worker.on('error', reject);
                worker.on('exit', () => resolve());
            });
        }),
    );
    writeFileSync(new URL('../public/home-map.bin', import.meta.url), map);
    console.log(
        `\nwrote home-map.bin in ${((performance.now() - started) / 1000).toFixed(0)} s`,
    );
} else {
    for (const j of workerData as number[])
        parentPort?.postMessage({ j, data: row(j) });
}
