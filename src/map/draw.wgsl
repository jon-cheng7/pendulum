// Flip-time map colouring

const NEVER = -1.0;
const TIMEOUT = 1e9;

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

// log time: quick → slow
fn palette(t: f32) -> vec3f {
    let u = clamp(log2(max(t, 1.0)) / log2(P.tMax), 0.0, 1.0) * 4.0;
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

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let ij = vec2u(pos.xy);
    let t = f32(clock) * P.dt;
    var r = result[ij.y * P.cur.size.x + ij.x];
    // still running: borrow the last finished map if it agrees so far
    if (r == 0.0 && P.prevValid == 1u) {
        let a = P.cur.origin + (vec2f(ij) + 0.5) * P.cur.pitch;
        let q = (a - P.prev.origin) / P.prev.pitch;
        if (all(q >= vec2f(0.0)) && all(q < vec2f(P.prev.size))) {
            let pv = prev[u32(q.y) * P.prev.size.x + u32(q.x)];
            if (pv > t || pv == NEVER) {
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
    if (r >= TIMEOUT) {
        return vec4f(0.15, 0.15, 0.15, 1.0);
    }
    if (r == 0.0) {
        return vec4f(palette(t) * 0.4, 1.0);
    }
    return vec4f(palette(r), 1.0);
}
