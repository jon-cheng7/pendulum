// WebGPU map: compute over a shrinking list of live pixels

import { DT, T_MAX } from '../physics.ts';
import argsCode from './args.wgsl?raw';
import drawCode from './draw.wgsl?raw';
import {
    PARAMS_BYTES,
    SNAPSHOT_T,
    STEPS,
    adaptPasses,
    writeParams,
    type Grid,
    type MapEngine,
} from './engine.ts';
import stepCode from './step.wgsl?raw';

interface Buffers {
    n: number;
    state: GPUBuffer;
    result: GPUBuffer;
    prev: GPUBuffer;
    list: [GPUBuffer, GPUBuffer];
    meta: [GPUBuffer, GPUBuffer];
    /** [side] = bind groups reading side, writing the other */
    step: [GPUBindGroup, GPUBindGroup];
    args: [GPUBindGroup, GPUBindGroup];
    draw: GPUBindGroup;
}

// lib.dom has the GPU types but not these flag globals
const SU = {
    MAP_READ: 0x1,
    COPY_SRC: 0x4,
    COPY_DST: 0x8,
    UNIFORM: 0x40,
    STORAGE: 0x80,
    INDIRECT: 0x100,
};
const COMPUTE = 0x4;
const FRAGMENT = 0x2;
const MAP_READ = 0x1;
const STORAGE = SU.STORAGE | SU.COPY_DST | SU.COPY_SRC;

export async function createGpuMap(
    canvas: HTMLCanvasElement,
    targetMs: number,
    onLost: () => void,
): Promise<MapEngine | null> {
    const gpu = navigator.gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({
        powerPreference: 'high-performance',
    });
    if (!adapter) return null;
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize:
                adapter.limits.maxStorageBufferBindingSize,
            maxBufferSize: adapter.limits.maxBufferSize,
        },
    });
    const maybe = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!maybe) return null;
    const context = maybe;
    const format = gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    let disposed = false;
    void device.lost.then(() => {
        if (!disposed) onLost();
    });

    const entry = (
        binding: number,
        type: GPUBufferBindingType,
        vis = COMPUTE,
    ) => ({
        binding,
        visibility: vis,
        buffer: { type },
    });
    const stepLayout = device.createBindGroupLayout({
        entries: [
            entry(0, 'uniform'),
            entry(1, 'storage'),
            entry(2, 'storage'),
            entry(3, 'read-only-storage'),
            entry(4, 'read-only-storage'),
            entry(5, 'storage'),
            entry(6, 'storage'),
            entry(7, 'read-only-storage'),
        ],
    });
    const argsLayout = device.createBindGroupLayout({
        entries: [
            entry(0, 'uniform'),
            entry(1, 'storage'),
            entry(2, 'storage'),
            entry(3, 'storage'),
        ],
    });
    const drawLayout = device.createBindGroupLayout({
        entries: [
            entry(0, 'uniform', FRAGMENT),
            entry(1, 'read-only-storage', FRAGMENT),
            entry(2, 'read-only-storage', FRAGMENT),
            entry(3, 'read-only-storage', FRAGMENT),
        ],
    });

    const stepModule = device.createShaderModule({ code: stepCode });
    const argsModule = device.createShaderModule({ code: argsCode });
    const drawModule = device.createShaderModule({ code: drawCode });
    const compute = (
        module: GPUShaderModule,
        layout: GPUBindGroupLayout,
        entryPoint: string,
    ) =>
        device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
            compute: { module, entryPoint },
        });
    const seedPipe = compute(stepModule, stepLayout, 'seed');
    const stepPipe = compute(stepModule, stepLayout, 'step');
    const seededPipe = compute(argsModule, argsLayout, 'seeded');
    const steppedPipe = compute(argsModule, argsLayout, 'stepped');
    const drawPipe = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [drawLayout] }),
        vertex: { module: drawModule, entryPoint: 'vs' },
        fragment: {
            module: drawModule,
            entryPoint: 'fs',
            targets: [{ format }],
        },
        primitive: { topology: 'triangle-list' },
    });

    const params = device.createBuffer({
        size: PARAMS_BYTES,
        usage: SU.UNIFORM | SU.COPY_DST,
    });
    const paramData = new ArrayBuffer(PARAMS_BYTES);
    const clock = device.createBuffer({ size: 4, usage: STORAGE });
    const readback = device.createBuffer({
        size: 4,
        usage: SU.MAP_READ | SU.COPY_DST,
    });
    const zero = new Uint32Array(4);

    let bufs: Buffers | null = null;
    let cur: Grid | null = null;
    let prev: Grid | null = null;
    /** side holding the live list */
    let side: 0 | 1 = 0;
    let seeded = false;
    let steps = 0;
    let live: number | null = null;
    let done = false;
    let passes = 4;
    let measuring = false;
    let reading = false;
    // results from an older run are stale
    let run = 0;

    function allocate(n: number): Buffers {
        const make = (size: number, usage = STORAGE) =>
            device.createBuffer({ size, usage });
        const state = make(n * 16);
        const result = make(n * 4);
        const prevBuf = make(n * 4);
        const list: [GPUBuffer, GPUBuffer] = [make(n * 4), make(n * 4)];
        const metaUsage = STORAGE | SU.INDIRECT;
        const meta: [GPUBuffer, GPUBuffer] = [
            make(16, metaUsage),
            make(16, metaUsage),
        ];
        const stepGroup = (from: 0 | 1) => {
            const to = from === 0 ? 1 : 0;
            return device.createBindGroup({
                layout: stepLayout,
                entries: [
                    params,
                    state,
                    result,
                    list[from],
                    meta[from],
                    list[to],
                    meta[to],
                    clock,
                ].map((buffer, binding) => ({ binding, resource: { buffer } })),
            });
        };
        // args: [out, in]
        const argsGroup = (out: 0 | 1) =>
            device.createBindGroup({
                layout: argsLayout,
                entries: [
                    params,
                    meta[out],
                    meta[out === 0 ? 1 : 0],
                    clock,
                ].map((buffer, binding) => ({
                    binding,
                    resource: { buffer },
                })),
            });
        const draw = device.createBindGroup({
            layout: drawLayout,
            entries: [params, result, prevBuf, clock].map(
                (buffer, binding) => ({
                    binding,
                    resource: { buffer },
                }),
            ),
        });
        return {
            n,
            state,
            result,
            prev: prevBuf,
            list,
            meta,
            step: [stepGroup(0), stepGroup(1)],
            args: [argsGroup(0), argsGroup(1)],
            draw,
        };
    }

    function release(b: Buffers): void {
        for (const buf of [b.state, b.result, b.prev, ...b.list, ...b.meta])
            buf.destroy();
    }

    function setGrid(grid: Grid): void {
        const n = grid.w * grid.h;
        if (!bufs || bufs.n !== n || !cur || cur.w !== grid.w) {
            if (bufs) release(bufs);
            bufs = allocate(n);
            prev = null;
        } else if (done || steps * DT >= SNAPSHOT_T) {
            const enc = device.createCommandEncoder();
            enc.copyBufferToBuffer(bufs.result, 0, bufs.prev, 0, n * 4);
            device.queue.submit([enc.finish()]);
            prev = cur;
        }
        cur = grid;
        writeParams(paramData, grid, prev, T_MAX);
        device.queue.writeBuffer(params, 0, paramData);
        device.queue.writeBuffer(bufs.meta[0], 0, zero);
        device.queue.writeBuffer(bufs.meta[1], 0, zero);
        device.queue.writeBuffer(clock, 0, zero, 0, 1);
        seeded = false;
        side = 0;
        steps = 0;
        live = null;
        done = false;
        run++;
    }

    function frame(): boolean {
        if (!bufs || !cur || disposed) return false;
        const b = bufs;
        const enc = device.createCommandEncoder();
        const work = !done;
        if (work) {
            const pass = enc.beginComputePass();
            if (!seeded) {
                // seed writes side 0: use the 1 → 0 groups
                pass.setPipeline(seedPipe);
                pass.setBindGroup(0, b.step[1]);
                pass.dispatchWorkgroups(
                    Math.ceil(cur.w / 8),
                    Math.ceil(cur.h / 8),
                );
                pass.setPipeline(seededPipe);
                pass.setBindGroup(0, b.args[0]);
                pass.dispatchWorkgroups(1);
                seeded = true;
                side = 0;
            }
            const left = Math.ceil((T_MAX / DT - steps) / STEPS);
            const count = Math.min(passes, left);
            for (let k = 0; k < count; k++) {
                const out = side === 0 ? 1 : 0;
                pass.setPipeline(stepPipe);
                pass.setBindGroup(0, b.step[side]);
                pass.dispatchWorkgroupsIndirect(b.meta[side], 4);
                pass.setPipeline(steppedPipe);
                pass.setBindGroup(0, b.args[out]);
                pass.dispatchWorkgroups(1);
                side = out;
            }
            pass.end();
            steps += count * STEPS;
            if (steps * DT >= T_MAX) done = true;
            if (!reading && !done)
                enc.copyBufferToBuffer(b.meta[side], 0, readback, 0, 4);
        }

        const view = context.getCurrentTexture().createView();
        const draw = enc.beginRenderPass({
            colorAttachments: [
                {
                    view,
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: [0, 0, 0, 0],
                },
            ],
        });
        draw.setPipeline(drawPipe);
        draw.setBindGroup(0, b.draw);
        draw.draw(3);
        draw.end();

        const started = performance.now();
        device.queue.submit([enc.finish()]);

        if (work && !measuring) {
            measuring = true;
            void device.queue.onSubmittedWorkDone().then(() => {
                measuring = false;
                passes = adaptPasses(
                    passes,
                    performance.now() - started,
                    targetMs,
                );
            });
        }
        if (work && !reading && !done) {
            reading = true;
            const from = run;
            void readback
                .mapAsync(MAP_READ)
                .then(() => {
                    const value =
                        new Uint32Array(readback.getMappedRange())[0] ?? 0;
                    readback.unmap();
                    if (from !== run) return;
                    live = value;
                    if (value === 0 && seeded) done = true;
                })
                .catch(() => {})
                .finally(() => {
                    reading = false;
                });
        }
        return !done;
    }

    return {
        name: 'WEBGPU',
        setGrid,
        frame: () => frame(),
        get t() {
            return Math.min(T_MAX, steps * DT);
        },
        get live() {
            return done ? 0 : live;
        },
        get passes() {
            return passes;
        },
        dispose() {
            disposed = true;
            if (bufs) release(bufs);
            device.destroy();
        },
    };
}
