/**
 * Fullscreen-quad vertex shader for RawShaderMaterial + GLSL3.
 *
 * RawShaderMaterial prepends NOTHING: no attribute declarations, no matrix
 * uniforms, no defines. That is the whole point of it, and it means `position`
 * and `uv` have to be declared by hand. Leaving them out produces a shader that
 * fails to link, which surfaces only as a stream of "useProgram: program not
 * valid" warnings and a black screen.
 *
 * The quad is drawn in clip space directly, so no matrices are involved.
 */
export const FULLSCREEN_VERT = /* glsl */ `
in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
