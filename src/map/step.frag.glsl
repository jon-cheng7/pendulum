#version 300 es
// Flip-time map, WebGL2: step every running pixel

precision highp float;

const float PI = 3.14159265;
const float TIMEOUT = 1e9;

uniform highp sampler2D uState;
uniform highp sampler2D uResult;
uniform int uBase;
uniform int uSteps;
uniform float uDt;
uniform float uTMax;

layout(location = 0) out vec4 oState;
layout(location = 1) out float oResult;

// (θ₁, θ₂, ω₁, ω₂) → (ω₁, ω₂, α₁, α₂)
vec4 deriv(vec4 s) {
    float s1 = sin(s.x);
    float c1 = cos(s.x);
    float s2 = sin(s.y);
    float c2 = cos(s.y);
    float sd = s1 * c2 - c1 * s2;
    float cd = c1 * c2 + s1 * s2;
    // 3 − cos 2Δ
    float den = 2.0 + 2.0 * sd * sd;
    // sin(θ₁ − 2θ₂) = sin(Δ − θ₂)
    float a1 = (-3.0 * s1 - (sd * c2 - cd * s2) - 2.0 * sd * (s.w * s.w + s.z * s.z * cd)) / den;
    float a2 = 2.0 * sd * (2.0 * s.z * s.z + 2.0 * c1 + s.w * s.w * cd) / den;
    return vec4(s.zw, a1, a2);
}

vec4 rk4(vec4 s, float h) {
    vec4 k1 = deriv(s);
    vec4 k2 = deriv(s + 0.5 * h * k1);
    vec4 k3 = deriv(s + 0.5 * h * k2);
    vec4 k4 = deriv(s + h * k3);
    return s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 s = texelFetch(uState, p, 0);
    float r = texelFetch(uResult, p, 0).r;
    oState = s;
    oResult = r;
    if (r != 0.0) return;
    for (int k = 1; k <= uSteps; k++) {
        s = rk4(s, uDt);
        if (abs(s.x) > PI || abs(s.y) > PI) {
            oState = s;
            oResult = float(uBase + k) * uDt;
            return;
        }
    }
    oState = s;
    oResult = float(uBase + uSteps) * uDt >= uTMax ? TIMEOUT : 0.0;
}
