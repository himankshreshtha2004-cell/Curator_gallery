import { describe, expect, it } from 'vitest'
import { CATALOG, WINGS } from '../data/catalog'
import {
  SLOTS, TOTAL, COMPOSITIONS, PER, CIRCLE, DRAG, OBSTACLES, START, BLADE_CLEARANCE,
  arcShadow, scramble, matches, freshProgress, tryLock, applyLock, compositionDone, advance, alignedCount,
  constrain, resetComposition, slotsOf, angleDiff,
} from './puzzle'
import { loadProgress, saveProgress, emptySave, completeGallery } from './save'

describe('level catalogue', () => {
  it('has exactly 50 galleries in three wings of 15 / 20 / 15', () => {
    expect(CATALOG).toHaveLength(50)
    expect(CATALOG.filter((g) => g.wing === 'foundations')).toHaveLength(15)
    expect(CATALOG.filter((g) => g.wing === 'intersections')).toHaveLength(20)
    expect(CATALOG.filter((g) => g.wing === 'masterpieces')).toHaveLength(15)
    expect(WINGS).toHaveLength(3)
  })
  it('keeps alignment counts inside each tier and never above 30', () => {
    for (const g of CATALOG) {
      const [lo, hi] = g.wing === 'foundations' ? [15, 16] : g.wing === 'intersections' ? [17, 20] : [21, 30]
      expect(g.alignments).toBeGreaterThanOrEqual(lo)
      expect(g.alignments).toBeLessThanOrEqual(hi)
    }
    expect(Math.max(...CATALOG.map((g) => g.alignments))).toBe(30)
  })
  it('gives every gallery a unique name, pattern and deterministic seed', () => {
    expect(new Set(CATALOG.map((g) => g.name)).size).toBe(50)
    expect(new Set(CATALOG.map((g) => g.pattern)).size).toBe(50)
    expect(new Set(CATALOG.map((g) => g.seed)).size).toBe(50)
  })
})

describe('Gallery 01 — First Light', () => {
  it('requires exactly the catalogued 15 alignments in 5 compositions of 3', () => {
    expect(TOTAL).toBe(CATALOG[0].alignments)
    expect(COMPOSITIONS * PER).toBe(15)
    expect(SLOTS).toHaveLength(15)
  })
  it('every solved target really casts its arc shadow onto the etched circle (within 1 mm)', () => {
    for (const s of SLOTS) {
      for (const t of [-1, -0.5, 0, 0.5, 1]) {
        const [x, z] = arcShadow(s.target, t)
        expect(Math.abs(Math.hypot(x - CIRCLE.x, z - CIRCLE.z) - CIRCLE.radius)).toBeLessThan(1e-3)
      }
      const [mx, mz] = arcShadow(s.target, 0)
      expect(angleDiff(Math.atan2(mz - CIRCLE.z, mx - CIRCLE.x), s.angle)).toBeLessThan(1e-6)
    }
  })
  it('the 15 shadow segments tile the full circle with no gaps or overlaps', () => {
    const a = SLOTS.map((s) => s.angle).sort((p, q) => p - q)
    for (let i = 1; i < a.length; i++) expect(a[i] - a[i - 1]).toBeCloseTo((2 * Math.PI) / 15, 9)
  })
  it('every target is reachable: inside the drag area, clear of obstacles and of neighbours', () => {
    for (const s of SLOTS) {
      const t = s.target
      expect(t.x).toBeGreaterThanOrEqual(DRAG.x0); expect(t.x).toBeLessThanOrEqual(DRAG.x1)
      expect(t.z).toBeGreaterThanOrEqual(DRAG.z0); expect(t.z).toBeLessThanOrEqual(DRAG.z1)
      for (const o of OBSTACLES) expect(Math.hypot(t.x - o.x, t.z - o.z)).toBeGreaterThan(o.r)
      const others = slotsOf(s.composition).filter((o) => o !== s).map((o) => o.target)
      const c = constrain(t, others)
      expect(Math.hypot(c.x - t.x, c.z - t.z)).toBeLessThan(1e-9)
      for (const o of others) expect(Math.hypot(o.x - t.x, o.z - t.z)).toBeGreaterThanOrEqual(BLADE_CLEARANCE)
    }
  })
  it('scrambles are deterministic, inside the start zone and never already solved', () => {
    for (let c = 0; c < COMPOSITIONS; c++) {
      const a = scramble(c), b = scramble(c)
      expect(a).toEqual(b)
      expect(a).toHaveLength(PER)
      for (const x of a) {
        expect(x.x).toBeGreaterThanOrEqual(START.x0); expect(x.x).toBeLessThanOrEqual(START.x1)
        for (const s of slotsOf(c)) expect(matches(x, s.target)).toBe(false)
      }
    }
    expect(scramble(0, 7)).not.toEqual(scramble(0))
  })
  it('can be completed: solving every slot completes the gallery', () => {
    let g = freshProgress()
    for (let c = 0; c < COMPOSITIONS; c++) {
      expect(g.composition).toBe(c)
      slotsOf(c).forEach((s, i) => {
        g.blades[i] = { ...g.blades[i], ...s.target }
        const k = tryLock(g, i); expect(k).toBe(SLOTS.indexOf(s)); g = applyLock(g, i, k!)
      })
      expect(compositionDone(g)).toBe(true)
      g = advance(g)
    }
    expect(g.complete).toBe(true)
    expect(alignedCount(g)).toBe(15)
  })
  it('accepts any blade in any free slot, and rejects near misses outside tolerance', () => {
    let g = freshProgress(); const s = slotsOf(0)[2]
    g.blades[1] = { ...g.blades[1], x: s.target.x + 0.08, z: s.target.z - 0.05, yaw: s.target.yaw + 0.1 }
    expect(tryLock(g, 1)).toBe(SLOTS.indexOf(s))
    g.blades[1] = { ...g.blades[1], x: s.target.x + 0.3 }
    expect(tryLock(g, 1)).toBeNull()
    g.blades[0] = { ...g.blades[0], ...slotsOf(1)[0].target }       // a later composition's slot does not count yet
    expect(tryLock(g, 0)).toBeNull()
  })
  it('reset composition keeps earlier compositions and never gets stuck', () => {
    let g = freshProgress()
    slotsOf(0).forEach((s, i) => { g.blades[i] = { ...g.blades[i], ...s.target }; g = applyLock(g, i, tryLock(g, i)!) })
    g = advance(g)
    g = applyLock(g, 0, SLOTS.indexOf(slotsOf(1)[0]))
    g = resetComposition(g)
    expect(alignedCount(g)).toBe(3)
    expect(g.blades.every((b) => b.slot === null)).toBe(true)
  })
})

describe('progression & saving', () => {
  it('completing gallery 01 unlocks gallery 02 and survives a save/load round trip', () => {
    const mem: Record<string, string> = {}
    const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v } }
    let s = emptySave()
    expect(s.unlocked).toEqual([1])
    s = completeGallery(s, 1)
    expect(s.unlocked).toContain(2)
    saveProgress(s, store)
    const back = loadProgress(store)
    expect(back.unlocked).toContain(2)
    expect(back.completed).toContain(1)
  })
})
