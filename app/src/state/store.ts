import { create } from 'zustand'
import {
  type GalleryProgress, type Xform, freshProgress, tryLock, applyLock, compositionDone, advance, resetComposition,
  constrain, alignedCount, SLOTS, TOTAL, guide,
} from '../game/puzzle'
import { type SaveData, type Settings, loadProgress, saveProgress, completeGallery, emptySave } from '../game/save'
import { sfx } from '../audio/sound'

export type Screen = 'title' | 'atlas' | 'game'
export type CamMode = 'title' | 'explore' | 'focus' | 'align' | 'plan' | 'reveal' | 'transition'
interface Move { i: number; from: Xform; to: Xform }

interface State {
  screen: Screen
  save: SaveData
  gallery: number | null
  progress: GalleryProgress
  selected: number | null
  dragging: boolean
  camMode: CamMode
  camNonce: number
  paused: boolean
  hint: 0 | 1 | 2 | 3
  tutorial: number                 // 0 select · 1 drag · 2 rotate · 3 align · 4 done
  undo: Move[]
  redo: Move[]
  lastLock: { slot: number; t: number } | null
  banner: { kind: 'composition' | 'complete' | 'arrival'; title: string; sub: string; t: number } | null
  doorOpen: boolean
  closeness: number
  arrivedAt: number
  briefing: boolean
  lastProgressAt: number
  closeBriefing(): void
  openBriefing(): void

  go(s: Screen): void
  newJourney(): void
  enterGallery(id: number): void
  select(i: number | null): void
  setDragging(v: boolean): void
  preview(i: number, x: Xform): void                 // live (during a drag/rotation)
  commit(i: number, from: Xform): void               // end of a gesture: history + alignment check
  nudge(i: number, dx: number, dz: number, dyaw: number): void
  doUndo(): void
  doRedo(): void
  resetComposition(): void
  restartGallery(): void
  setHint(h: 0 | 1 | 2 | 3): void
  setCam(m: CamMode): void
  setPaused(v: boolean): void
  setSettings(p: Partial<Settings>): void
  debugSolveNext(): boolean
  placeSelected(): void
}

const persist = (s: State, progress = s.progress, extra: Partial<SaveData> = {}) => {
  const save: SaveData = { ...s.save, ...extra, galleries: { ...s.save.galleries, [s.gallery ?? 1]: progress } }
  saveProgress(save)
  return save
}

export const useGame = create<State>()((set, get) => ({
  screen: 'title',
  save: loadProgress(),
  gallery: null,
  progress: loadProgress().galleries[1] ?? freshProgress(),
  selected: null,
  dragging: false,
  camMode: 'title',
  camNonce: 0,
  paused: false,
  hint: 0,
  tutorial: loadProgress().tutorialDone ? 4 : 0,
  undo: [],
  redo: [],
  lastLock: null,
  banner: null,
  doorOpen: false,
  closeness: 0,
  arrivedAt: 0,
  briefing: false,
  lastProgressAt: 0,
  closeBriefing: () => { const save = { ...get().save, briefingSeen: true }; saveProgress(save); set({ briefing: false, save, lastProgressAt: performance.now() }) },
  openBriefing: () => set({ briefing: true, selected: null }),

  go: (screen) => set({ screen, paused: false, selected: null, camMode: screen === 'game' ? 'explore' : 'title', camNonce: get().camNonce + 1 }),
  newJourney: () => {
    const save = { ...emptySave(), settings: get().save.settings, briefingSeen: false }
    saveProgress(save)
    set({ save, progress: freshProgress(), tutorial: 0, undo: [], redo: [], hint: 0, doorOpen: false, banner: null })
    get().enterGallery(1)
  },
  enterGallery: (id) => {
    const s = get()
    const progress = s.save.galleries[id] ?? freshProgress()
    set({
      screen: 'game', gallery: id, progress, selected: null, camMode: 'explore', camNonce: s.camNonce + 1, paused: false,
      undo: [], redo: [], hint: 0, doorOpen: progress.complete, arrivedAt: performance.now(), lastProgressAt: performance.now(), briefing: !s.save.briefingSeen && !progress.complete,
      banner: { kind: 'arrival', title: `GALLERY ${String(id).padStart(2, '0')}`, sub: 'First Light', t: performance.now() },
    })
    sfx.ambience(s.save.settings)
  },
  select: (i) => {
    const s = get()
    if (i !== null && s.progress.blades[i]?.slot !== null) return
    set({ selected: i, tutorial: i !== null && s.tutorial === 0 ? 1 : s.tutorial, hint: i === null ? s.hint : s.hint })
    if (i !== null) sfx.tick()
  },
  setDragging: (v) => set({ dragging: v }),
  preview: (i, x) => {
    const s = get(), b = s.progress.blades[i]
    if (!b || b.slot !== null) return
    const others = s.progress.blades.filter((_, j) => j !== i)
    const c = constrain(x, others)
    const blades = s.progress.blades.map((o, j) => (j === i ? { ...o, ...c } : o))
    // closeness of the moving blade to its nearest free target (drives the subtle "improving" feedback)
    let best = 0
    for (let k = 0; k < SLOTS.length; k++) {
      if (SLOTS[k].composition !== s.progress.composition || s.progress.filled[k]) continue
      const t = SLOTS[k].target
      const d = Math.hypot(c.x - t.x, c.z - t.z) / 1.2 + Math.abs(Math.atan2(Math.sin(c.yaw - t.yaw), Math.cos(c.yaw - t.yaw))) / Math.PI
      best = Math.max(best, 1 - d)
    }
    set({ progress: { ...s.progress, blades }, closeness: Math.max(0, best) })
  },
  commit: (i, from) => {
    const s = get(), b = s.progress.blades[i]
    if (!b || b.slot !== null) return
    const to = { x: b.x, z: b.z, yaw: b.yaw }
    const moved = Math.hypot(to.x - from.x, to.z - from.z) > 1e-4 || Math.abs(to.yaw - from.yaw) > 1e-4
    let tutorial = s.tutorial
    if (moved) {
      if (tutorial === 1 && Math.hypot(to.x - from.x, to.z - from.z) > 0.05) tutorial = 2
      else if (tutorial === 2 && Math.abs(to.yaw - from.yaw) > 0.02) tutorial = 3
    }
    const undo = moved ? [...s.undo, { i, from, to }].slice(-120) : s.undo
    const k = tryLock(s.progress, i)
    if (k === null) {
      set({ undo, redo: moved ? [] : s.redo, tutorial })
      persist(get())
      return
    }
    // ---- an alignment: snap, lock, save
    let progress = applyLock(s.progress, i, k)
    sfx.lock()
    if (tutorial < 4) tutorial = 4
    const save = persist(get(), progress, { tutorialDone: true })
    set({ progress, save, undo: [], redo: [], selected: null, tutorial, lastLock: { slot: k, t: performance.now() }, closeness: 0, hint: 0, lastProgressAt: performance.now() })
    if (compositionDone(progress)) {
      const c = progress.composition
      const done = c + 1 === 5
      setTimeout(() => {
        sfx.chime(done)
        set({ banner: { kind: done ? 'complete' : 'composition', title: 'COMPOSITION COMPLETE', sub: done ? 'Perfect circle' : `Arc ${c + 1} of 5 · ${alignedCount(get().progress)} / ${TOTAL} alignments`, t: performance.now() } })
      }, 700)
      setTimeout(() => {
        progress = advance(get().progress)
        let save2 = persist(get(), progress)
        if (progress.complete) {
          save2 = completeGallery(save2, get().gallery ?? 1)
          saveProgress(save2)
          set({ progress, save: save2, camMode: 'reveal', camNonce: get().camNonce + 1 })
          setTimeout(() => { set({ doorOpen: true }); sfx.door() }, 2600)
          setTimeout(() => set({ camMode: 'transition', camNonce: get().camNonce + 1 }), 6200)
        } else {
          set({ progress, save: save2 })
          sfx.release()
        }
      }, 2600)
    }
  },
  nudge: (i, dx, dz, dyaw) => {
    const s = get(), b = s.progress.blades[i]
    if (!b || b.slot !== null) return
    const from = { x: b.x, z: b.z, yaw: b.yaw }
    get().preview(i, { x: b.x + dx, z: b.z + dz, yaw: b.yaw + dyaw })
    get().commit(i, from)
  },
  doUndo: () => {
    const s = get(), m = s.undo[s.undo.length - 1]
    if (!m || s.progress.blades[m.i].slot !== null) return
    const blades = s.progress.blades.map((b, j) => (j === m.i ? { ...b, ...m.from } : b))
    const progress = { ...s.progress, blades }
    set({ progress, undo: s.undo.slice(0, -1), redo: [...s.redo, m] }); persist(get())
  },
  doRedo: () => {
    const s = get(), m = s.redo[s.redo.length - 1]
    if (!m || s.progress.blades[m.i].slot !== null) return
    const blades = s.progress.blades.map((b, j) => (j === m.i ? { ...b, ...m.to } : b))
    set({ progress: { ...s.progress, blades }, redo: s.redo.slice(0, -1), undo: [...s.undo, m] }); persist(get())
  },
  resetComposition: () => {
    const progress = resetComposition(get().progress)
    set({ progress, undo: [], redo: [], selected: null, paused: false }); persist(get(), progress); sfx.release()
  },
  restartGallery: () => {
    const progress = freshProgress()
    const save = persist(get(), progress)
    set({ progress, save, undo: [], redo: [], selected: null, paused: false, doorOpen: false, camMode: 'explore', camNonce: get().camNonce + 1 })
  },
  setHint: (hint) => set({ hint }),
  setCam: (camMode) => set({ camMode, camNonce: get().camNonce + 1 }),
  setPaused: (paused) => set({ paused }),
  setSettings: (p) => {
    const save = { ...get().save, settings: { ...get().save.settings, ...p } }
    saveProgress(save); set({ save }); sfx.apply(save.settings)
  },
  placeSelected: () => {   // hint stage 3: set the selected crescent onto its nearest free slot
    const s = get(), i = s.selected
    if (i === null) return
    const g = guide(s.progress, i); if (!g) return
    const b = s.progress.blades[i], from = { x: b.x, z: b.z, yaw: b.yaw }
    const blades = s.progress.blades.map((o, j) => (j === i ? { ...o, ...SLOTS[g.slot].target } : o))
    set({ progress: { ...s.progress, blades } })
    get().commit(i, from)
  },
  debugSolveNext: () => {
    const s = get()
    if (s.progress.complete) return false
    const free = SLOTS.map((sl, k) => ({ sl, k })).filter(({ sl, k }) => sl.composition === s.progress.composition && !s.progress.filled[k])
    const i = s.progress.blades.findIndex((b) => b.slot === null)
    if (!free.length || i < 0) return false
    const from = { x: s.progress.blades[i].x, z: s.progress.blades[i].z, yaw: s.progress.blades[i].yaw }
    const blades = s.progress.blades.map((b, j) => (j === i ? { ...b, ...free[0].sl.target } : b))
    set({ progress: { ...s.progress, blades } })
    get().commit(i, from)
    return true
  },
}))
