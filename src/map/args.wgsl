// Live count → indirect dispatch args, advance the clock

struct Params {
    pad: array<vec4u, 4>,
    dt: f32,
    tMax: f32,
    steps: u32,
    prevValid: u32,
}

@group(0) @binding(0) var<uniform> P: Params;
// [count, x, y, z]
@group(0) @binding(1) var<storage, read_write> metaOut: array<u32, 4>;
@group(0) @binding(2) var<storage, read_write> metaIn: array<u32, 4>;
@group(0) @binding(3) var<storage, read_write> clock: u32;

fn write_args() {
    let groups = (metaOut[0] + 63u) / 64u;
    // 65535 cap per dimension
    metaOut[1] = min(groups, 65535u);
    metaOut[2] = (groups + 65534u) / 65535u;
    metaOut[3] = 1u;
}

@compute @workgroup_size(1)
fn seeded() {
    write_args();
}

@compute @workgroup_size(1)
fn stepped() {
    write_args();
    // spent list is next step's output
    metaIn[0] = 0u;
    clock += P.steps;
}
