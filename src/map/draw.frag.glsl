#version 300 es
// Flip-time map colouring, WebGL2

precision highp float;

const float NEVER = -1.0;
const float TIMEOUT = 1e9;

uniform highp sampler2D uResult;
uniform highp sampler2D uPrev;
uniform vec2 uOrigin;
uniform vec2 uPitch;
uniform ivec2 uSize;
uniform vec2 uPrevOrigin;
uniform vec2 uPrevPitch;
uniform ivec2 uPrevSize;
uniform bool uPrevValid;
uniform float uT;
uniform float uTMax;

out vec4 oColor;

vec3 palette(float t) {
    float u = clamp(log2(max(t, 1.0)) / log2(uTMax), 0.0, 1.0) * 4.0;
    vec3 c0 = vec3(0.07, 0.06, 0.15);
    vec3 c1 = vec3(0.17, 0.19, 0.5);
    vec3 c2 = vec3(0.17, 0.6, 0.68);
    vec3 c3 = vec3(0.77, 0.98, 0.27);
    vec3 c4 = vec3(1.0, 1.0, 0.9);
    if (u < 1.0) return mix(c0, c1, u);
    if (u < 2.0) return mix(c1, c2, u - 1.0);
    if (u < 3.0) return mix(c2, c3, u - 2.0);
    return mix(c3, c4, u - 3.0);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    float r = texelFetch(uResult, p, 0).r;
    // still running: borrow the last finished map if it agrees so far
    if (r == 0.0 && uPrevValid) {
        vec2 a = uOrigin + (vec2(p.x, uSize.y - 1 - p.y) + 0.5) * uPitch;
        vec2 q = (a - uPrevOrigin) / uPrevPitch;
        if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThan(q, vec2(uPrevSize)))) {
            ivec2 qi = ivec2(q);
            float pv = texelFetch(uPrev, ivec2(qi.x, uPrevSize.y - 1 - qi.y), 0).r;
            if (pv > uT || pv == NEVER) r = pv;
        }
    }
    if (r < -1.5) {
        oColor = vec4(0.0);
    } else if (r == NEVER) {
        oColor = vec4(0.03, 0.035, 0.03, 1.0);
    } else if (r >= TIMEOUT) {
        oColor = vec4(0.15, 0.15, 0.15, 1.0);
    } else if (r == 0.0) {
        oColor = vec4(palette(uT) * 0.4, 1.0);
    } else {
        oColor = vec4(palette(r), 1.0);
    }
}
