#version 300 es
// Flip-time map, WebGL2: seed the grid

precision highp float;

const float PI = 3.14159265;

uniform vec2 uOrigin;
uniform vec2 uPitch;
uniform ivec2 uSize;

layout(location = 0) out vec4 oState;
layout(location = 1) out float oResult;

void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    // GL rows run bottom up
    vec2 a = uOrigin + (vec2(p.x, uSize.y - 1 - p.y) + 0.5) * uPitch;
    oState = vec4(a, 0.0, 0.0);
    if (abs(a.x) > PI || abs(a.y) > PI) {
        oResult = -2.0;
    } else if (2.0 * cos(a.x) + cos(a.y) > 1.0) {
        oResult = -1.0;
    } else {
        oResult = 0.0;
    }
}
