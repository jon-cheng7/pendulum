#version 300 es
// Flip-time map colouring, WebGL2

precision highp float;

const float NEVER = -1.0;
const float TIMEOUT = 1e9;
const float CODE_SPAN = 2048.0;

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
uniform float uScrub;
uniform int uMode;

out vec4 oColor;

float logT(float t) {
    return clamp(log2(max(t, 1.0)) / log2(uTMax), 0.0, 1.0);
}

// quick → slow
vec3 palette(float t) {
    float u = logT(t) * 4.0;
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

// top ↺, top ↻, bottom ↺, bottom ↻
vec3 armColour(float code, float t) {
    vec3 c = vec3(0.77, 0.98, 0.27);
    if (code == 1.0) c = vec3(0.27, 0.85, 0.95);
    else if (code == 2.0) c = vec3(0.58, 0.4, 1.0);
    else if (code == 3.0) c = vec3(1.0, 0.56, 0.2);
    return c * (0.3 + 0.7 * logT(t));
}

// (time, code)
vec2 decode(float r) {
    float code = floor(r / CODE_SPAN);
    return vec2(r - code * CODE_SPAN, code);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    bool scrubbing = uScrub < uTMax;
    float shown = scrubbing ? min(uT, uScrub) : uT;
    vec4 running = vec4(palette(shown) * 0.4, 1.0);
    float r = texelFetch(uResult, p, 0).r;
    // still running: borrow the last finished map if it agrees so far
    if (r == 0.0 && uPrevValid) {
        vec2 a = uOrigin + (vec2(p.x, uSize.y - 1 - p.y) + 0.5) * uPitch;
        vec2 q = (a - uPrevOrigin) / uPrevPitch;
        if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThan(q, vec2(uPrevSize)))) {
            ivec2 qi = ivec2(q);
            float pv = texelFetch(uPrev, ivec2(qi.x, uPrevSize.y - 1 - qi.y), 0).r;
            if (pv == NEVER || pv >= TIMEOUT || (pv > 0.0 && decode(pv).x > uT)) r = pv;
        }
    }
    if (r < -1.5) {
        oColor = vec4(0.0);
    } else if (r == NEVER) {
        oColor = vec4(0.03, 0.035, 0.03, 1.0);
    } else if (r == 0.0) {
        oColor = running;
    } else if (r >= TIMEOUT) {
        oColor = scrubbing ? running : vec4(0.15, 0.15, 0.15, 1.0);
    } else {
        vec2 d = decode(r);
        // known flips, live or borrowed, show up to the slider
        if (scrubbing && d.x > uScrub) oColor = running;
        else if (uMode == 1) oColor = vec4(armColour(d.y, d.x), 1.0);
        else oColor = vec4(palette(d.x), 1.0);
    }
}
