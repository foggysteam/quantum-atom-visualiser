/**
 * Volume storage as a 2D TILED ATLAS rather than a 3D texture.
 *
 * WHY NOT sampler3D: the obvious implementation renders the density slice by
 * slice into a THREE.WebGL3DRenderTarget, binding one layer at a time. On this
 * machine (Chrome / ANGLE / D3D11) that silently does nothing. The framebuffer
 * reports COMPLETE, glClear on the bound layer works, the draw call issues, and
 * glGetError stays clean, but the fragments never land. The identical draw into
 * an ordinary 2D render target writes correctly, which is what pinned it down.
 *
 * So the volume lives in a single 2D texture with the slices laid out in a grid.
 * One draw call fills the whole thing, on a code path that is universally
 * supported. This is how volume rendering was done before 3D textures existed,
 * and the only real cost is doing the trilinear filter by hand.
 *
 * Layout: slice s sits at tile (s % tiles, floor(s / tiles)), each tile being
 * `resolution` texels square.
 */
export const VOLUME_ATLAS_GLSL = /* glsl */ `
uniform sampler2D uVolume;
uniform float uAtlasTiles;       // tiles per row/column
uniform float uAtlasResolution;  // voxels per axis

// Sample one slice with hardware bilinear filtering.
//
// The xy coordinate is clamped half a texel inside the tile. Without that,
// bilinear filtering at a tile edge blends in the neighbouring slice's pixels,
// which shows up as faint grid lines ruled across the atom.
vec4 sampleAtlasSlice(vec2 xy, float slice) {
  float tiles = uAtlasTiles;
  float res = uAtlasResolution;
  float tileX = mod(slice, tiles);
  float tileY = floor(slice / tiles);
  vec2 local = clamp(xy * res, 0.5, res - 0.5);
  vec2 uv = (vec2(tileX, tileY) * res + local) / (tiles * res);
  return texture(uVolume, uv);
}

// Full trilinear sample of the volume at normalised coordinates uvw in [0,1].
vec4 sampleVolume(vec3 uvw) {
  float res = uAtlasResolution;
  float z = uvw.z * res - 0.5;
  float z0 = floor(z);
  float f = z - z0;
  float s0 = clamp(z0, 0.0, res - 1.0);
  float s1 = clamp(z0 + 1.0, 0.0, res - 1.0);
  return mix(sampleAtlasSlice(uvw.xy, s0), sampleAtlasSlice(uvw.xy, s1), f);
}
`;
