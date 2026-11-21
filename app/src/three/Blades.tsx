import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../state/store'
import { SLOTS, DRAG, type Xform } from '../game/puzzle'
import { dynamicMaterial, multiplyMaterial, contactTexture } from './materials'
import type { useGalleryAssets } from './GalleryScene'
import { sfx } from '../audio/sound'
import layout from '../data/g01.layout.json'

const URL = 'assets/g01/blade.glb'
useGLTF.preload(URL)
const BRONZE = '#9A8063'
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

function useBladeTemplate(assets: ReturnType<typeof useGalleryAssets>) {
  const { scene } = useGLTF(URL) as any
  return useMemo(() => {
    const sand = dynamicMaterial({ tex: assets.sets.travertine, env: assets.probe, tint: '#f1ebe2', normalScale: 0.6 })
    const lime = dynamicMaterial({ tex: assets.sets.limestone, env: assets.probe, normalScale: 0.5 })
    const t = scene.clone(true) as THREE.Object3D
    t.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const n = (m.material as THREE.Material).name
      m.material = n === 'M_Sandstone' ? sand : lime
      m.castShadow = true; m.receiveShadow = true
    })
    return { t, sand, lime }
  }, [scene, assets])
}

/** a single movable sculpture: stone base, slender stem, curved arc whose shadow draws on the floor */
function Blade({ i, tpl }: { i: number; tpl: ReturnType<typeof useBladeTemplate> }) {
  const group = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Group>(null!)
  const obj = useMemo(() => {
    const o = tpl.t.clone(true)
    // a private copy of the materials so this blade can carry a subtle selection lift
    o.traverse((c) => {
      const m = c as THREE.Mesh; if (!m.isMesh) return
      const src = m.material as THREE.MeshStandardMaterial, copy = src.clone()
      copy.onBeforeCompile = src.onBeforeCompile; copy.customProgramCacheKey = src.customProgramCacheKey   // clone() drops the shader patch
      m.material = copy
    })
    return o
  }, [tpl])
  const mats = useMemo(() => { const out: THREE.MeshStandardMaterial[] = []; obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) out.push(m.material as THREE.MeshStandardMaterial) }); return out }, [obj])
  const contact = useMemo(() => multiplyMaterial('#ffffff', { map: contactTexture(128, 0.45) }), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: BRONZE, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), [])
  const { camera, gl, controls } = useThree() as any
  const shown = useRef<Xform | null>(null)
  const drag = useRef<{ mode: 'move' | 'turn'; from: Xform; off: [number, number]; a0: number; yaw0: number; last: [number, number]; id: number } | null>(null)
  const ray = useMemo(() => new THREE.Raycaster(), [])

  const hitFloor = (cx: number, cy: number) => {
    const r = gl.domElement.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera)
    const p = new THREE.Vector3(); return ray.ray.intersectPlane(floor, p) ? p : null
  }

  const begin = (mode: 'move' | 'turn') => (e: any) => {
    const st = useGame.getState(), b = st.progress.blades[i]
    if (!b || b.slot !== null || st.screen !== 'game' || st.paused) return
    e.stopPropagation()
    if (st.selected !== i) st.select(i)
    const p = hitFloor(e.clientX, e.clientY); if (!p) return
    drag.current = { mode, from: { x: b.x, z: b.z, yaw: b.yaw }, off: [b.x - p.x, b.z - p.z], a0: Math.atan2(p.z - b.z, p.x - b.x), yaw0: b.yaw, last: [p.x, p.z], id: e.pointerId }
    if (controls) controls.enabled = false
    st.setDragging(true)
    gl.domElement.style.cursor = mode === 'move' ? 'grabbing' : 'alias'
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current; if (!d) return
      const p = hitFloor(e.clientX, e.clientY); if (!p) return
      const st = useGame.getState(), b = st.progress.blades[i]
      if (d.mode === 'move') st.preview(i, { x: p.x + d.off[0], z: p.z + d.off[1], yaw: b.yaw })
      else {
        const a = Math.atan2(p.z - b.z, p.x - b.x)
        st.preview(i, { x: b.x, z: b.z, yaw: d.yaw0 - (a - d.a0) })
      }
      sfx.slide(Math.hypot(p.x - d.last[0], p.z - d.last[1]) * 12); d.last = [p.x, p.z]
    }
    const up = () => {
      const d = drag.current; if (!d) return
      drag.current = null
      sfx.slide(0)
      if (controls) controls.enabled = true
      gl.domElement.style.cursor = ''
      const st = useGame.getState(); st.setDragging(false); st.commit(i, d.from)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [i, gl, camera, controls])

  useFrame((_, dt) => {
    const st = useGame.getState(), b = st.progress.blades[i]
    if (!b) return
    const reduced = st.save.settings.reducedMotion
    if (!shown.current) shown.current = { x: b.x, z: b.z, yaw: b.yaw }
    const s = shown.current, live = drag.current !== null
    // weighted, inertial follow; locks and releases glide into place rather than jumping
    const k = reduced ? 1 : 1 - Math.exp(-dt * (live ? 22 : 5.5))
    s.x += (b.x - s.x) * k; s.z += (b.z - s.z) * k
    let dy = b.yaw - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * k
    group.current.position.set(s.x, 0, s.z); group.current.rotation.y = s.yaw
    const sel = st.selected === i && b.slot === null
    ringMat.opacity = THREE.MathUtils.damp(ringMat.opacity, sel ? 0.9 : 0, 9, dt)
    ring.current.visible = ringMat.opacity > 0.01
    const lift = sel ? 0.035 : 0
    for (const m of mats) { m.emissive.setRGB(1, 0.95, 0.86); m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, lift, 8, dt) }
  })

  const base = layout.puzzle.blade.baseSize
  return (
    <group ref={group}>
      <primitive object={obj} onPointerDown={begin('move')} onPointerOver={() => { if (useGame.getState().progress.blades[i]?.slot === null) gl.domElement.style.cursor = 'grab' }} onPointerOut={() => { if (!drag.current) gl.domElement.style.cursor = '' }} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0025, 0]} material={contact} renderOrder={1}>
        <planeGeometry args={[base * 2.1, base * 2.1]} />
      </mesh>
      {/* rotation ring: a fine bronze line on the floor, with a small knob to turn the sculpture */}
      <group ref={ring}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} material={ringMat} onPointerDown={begin('turn')}>
          <ringGeometry args={[0.43, 0.445, 96]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} onPointerDown={begin('turn')} visible={false}>
          <ringGeometry args={[0.38, 0.52, 48]} />
        </mesh>
        <mesh position={[0.4375, 0.018, 0]} material={ringMat} onPointerDown={begin('turn')}>
          <sphereGeometry args={[0.022, 20, 12]} />
        </mesh>
      </group>
    </group>
  )
}

/** hint stages 2-3: the footprint (and then a ghost silhouette) where one free slot wants a sculpture */
function HintGhost({ tpl }: { tpl: ReturnType<typeof useBladeTemplate> }) {
  const hint = useGame((s) => s.hint), progress = useGame((s) => s.progress)
  const slot = SLOTS.find((s, k) => s.composition === progress.composition && !progress.filled[k])
  const ghost = useMemo(() => {
    const o = tpl.t.clone(true), m = new THREE.MeshBasicMaterial({ color: '#f3efe7', transparent: true, opacity: 0.22, depthWrite: false })
    o.traverse((c) => { const x = c as THREE.Mesh; if (x.isMesh) { x.material = m; x.castShadow = false; x.receiveShadow = false; x.raycast = () => null } })
    return o
  }, [tpl])
  const outline = useMemo(() => multiplyMaterial('#c9bfb2'), [])
  if (!slot || hint < 2 || progress.complete) return null
  const b = layout.puzzle.blade.baseSize
  return (
    <group position={[slot.target.x, 0, slot.target.z]} rotation={[0, slot.target.yaw, 0]}>
      {[[0, b / 2], [0, -b / 2], [b / 2, 0], [-b / 2, 0]].map(([x, z], k) => (
        <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, z]} material={outline} renderOrder={2}>
          <planeGeometry args={[k < 2 ? b + 0.012 : 0.012, k < 2 ? 0.012 : b]} />
        </mesh>
      ))}
      {hint >= 3 && <primitive object={ghost} />}
    </group>
  )
}

/** faint outline of the permitted floor area while dragging */
function DragBounds() {
  const dragging = useGame((s) => s.dragging)
  const mat = useMemo(() => multiplyMaterial('#ddd6cc'), [])
  if (!dragging) return null
  const w = DRAG.x1 - DRAG.x0, d = DRAG.z1 - DRAG.z0, cx = (DRAG.x0 + DRAG.x1) / 2, cz = (DRAG.z0 + DRAG.z1) / 2, t = 0.01
  return (
    <group position={[cx, 0.0035, cz]}>
      {[[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]].map(([x, z, sx, sz], k) => (
        <mesh key={k} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat}><planeGeometry args={[sx, sz]} /></mesh>
      ))}
    </group>
  )
}

export function Blades({ assets }: { assets: ReturnType<typeof useGalleryAssets> }) {
  const tpl = useBladeTemplate(assets)
  const n = useGame((s) => s.progress.blades.length)
  return (
    <group>
      {Array.from({ length: n }, (_, i) => <Blade key={i} i={i} tpl={tpl} />)}
      <HintGhost tpl={tpl} />
      <DragBounds />
    </group>
  )
}
