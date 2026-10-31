// Flip-time map colouring

const NEVER = -1.0;
const TIMEOUT = 1e9;
const CODE_SPAN = 2048.0;

struct Grid {
    origin: vec2f,
    pitch: vec2f,
    size: vec2u,
    pad: vec2u,
}

struct Params {
    cur: Grid,
    prev: Grid,
    dt: f32,
    tMax: f32,
    steps: u32,
    prevValid: u32,
    scrub: f32,
    mode: u32,
    pad: vec2u,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> result: array<f32>;
@group(0) @binding(2) var<storage, read> prev: array<f32>;
@group(0) @binding(3) var<storage, read> clock: u32;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
    return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn log_t(t: f32) -> f32 {
    return clamp(log2(max(t, 1.0)) / log2(P.tMax), 0.0, 1.0);
}

// quick → slow
fn palette(t: f32) -> vec3f {
    let u = log_t(t) * 4.0;
    let c0 = vec3f(0.07, 0.06, 0.15);
    let c1 = vec3f(0.17, 0.19, 0.5);
    let c2 = vec3f(0.17, 0.6, 0.68);
    let c3 = vec3f(0.77, 0.98, 0.27);
    let c4 = vec3f(1.0, 1.0, 0.9);
    if (u < 1.0) {
        return mix(c0, c1, u);
    }
    if (u < 2.0) {
        return mix(c1, c2, u - 1.0);
    }
    if (u < 3.0) {
        return mix(c2, c3, u - 2.0);
    }
    return mix(c3, c4, u - 3.0);
}

// top ↺, top ↻, bottom ↺, bottom ↻
fn arm_colour(code: f32, t: f32) -> vec3f {
    var c = vec3f(0.77, 0.98, 0.27);
    if (code == 1.0) {
        c = vec3f(0.27, 0.85, 0.95);
    } else if (code == 2.0) {
        c = vec3f(0.58, 0.4, 1.0);
    } else if (code == 3.0) {
        c = vec3f(1.0, 0.56, 0.2);
    }
    return c * (0.3 + 0.7 * log_t(t));
}

// (time, code)
fn decode(r: f32) -> vec2f {
    let code = floor(r / CODE_SPAN);
    return vec2f(r - code * CODE_SPAN, code);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let ij = vec2u(pos.xy);
    let now = f32(clock) * P.dt;
    let scrubbing = P.scrub < P.tMax;
    let shown = select(now, min(now, P.scrub), scrubbing);
    let running = vec4f(palette(shown) * 0.4, 1.0);
    var r = result[ij.y * P.cur.size.x + ij.x];
    // still running: borrow the last finished map if it agrees so far
    if (r == 0.0 && P.prevValid == 1u) {
        let a = P.cur.origin + (vec2f(ij) + 0.5) * P.cur.pitch;
        let q = (a - P.prev.origin) / P.prev.pitch;
        if (all(q >= vec2f(0.0)) && all(q < vec2f(P.prev.size))) {
            let pv = prev[u32(q.y) * P.prev.size.x + u32(q.x)];
            if (pv == NEVER || pv >= TIMEOUT || (pv > 0.0 && decode(pv).x > now)) {
                r = pv;
            }
        }
    }
    if (r < -1.5) {
        return vec4f(0.0);
    }
    if (r == NEVER) {
        return vec4f(0.03, 0.035, 0.03, 1.0);
    }
    if (r == 0.0) {
        return running;
    }
    if (r >= TIMEOUT) {
        return select(vec4f(0.15, 0.15, 0.15, 1.0), running, scrubbing);
    }
    let d = decode(r);
    if (scrubbing && d.x > shown) {
        return running;
    }
    if (P.mode == 1u) {
        return vec4f(arm_colour(d.y, d.x), 1.0);
    }
    return vec4f(palette(d.x), 1.0);
}
