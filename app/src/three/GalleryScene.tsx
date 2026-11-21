import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import layout from '../data/g01.layout.json'
import { useGame } from '../state/store'
import { SLOTS, CIRCLE, ARC_SPAN, toSun, DRAG } from '../game/puzzle'
import {
  TEX_NAMES, type TexName, type TexSet, texUrls, prepTex, archMaterial, shadowCatcherMaterial, multiplyMaterial, EXPOSURE,
} from './materials'
import { Blades } from './Blades'

const BASE = 'assets/g01/'
useGLTF.preload(BASE + 'gallery01.glb')

export function useGalleryAssets() {
  const urls = TEX_NAMES.flatMap((n) => texUrls(n))
  const texList = useLoader(THREE.TextureLoader, urls)
  const [lightMap, probe] = useLoader(RGBELoader, [BASE + 'lightmap.hdr', BASE + 'probe.hdr'])
  const gl = useThree((s) => s.gl)
  return useMemo(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
    const sets = {} as Record<TexName, TexSet>
    let k = 0
    for (const n of TEX_NAMES) {
      const map = prepTex(texList[k++], true, aniso), normalMap = prepTex(texList[k++], false, aniso)
      const roughnessMap = n === 'canvas' ? undefined : prepTex(texList[k++], false, aniso)
      sets[n] = { map, normalMap, roughnessMap }
    }
    lightMap.flipY = false; lightMap.channel = 1; lightMap.colorSpace = THREE.LinearSRGBColorSpace
    lightMap.minFilter = THREE.LinearFilter; lightMap.magFilter = THREE.LinearFilter; lightMap.needsUpdate = true
    probe.mapping = THREE.EquirectangularReflectionMapping; probe.colorSpace = THREE.LinearSRGBColorSpace
    return { sets, lightMap, probe }
  }, [texList, lightMap, probe, gl])
}

function archFor(name: string, a: ReturnType<typeof useGalleryAssets>) {
  const { sets: S, lightMap, probe: env } = a
  switch (name) {
    case 'M_Concrete': return archMaterial({ tex: S.concrete, lightMap, env, tint: '#d9d4cd', roughness: 0.85, normalScale: 0.25, envIntensity: 0.8 })
    case 'M_Plaster': return archMaterial({ tex: S.plaster, lightMap, env, tint: '#f6f1ea', normalScale: 0.5, envIntensity: 0.06 })
    case 'M_Ceiling': return archMaterial({ tex: S.plaster, lightMap, env, tint: '#f2ece4', normalScale: 0.4, envIntensity: 0.05 })
    case 'M_Shaft': return archMaterial({ tex: S.plaster, lightMap, env, tint: '#ffffff', normalScale: 0.3, envIntensity: 0.05 })
    case 'M_Travertine': return archMaterial({ tex: S.travertine, lightMap, env, normalScale: 0.9, envIntensity: 0.3 })
    case 'M_Limestone': { const m = archMaterial({ tex: S.limestone, lightMap, env, normalScale: 0.6, envIntensity: 0.3 }); m.side = THREE.DoubleSide; return m }
    case 'M_Sandstone': return archMaterial({ tex: S.sandstone, lightMap, env, normalScale: 0.8, envIntensity: 0.25 })
    case 'M_Canvas': return archMaterial({ tex: S.canvas, lightMap, env, normalScale: 0.6, envIntensity: 0.1 })
    case 'M_Frame': return archMaterial({ tex: S.plaster, lightMap, env, tint: '#fbf9f5', normalScale: 0.15, envIntensity: 0.25, roughness: 0.8 })
    case 'M_StoneWarm': { const m = archMaterial({ tex: S.sandstone, lightMap, env, tint: '#b8977a', normalScale: 1.0, envIntensity: 0.2 }); m.side = THREE.DoubleSide; return m }
    default: return archMaterial({ tex: S.plaster, lightMap, env })
  }
}

/** one band of the etched circle on the floor (a 24° segment), built in the XZ plane */
function arcBand(angle: number, width: number, span: number) {
  const n = 24, r0 = CIRCLE.radius - width / 2, r1 = CIRCLE.radius + width / 2
  const pos: number[] = [], idx: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = angle - span / 2 + (span * i) / n
    pos.push(CIRCLE.x + r0 * Math.cos(a), 0.002, CIRCLE.z + r0 * Math.sin(a), CIRCLE.x + r1 * Math.cos(a), 0.002, CIRCLE.z + r1 * Math.sin(a))
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
  return g
}

function EtchedCircle() {
  const invalidate = useThree((s) => s.invalidate)
  const geos = useMemo(() => SLOTS.map((s) => arcBand(s.angle, CIRCLE.line, ARC_SPAN - 0.002)), [])
  const mats = useMemo(() => SLOTS.map(() => multiplyMaterial('#ffffff')), [])
  const ref = useRef(0)
  useFrame((_, dt) => {
    ref.current += dt
    const { progress, hint, closeness, dragging } = useGame.getState()
    let moving = hint >= 1
    SLOTS.forEach((s, k) => {
      const filled = progress.filled[k], active = s.composition === progress.composition && !filled
      let v = 0.74                                   // a fine etched groove in the concrete
      if (filled) v = 0.46                            // inlaid: the light has "written" this arc into the stone
      else if (active) v = 0.68 - (dragging ? closeness * 0.1 : 0) - (hint >= 1 ? 0.1 + 0.04 * Math.sin(ref.current * 2.2) : 0)
      const c = filled ? new THREE.Color(v * 1.04, v * 0.97, v * 0.9) : new THREE.Color(v, v * 0.985, v * 0.965)
      if (Math.abs(mats[k].color.r - c.r) > 0.002) moving = true
      mats[k].color.lerp(c, Math.min(1, dt * 4))
    })
    if (moving) invalidate()
  })
  return <group>{geos.map((g, k) => <mesh key={k} geometry={g} material={mats[k]} renderOrder={2} />)}</group>
}

function DoorAndSpill() {
  const { nodes } = useGLTF(BASE + 'gallery01.glb') as any
  const open = useGame((s) => s.doorOpen)
  const panel: THREE.Object3D | undefined = nodes.DoorPanel
  const spot = useRef<THREE.SpotLight>(null!)
  const t = useRef(open ? 1 : 0)
  const x0 = useRef<number | null>(null)
  const invalidate = useThree((s) => s.invalidate)
  useFrame((_, dt) => {
    if (!panel) return
    if (x0.current === null) x0.current = panel.position.x
    t.current = THREE.MathUtils.damp(t.current, open ? 1 : 0, 0.9, dt)
    const e = t.current
    panel.position.x = x0.current + e * (layout.door.width + 0.05)
    if (spot.current) spot.current.intensity = e * 34 * EXPOSURE
    if (Math.abs(e - (open ? 1 : 0)) > 0.002) invalidate()
  })
  const z = layout.room.z0
  return (
    <spotLight ref={spot} position={[0, 2.7, z - 1.6]} angle={0.62} penumbra={0.9} decay={2} distance={16} color="#ffe9cf" intensity={0} castShadow={false}>
      <object3D attach="target" position={[0, 0, z + 6]} />
    </spotLight>
  )
}

export function GalleryScene() {
  const gltf = useGLTF(BASE + 'gallery01.glb') as any
  const assets = useGalleryAssets()
  const camMode = useGame((s) => s.camMode)
  const quality = useGame((s) => s.save.settings.quality)
  const gl = useThree((s) => s.gl)
  const scene3 = useThree((s) => s.scene)
  useEffect(() => { (window as any).__curatorScene = scene3 }, [scene3])
  useMemo(() => {
    gltf.scene.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const name = (Array.isArray(m.material) ? m.material[0] : m.material).name
      m.material = archFor(name, assets)
      m.castShadow = false; m.receiveShadow = false
    })
  }, [gltf, assets])

  const sun = useMemo(() => {
    const L = toSun(), d = new THREE.DirectionalLight(new THREE.Color(...(layout.sun.color as [number, number, number])), layout.sun.strength * EXPOSURE)
    const c = new THREE.Vector3((DRAG.x0 + DRAG.x1) / 2, 0, (DRAG.z0 + DRAG.z1) / 2)
    d.position.set(c.x + L[0] * 14, L[1] * 14, c.z + L[2] * 14); d.target.position.copy(c)
    d.castShadow = true; d.shadow.mapSize.set(1024, 1024); d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02; d.shadow.radius = 3
    const cam = d.shadow.camera as THREE.OrthographicCamera; cam.left = -5.5; cam.right = 5.5; cam.top = 5.5; cam.bottom = -5.5; cam.near = 4; cam.far = 26
    return d
  }, [])

  // only the three movable sculptures cast realtime shadows: re-render the shadow map only when one moves
  useEffect(() => { gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true }, [gl])
  useEffect(() => {
    const n = quality === 'high' ? 2048 : 1024
    if (sun.shadow.mapSize.x !== n) { sun.shadow.mapSize.set(n, n); sun.shadow.map?.dispose(); (sun.shadow as any).map = null; gl.shadowMap.needsUpdate = true }
  }, [quality, sun, gl])
  const catcher = useMemo(() => shadowCatcherMaterial(0.64), [])
  const sky = layout.skylights, top = layout.room.height + layout.room.slab + layout.shaft.depth
  return (
    <group>
      <primitive object={gltf.scene} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      {/* sky seen through the skylights: a bright, slightly cool diffusing glazing at the top of each shaft */}
      {camMode !== 'plan' && sky.map((s, i) => (
        <mesh key={i} position={[(s.x0 + s.x1) / 2, top - 0.02, (s.z0 + s.z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[s.x1 - s.x0 + 0.3, s.z1 - s.z0 + 0.3]} />
          <meshBasicMaterial color={new THREE.Color(1.0, 0.995, 0.985).multiplyScalar(6.0 * EXPOSURE)} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* shadow catcher over the floor: movable sculptures' shadows, only inside the sun patches */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 1]} receiveShadow material={catcher} renderOrder={3}>
        <planeGeometry args={[8.4, 22]} />
      </mesh>
      <EtchedCircle />
      <DoorAndSpill />
      <Blades assets={assets} />
    </group>
  )
}
