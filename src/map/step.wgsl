// Flip-time map: seed the grid, step live pixels

const PI = 3.14159265;
const OUTSIDE = -2.0;
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
@group(0) @binding(1) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;
@group(0) @binding(3) var<storage, read> listIn: array<u32>;
// also the indirect args, so read-only here
@group(0) @binding(4) var<storage, read> metaIn: array<u32, 4>;
@group(0) @binding(5) var<storage, read_write> listOut: array<u32>;
@group(0) @binding(6) var<storage, read_write> metaOut: array<atomic<u32>, 4>;
@group(0) @binding(7) var<storage, read> clock: u32;

// (θ₁, θ₂, ω₁, ω₂) → (ω₁, ω₂, α₁, α₂)
fn deriv(s: vec4f) -> vec4f {
    let s1 = sin(s.x);
    let c1 = cos(s.x);
    let s2 = sin(s.y);
    let c2 = cos(s.y);
    let sd = s1 * c2 - c1 * s2;
    let cd = c1 * c2 + s1 * s2;
    // 3 − cos 2Δ
    let den = 2.0 + 2.0 * sd * sd;
    // sin(θ₁ − 2θ₂) = sin(Δ − θ₂)
    let a1 = (-3.0 * s1 - (sd * c2 - cd * s2) - 2.0 * sd * (s.w * s.w + s.z * s.z * cd)) / den;
    let a2 = 2.0 * sd * (2.0 * s.z * s.z + 2.0 * c1 + s.w * s.w * cd) / den;
    return vec4f(s.zw, a1, a2);
}

fn rk4(s: vec4f, h: f32) -> vec4f {
    let k1 = deriv(s);
    let k2 = deriv(s + 0.5 * h * k1);
    let k3 = deriv(s + 0.5 * h * k2);
    let k4 = deriv(s + h * k3);
    return s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

@compute @workgroup_size(8, 8)
fn seed(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= P.cur.size.x || id.y >= P.cur.size.y) {
        return;
    }
    let i = id.y * P.cur.size.x + id.x;
    let a = P.cur.origin + (vec2f(id.xy) + 0.5) * P.cur.pitch;
    if (abs(a.x) > PI || abs(a.y) > PI) {
        result[i] = OUTSIDE;
        return;
    }
    if (2.0 * cos(a.x) + cos(a.y) > 1.0) {
        result[i] = NEVER;
        return;
    }
    result[i] = 0.0;
    state[i] = vec4f(a, 0.0, 0.0);
    listOut[atomicAdd(&metaOut[0], 1u)] = i;
}

@compute @workgroup_size(64)
fn step(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) li: u32) {
    let n = (wg.y * 65535u + wg.x) * 64u + li;
    if (n >= metaIn[0]) {
        return;
    }
    let i = listIn[n];
    var s = state[i];
    for (var k = 1u; k <= P.steps; k++) {
        s = rk4(s, P.dt);
        if (abs(s.x) > PI || abs(s.y) > PI) {
            result[i] = f32(clock + k) * P.dt;
            return;
        }
    }
    if (f32(clock + P.steps) * P.dt >= P.tMax) {
        result[i] = TIMEOUT;
        return;
    }
    state[i] = s;
    listOut[atomicAdd(&metaOut[0], 1u)] = i;
}
