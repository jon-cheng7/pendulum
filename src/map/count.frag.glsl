#version 300 es
// Passes only running pixels, for the occlusion query

precision highp float;

uniform highp sampler2D uResult;

void main() {
    if (texelFetch(uResult, ivec2(gl_FragCoord.xy), 0).r != 0.0) discard;
}
