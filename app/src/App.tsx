import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, N8AO, SMAA, ToneMapping, BrightnessContrast, HueSaturation } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import layout from './data/g01.layout.json'
import { GalleryScene } from './three/GalleryScene'
import { CameraRig } from './three/CameraRig'
import { useGame } from './state/store'
import { Overlay } from './ui/Overlay'
import { sfx } from './audio/sound'
import { SLOTS } from './game/puzzle'

function Post() {
  const q = useGame((s) => s.save.settings.quality)
  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      {q === 'high' ? <N8AO aoRadius={0.55} intensity={1.4} distanceFalloff={0.6} quality="medium" halfRes /> : <></>}
      <HueSaturation saturation={-0.05} />
      <BrightnessContrast contrast={0.04} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {q !== 'low' ? <SMAA /> : <></>}
    </EffectComposer>
  )
}

/** frame-on-demand: any game-state change asks for a new frame; idle scenes cost nothing */
function DemandBridge() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => useGame.subscribe(() => invalidate()), [invalidate])
  return null
}

function Keys() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const st = useGame.getState()
      if (st.screen !== 'game') return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') { if (st.selected !== null) st.select(null); else st.setPaused(!st.paused); return }
      if (st.paused) return
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? st.doRedo() : st.doUndo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.doRedo(); return }
      if (e.key === 'Tab') {
        e.preventDefault()
        const free = st.progress.blades.map((b, i) => (b.slot === null ? i : -1)).filter((i) => i >= 0)
        if (free.length) st.select(free[(free.indexOf(st.selected ?? -1) + 1) % free.length])
        return
      }
      const i = st.selected
      const fine = e.shiftKey ? 0.2 : 1
      if (i !== null) {
        const deg = (Math.PI / 180) * 5 * fine, step = 0.05 * fine
        if (e.key === 'q' || e.key === 'Q') st.nudge(i, 0, 0, deg)
        if (e.key === 'e' || e.key === 'E') st.nudge(i, 0, 0, -deg)
        if (e.key === 'ArrowLeft') st.nudge(i, -step, 0, 0)
        if (e.key === 'ArrowRight') st.nudge(i, step, 0, 0)
        if (e.key === 'ArrowUp') st.nudge(i, 0, -step, 0)
        if (e.key === 'ArrowDown') st.nudge(i, 0, step, 0)
        if (e.key === 'f' || e.key === 'F') st.setCam('focus')
      }
      if (e.key === 'h' || e.key === 'H') st.setHint(Math.min(3, st.hint + 1) as 0 | 1 | 2 | 3)
      if (e.key === 'p' || e.key === 'P') st.setCam(st.camMode === 'plan' ? 'explore' : 'plan')
      if (e.key === 'v' || e.key === 'V') st.setCam('align')
      if (e.key === 'r' || e.key === 'R') st.setCam('explore')
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return null
}

export default function App() {
  const quality = useGame((s) => s.save.settings.quality)
  useEffect(() => {
    const first = () => { sfx.apply(useGame.getState().save.settings) }
    window.addEventListener('pointerdown', first, { once: true })
    ;(window as any).__curator = useGame     // test / QA hooks
    ;(window as any).__curatorSlot = (k: number) => SLOTS[k]?.target
  }, [])
  return (
    <div className="app">
      <Canvas
        className="stage"
        flat
        shadows={{ type: THREE.PCFSoftShadowMap }}
        frameloop="demand"
        dpr={quality === 'high' ? [1, 1.5] : quality === 'balanced' ? [1, 1.25] : 0.8}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: layout.camera.fovDeg, near: 0.05, far: 120, position: layout.camera.position as [number, number, number] }}
        onPointerMissed={() => { const st = useGame.getState(); if (!st.dragging) st.select(null) }}
      >
        <color attach="background" args={['#e9e3d8']} />
        <DemandBridge />
        <PerformanceMonitor
          onDecline={() => {   // the device is struggling: step quality down once per decline (saved)
            const st = useGame.getState(), q = st.save.settings.quality
            if (q !== 'low') st.setSettings({ quality: q === 'high' ? 'balanced' : 'low' })
          }}
        />
        <Suspense fallback={null}>
          <GalleryScene />
          <Post />
        </Suspense>
        <CameraRig />
      </Canvas>
      <Keys />
      <Overlay />
    </div>
  )
}
