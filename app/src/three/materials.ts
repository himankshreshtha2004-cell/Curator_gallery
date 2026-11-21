import * as THREE from 'three'
import layout from '../data/g01.layout.json'
import { toSun } from '../game/puzzle'

/** global exposure: scales every light source together (sun, baked light, probe, sky glazing) */
export const EXPOSURE = 1.0

export type TexSet = { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap?: THREE.Texture }
export const TEX_NAMES = ['plaster', 'concrete', 'travertine', 'limestone', 'sandstone', 'canvas'] as const
export type TexName = (typeof TEX_NAMES)[number]
export const texUrls = (n: TexName) => [`tex/${n}.jpg`, `tex/${n}_n.jpg`, ...(n === 'canvas' ? [] : [`tex/${n}_r.jpg`])]

export function prepTex(t: THREE.Texture, srgb: boolean, aniso = 8) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = aniso
  t.flipY = false           // glTF UV convention
  t.needsUpdate = true
  return t
}

// ---------------------------------------------------------------- analytic skylight mask (GLSL)
// A point is sunlit when the ray toward the sun passes through a skylight opening at the ceiling
// AND through the top of that skylight's shaft. This matches the Cycles bake exactly, so the movable
// sculptures are lit — and cast shadows — only inside the real sun patches.
const R = layout.room, SK = layout.skylights
const CEIL = R.height, SHAFT_TOP = R.height + R.slab + layout.shaft.depth
export const SUN_GLSL = /* glsl */ `
uniform vec4 uSky[3];
uniform vec3 uToSun;
float skyRect(vec2 q, vec4 r, float s) {
  vec2 a = smoothstep(vec2(r.x, r.z) - s, vec2(r.x, r.z) + s, q);
  vec2 b = 1.0 - smoothstep(vec2(r.y, r.w) - s, vec2(r.y, r.w) + s, q);
  return a.x * a.y * b.x * b.y;
}
float sunMask(vec3 p) {
  float tb = (${CEIL.toFixed(3)} - p.y) / uToSun.y;
  float tt = (${SHAFT_TOP.toFixed(3)} - p.y) / uToSun.y;
  vec2 qb = p.xz + tb * uToSun.xz, qt = p.xz + tt * uToSun.xz;
  float sb = 0.012 + tb * 0.012, st = 0.012 + tt * 0.012;   // penumbra grows with distance (sun disc ~1.4 deg)
  float m = 0.0;
  for (int i = 0; i < 3; i++) m = max(m, skyRect(qb, uSky[i], sb) * skyRect(qt, uSky[i], st));
  return m;
}`
export const sunUniforms = () => ({
  uSky: { value: SK.map((s) => new THREE.Vector4(s.x0, s.x1, s.z0, s.z1)) },
  uToSun: { value: new THREE.Vector3(...toSun()) },
})

const WORLDPOS_VS = (vs: string) =>
  vs.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;')

/** baked architecture: lightmap carries ALL diffuse light (sky + sun + bounces); realtime direct
 *  lights and IBL diffuse are switched off so nothing is counted twice; IBL specular stays for sheen. */
export function archMaterial(p: { tex: TexSet; lightMap: THREE.Texture; env: THREE.Texture; tint?: THREE.ColorRepresentation; roughness?: number; normalScale?: number; envIntensity?: number }) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.tint ?? 0xffffff), map: p.tex.map, normalMap: p.tex.normalMap, roughnessMap: p.tex.roughnessMap ?? null,
    roughness: p.roughness ?? 1, metalness: 0, lightMap: p.lightMap, lightMapIntensity: Math.PI * EXPOSURE,
    envMap: p.env, envMapIntensity: (p.envIntensity ?? 0.35) * EXPOSURE, normalScale: new THREE.Vector2(p.normalScale ?? 0.6, p.normalScale ?? 0.6),
  })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )', '#if 0 // directional sun is already in the lightmap'))
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''))
  }
  m.customProgramCacheKey = () => 'arch-baked'
  return m
}

/** movable sculptures: realtime sun (masked by the skylight geometry) + room probe + realtime shadows */
export function dynamicMaterial(p: { tex: TexSet; env: THREE.Texture; tint?: THREE.ColorRepresentation; roughness?: number; normalScale?: number }) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(p.tint ?? 0xffffff), map: p.tex.map, normalMap: p.tex.normalMap, roughnessMap: p.tex.roughnessMap ?? null,
    roughness: p.roughness ?? 1, metalness: 0, envMap: p.env, envMapIntensity: EXPOSURE, normalScale: new THREE.Vector2(p.normalScale ?? 0.5, p.normalScale ?? 0.5),
  })
  const uniforms = sunUniforms()
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = WORLDPOS_VS(sh.vertexShader)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\n' + SUN_GLSL)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sunMask( vWorldP );'))
  }
  m.customProgramCacheKey = () => 'dyn-sunmask'
  return m
}

/** floor shadow catcher: only shows the movable sculptures' shadows, only where the sun actually falls */
export function shadowCatcherMaterial(opacity = 0.62) {
  const m = new THREE.ShadowMaterial({ color: new THREE.Color('#2e2620'), opacity, transparent: true, depthWrite: false })
  const uniforms = sunUniforms()
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = WORLDPOS_VS(sh.vertexShader)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\n' + SUN_GLSL)
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * sunMask( vWorldP ) );')
  }
  m.customProgramCacheKey = () => 'catcher-sunmask'
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2
  return m
}

/** multiply-blended overlay (etched lines, contact darkening) */
export function multiplyMaterial(color: THREE.ColorRepresentation, opts: { map?: THREE.Texture; opacity?: number } = {}) {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), map: opts.map ?? null, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true,
    depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide,
  })
  return m
}

/** soft contact-occlusion texture for multiply blending: dark centre fading to white (= no effect) */
export function contactTexture(size = 128, depth = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d')!, r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  const v = (k: number) => { const x = Math.round(255 * (1 - depth * k)); return `rgb(${x},${x},${x})` }
  r.addColorStop(0, v(1)); r.addColorStop(0.35, v(0.75)); r.addColorStop(0.7, v(0.22)); r.addColorStop(1, v(0))
  g.fillStyle = r; g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
