// WebGL2 map fallback: ping-pong float textures

import { DT, T_MAX } from '../physics.ts';
import countSrc from './count.frag.glsl?raw';
import drawSrc from './draw.frag.glsl?raw';
import {
    MAX_PASSES,
    SNAPSHOT_T,
    STEPS,
    type Grid,
    type Look,
    type MapEngine,
} from './engine.ts';
import seedSrc from './seed.frag.glsl?raw';
import stepSrc from './step.frag.glsl?raw';

const VERT = `#version 300 es
void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

interface Program {
    program: WebGLProgram;
    u: (name: string) => WebGLUniformLocation | null;
}

interface Side {
    state: WebGLTexture;
    result: WebGLTexture;
    fbo: WebGLFramebuffer;
    /** result only, for blits */
    read: WebGLFramebuffer;
}

function compile(gl: WebGL2RenderingContext, frag: string): Program {
    const program = gl.createProgram();
    for (const [type, src] of [
        [gl.VERTEX_SHADER, VERT],
        [gl.FRAGMENT_SHADER, frag],
    ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('shader');
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) ?? 'compile');
        }
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    }
    return { program, u: (name) => gl.getUniformLocation(program, name) };
}

export function createGlMap(canvas: HTMLCanvasElement): MapEngine | null {
    const context = canvas.getContext('webgl2', {
        antialias: false,
        premultipliedAlpha: true,
    });
    if (!context || !context.getExtension('EXT_color_buffer_float'))
        return null;
    const gl: WebGL2RenderingContext = context;

    let seed: Program, step: Program, count: Program, draw: Program;
    try {
        seed = compile(gl, seedSrc);
        step = compile(gl, stepSrc);
        count = compile(gl, countSrc);
        draw = compile(gl, drawSrc);
    } catch (err) {
        console.error(err);
        return null;
    }
    gl.bindVertexArray(gl.createVertexArray());

    function texture(format: number, w: number, h: number): WebGLTexture {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return tex;
    }

    function framebuffer(...attachments: WebGLTexture[]): WebGLFramebuffer {
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        attachments.forEach((tex, i) =>
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0 + i,
                gl.TEXTURE_2D,
                tex,
                0,
            ),
        );
        gl.drawBuffers(attachments.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
        return fbo;
    }

    let sides: [Side, Side] | null = null;
    let prevTex: WebGLTexture | null = null;
    let prevFbo: WebGLFramebuffer | null = null;
    let cur: Grid | null = null;
    let prev: Grid | null = null;
    let side: 0 | 1 = 0;
    let seeded = false;
    let steps = 0;
    let done = false;
    let passes = 2;
    // vsync interval, learnt from the quickest frames
    let base = 1000 / 60;
    let query: WebGLQuery | null = null;
    let look: Look = { scrub: null, mode: 'time' };
    let prevSize = { w: 0, h: 0 };

    function makePrev(w: number, h: number): void {
        if (prevTex) gl.deleteTexture(prevTex);
        if (prevFbo) gl.deleteFramebuffer(prevFbo);
        prevTex = texture(gl.R32F, w, h);
        prevFbo = framebuffer(prevTex);
        prevSize = { w, h };
    }

    function free(): void {
        if (sides) {
            for (const s of sides) {
                gl.deleteTexture(s.state);
                gl.deleteTexture(s.result);
                gl.deleteFramebuffer(s.fbo);
                gl.deleteFramebuffer(s.read);
            }
        }
    }

    function allocate(w: number, h: number): void {
        free();
        const make = (): Side => {
            const state = texture(gl.RGBA32F, w, h);
            const result = texture(gl.R32F, w, h);
            return {
                state,
                result,
                fbo: framebuffer(state, result),
                read: framebuffer(result),
            };
        };
        sides = [make(), make()];
        // keep a prior that's still standing in
        if (!prev) makePrev(w, h);
    }

    function fullscreen(): void {
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function setGrid(grid: Grid): void {
        if (!sides || !cur || cur.w !== grid.w || cur.h !== grid.h) {
            allocate(grid.w, grid.h);
        } else if (done || steps * DT >= SNAPSHOT_T) {
            if (prevSize.w !== grid.w || prevSize.h !== grid.h) {
                makePrev(grid.w, grid.h);
            }
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sides[side].read);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, prevFbo);
            gl.blitFramebuffer(
                0,
                0,
                grid.w,
                grid.h,
                0,
                0,
                grid.w,
                grid.h,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST,
            );
            prev = cur;
        }
        cur = grid;
        seeded = false;
        steps = 0;
        done = false;
        if (query) {
            gl.deleteQuery(query);
            query = null;
        }
    }

    function bindTex(
        unit: number,
        tex: WebGLTexture | null,
        loc: WebGLUniformLocation | null,
    ): void {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(loc, unit);
    }

    function frame(frameMs: number | null): boolean {
        if (!sides || !cur) return false;
        const g = cur;
        if (frameMs !== null && frameMs > 4) {
            base = Math.min(base * 1.01, frameMs);
            if (frameMs > base * 1.5)
                passes = Math.max(1, Math.floor(passes * 0.7));
            else if (frameMs < base * 1.2)
                passes = Math.min(MAX_PASSES, passes + 1);
        }

        if (!done) {
            gl.viewport(0, 0, g.w, g.h);
            gl.disable(gl.BLEND);
            if (!seeded) {
                gl.useProgram(seed.program);
                gl.uniform2f(seed.u('uOrigin'), g.ox, g.oy);
                gl.uniform2f(seed.u('uPitch'), g.px, g.py);
                gl.uniform2i(seed.u('uSize'), g.w, g.h);
                gl.bindFramebuffer(gl.FRAMEBUFFER, sides[0].fbo);
                fullscreen();
                seeded = true;
                side = 0;
            }

            // answer from an earlier frame
            if (
                query &&
                gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
            ) {
                if (!gl.getQueryParameter(query, gl.QUERY_RESULT)) done = true;
                gl.deleteQuery(query);
                query = null;
            }

            const left = Math.ceil((T_MAX / DT - steps) / STEPS);
            const n = done ? 0 : Math.min(passes, left);
            gl.useProgram(step.program);
            gl.uniform1i(step.u('uSteps'), STEPS);
            gl.uniform1f(step.u('uDt'), DT);
            gl.uniform1f(step.u('uTMax'), T_MAX);
            for (let k = 0; k < n; k++) {
                const from = sides[side];
                const to = side === 0 ? 1 : 0;
                gl.bindFramebuffer(gl.FRAMEBUFFER, sides[to].fbo);
                bindTex(0, from.state, step.u('uState'));
                bindTex(1, from.result, step.u('uResult'));
                gl.uniform1i(step.u('uBase'), steps);
                fullscreen();
                steps += STEPS;
                side = to;
            }
            if (steps * DT >= T_MAX) done = true;

            if (!done && !query) {
                query = gl.createQuery();
                gl.useProgram(count.program);
                bindTex(0, sides[side].result, count.u('uResult'));
                gl.bindFramebuffer(
                    gl.FRAMEBUFFER,
                    sides[side === 0 ? 1 : 0].fbo,
                );
                gl.colorMask(false, false, false, false);
                gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, query);
                fullscreen();
                gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
                gl.colorMask(true, true, true, true);
            }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(draw.program);
        bindTex(0, sides[side].result, draw.u('uResult'));
        bindTex(1, prevTex, draw.u('uPrev'));
        gl.uniform2f(draw.u('uOrigin'), g.ox, g.oy);
        gl.uniform2f(draw.u('uPitch'), g.px, g.py);
        gl.uniform2i(draw.u('uSize'), g.w, g.h);
        const p = prev ?? g;
        gl.uniform2f(draw.u('uPrevOrigin'), p.ox, p.oy);
        gl.uniform2f(draw.u('uPrevPitch'), p.px, p.py);
        gl.uniform2i(draw.u('uPrevSize'), p.w, p.h);
        gl.uniform1i(draw.u('uPrevValid'), prev ? 1 : 0);
        gl.uniform1f(draw.u('uT'), Math.min(T_MAX, steps * DT));
        gl.uniform1f(draw.u('uTMax'), T_MAX);
        gl.uniform1f(draw.u('uScrub'), look.scrub ?? T_MAX);
        gl.uniform1i(draw.u('uMode'), look.mode === 'arm' ? 1 : 0);
        fullscreen();
        return !done;
    }

    return {
        name: 'WEBGL2',
        setGrid,
        setLook(next) {
            look = next;
        },
        setPrior(grid, data) {
            if (prev) return;
            makePrev(grid.w, grid.h);
            // GL rows run bottom up
            const flipped = new Float32Array(data.length);
            for (let j = 0; j < grid.h; j++) {
                const from = (grid.h - 1 - j) * grid.w;
                flipped.set(data.subarray(from, from + grid.w), j * grid.w);
            }
            gl.bindTexture(gl.TEXTURE_2D, prevTex);
            gl.texSubImage2D(
                gl.TEXTURE_2D,
                0,
                0,
                0,
                grid.w,
                grid.h,
                gl.RED,
                gl.FLOAT,
                flipped,
            );
            prev = grid;
        },
        frame,
        get t() {
            return Math.min(T_MAX, steps * DT);
        },
        get live() {
            return done ? 0 : null;
        },
        get passes() {
            return passes;
        },
        dispose() {
            free();
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        },
    };
}
