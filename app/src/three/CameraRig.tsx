import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import layout from '../data/g01.layout.json'
import { useGame, type CamMode } from '../state/store'
import { CIRCLE } from '../game/puzzle'

const R = layout.room
const C = new THREE.Vector3(CIRCLE.x, 0, CIRCLE.z)
const REF_POS = new THREE.Vector3(...(layout.camera.position as [number, number, number]))
const REF_TGT = new THREE.Vector3(...(layout.camera.target as [number, number, number]))

/** the six camera modes of the brief, as (position, target) goals */
function goalFor(mode: CamMode): { pos: THREE.Vector3; tgt: THREE.Vector3; speed: number } {
  const st = useGame.getState()
  switch (mode) {
    case 'title': return { pos: REF_POS.clone(), tgt: REF_TGT.clone(), speed: 1.2 }
    case 'explore': return { pos: new THREE.Vector3(0.9, 2.75, 11.4), tgt: new THREE.Vector3(-1.05, 0.25, 6.1), speed: 1.6 }
    case 'focus': {
      const b = st.selected !== null ? st.progress.blades[st.selected] : null
      const p = b ? new THREE.Vector3(b.x, 0.55, b.z) : C.clone()
      return { pos: p.clone().add(new THREE.Vector3(1.25, 1.1, 1.8)), tgt: p, speed: 2.2 }
    }
    case 'align': return { pos: C.clone().add(new THREE.Vector3(1.05, 4.15, 2.75)), tgt: C.clone().add(new THREE.Vector3(0.1, 0, -0.1)), speed: 1.8 }
    case 'plan': return { pos: new THREE.Vector3(-0.2, 24, 1.01), tgt: new THREE.Vector3(-0.2, 0, 1.0), speed: 1.4 }
    case 'reveal': return { pos: C.clone().add(new THREE.Vector3(2.4, 3.3, 3.4)), tgt: C.clone().add(new THREE.Vector3(0, 0.2, -0.3)), speed: 0.9 }
    case 'transition': return { pos: new THREE.Vector3(0, 1.62, R.z0 - 1.2), tgt: new THREE.Vector3(0, 1.62, R.z0 - 6), speed: 0.55 }
  }
}

export function CameraRig() {
  const controls = useRef<any>(null)
  const { camera } = useThree()
  const camMode = useGame((s) => s.camMode), nonce = useGame((s) => s.camNonce)
  const sens = useGame((s) => s.save.settings.cameraSensitivity)
  const goal = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3; speed: number } | null>(null)
  const t0 = useRef(0)
  useEffect(() => {   // QA hook: project a world point to screen pixels
    ;(window as any).__curatorProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera)
      return [(v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight]
    }
  }, [camera])

  useEffect(() => {
    goal.current = goalFor(camMode); t0.current = performance.now()
    if (useGame.getState().save.settings.reducedMotion && controls.current) {
      camera.position.copy(goal.current.pos); controls.current.target.copy(goal.current.tgt); goal.current = null
    }
  }, [camMode, nonce, camera])

  useFrame((_, dt) => {
    const c = controls.current; if (!c) return
    const st = useGame.getState()
    const g = goal.current
    if (g) {
      const k = 1 - Math.exp(-dt * g.speed * 1.6)
      camera.position.lerp(g.pos, k); c.target.lerp(g.tgt, k)
      if (camera.position.distanceTo(g.pos) < 0.01 && c.target.distanceTo(g.tgt) < 0.01) {
        goal.current = null
        if (st.camMode === 'transition') window.dispatchEvent(new CustomEvent('curator:transition-done'))
      }
    }
    if (st.camMode === 'title' && !st.save.settings.reducedMotion && !g) {
      // a barely perceptible settle: the camera breathes a few centimetres, never sweeps
      const t = performance.now() / 1000
      camera.position.set(REF_POS.x + Math.sin(t * 0.11) * 0.06, REF_POS.y + Math.sin(t * 0.07) * 0.02, REF_POS.z)
    }
    // locked (cinematic) modes: the orbit controller is disabled, so aim the camera ourselves
    if (!c.enabled) camera.lookAt(c.target)
    // keep the camera inside the architecture (no clipping through walls, floor or ceiling)
    if (st.camMode !== 'plan' && st.camMode !== 'transition') {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, R.x0 + 0.35, R.x1 - 0.35)
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.35, R.height - 0.4)
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, R.z0 + 0.35, R.z1 - 0.35)
    }
  })

  const plan = camMode === 'plan', locked = camMode === 'title' || camMode === 'reveal' || camMode === 'transition'
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enabled={!locked}
      enableRotate={!plan}
      enablePan
      screenSpacePanning={plan}
      rotateSpeed={0.45 * sens}
      zoomSpeed={0.6 * sens}
      panSpeed={0.6 * sens}
      minDistance={0.7}
      maxDistance={plan ? 30 : locked ? 60 : 14}
      maxPolarAngle={plan ? 0.001 : Math.PI * 0.64}
      minPolarAngle={plan ? 0 : 0.15}
    />
  )
}
