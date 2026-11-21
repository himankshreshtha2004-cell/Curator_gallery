// Gallery 01 "First Light" — puzzle model (pure functions, no rendering).
//
// The sun falls through the first skylight onto the floor, where a circle is etched.
// Three movable "arc blade" sculptures each hold a curved stone arc above the floor; the
// arc's SHADOW is a segment of a circle of the same radius. A blade is aligned when its
// shadow lies exactly on its slot of the etched circle. Five compositions x three slots
// = 15 alignments. Every target transform is derived from the solved configuration
// first (the shadow geometry is inverted analytically), and the scrambled starts are
// generated afterwards from a deterministic seed — so every puzzle is solvable by construction.
import layout from '../data/g01.layout.json'

export interface Xform { x: number; z: number; yaw: number }   // yaw: radians about +Y (three.js convention)
export interface Slot { composition: number; index: number; angle: number; target: Xform }
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Circle { x: number; z: number; r: number }

export const P = layout.puzzle
export const ROOM = layout.room
export const COMPOSITIONS = P.compositions
export const PER = P.piecesPerComposition
export const TOTAL = COMPOSITIONS * PER
export const ARC_SPAN = (P.arcSpanDeg * Math.PI) / 180
export const TOL_POS = P.tolerance.position
export const TOL_YAW = (P.tolerance.yawDeg * Math.PI) / 180
export const CIRCLE = P.circle
export const ARM = P.blade.armHeight
/** the arc runs from angle ARC_FROM to ARC_FROM + ARC_SPAN around its circle centre; the stem stands under ARC_FROM */
export const ARC_FROM = ((P.blade.arcFromDeg ?? -P.arcSpanDeg / 2) * Math.PI) / 180

/** unit vector pointing TOWARD the sun (three.js world, Y up) */
export function toSun(): [number, number, number] {
  const el = (layout.sun.elevationDeg * Math.PI) / 180
  const [tx, tz] = layout.sun.travel
  const h = Math.hypot(tx, tz)
  return [(-tx / h) * Math.cos(el), Math.sin(el), (-tz / h) * Math.cos(el)]
}
/** horizontal displacement of the shadow of a point at height y */
export function shadowOffset(y: number): [number, number] {
  const L = toSun()
  return [(-y * L[0]) / L[1], (-y * L[2]) / L[1]]
}

const rotY = (x: number, z: number, yaw: number): [number, number] => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)]

/** world position of a point on the blade's arc (s in [-1,1] along the arc) */
export function arcPoint(b: Xform, s: number): [number, number, number] {
  const a = ARC_FROM + ((s + 1) / 2) * ARC_SPAN, R = CIRCLE.radius
  const [lx, lz] = rotY(R * Math.sin(a), R - R * Math.cos(a), b.yaw)
  return [b.x + lx, ARM, b.z + lz]
}
/** where that arc point's shadow lands on the floor */
export function arcShadow(b: Xform, s: number): [number, number] {
  const p = arcPoint(b, s), o = shadowOffset(ARM)
  return [p[0] + o[0], p[2] + o[1]]
}

/** inverse problem: blade transform whose arc shadow covers the circle segment centred at angle phi */
export function solveSlot(phi: number): Xform {
  const m = ARC_FROM + ARC_SPAN / 2                  // local angle of the arc's midpoint
  const yaw = m - Math.PI / 2 - phi
  const [cx, cz] = rotY(0, CIRCLE.radius, yaw)      // blade origin -> arc's circle centre (horizontal)
  const o = shadowOffset(ARM)
  return { x: CIRCLE.x - o[0] - cx, z: CIRCLE.z - o[1] - cz, yaw }
}

/** slot angle: composition c covers [c*72°, c*72°+72°], three 24° segments */
export function slotAngle(c: number, i: number) {
  const seg = (2 * Math.PI) / (COMPOSITIONS * PER)
  return (c * PER + i + 0.5) * seg
}
export const SLOTS: Slot[] = Array.from({ length: TOTAL }, (_, k) => {
  const c = Math.floor(k / PER), i = k % PER, angle = slotAngle(c, i)
  return { composition: c, index: i, angle, target: solveSlot(angle) }
})
export const slotsOf = (c: number) => SLOTS.filter((s) => s.composition === c)

export const DRAG: Rect = P.dragBounds
export const START: Rect = P.startZone
/** solid things on the floor the blades must stay clear of (centre + radius) */
export const OBSTACLES: Circle[] = [
  { x: layout.decor.ribbon.x, z: layout.decor.ribbon.z, r: 0.75 },
]
export const BLADE_CLEARANCE = 0.45   // min distance between two blade origins (adjacent slots sit 0.50 m apart)

export function angleDiff(a: number, b: number) {
  let d = (a - b) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return Math.abs(d)
}
export function matches(b: Xform, t: Xform, tolPos = TOL_POS, tolYaw = TOL_YAW) {
  return Math.hypot(b.x - t.x, b.z - t.z) <= tolPos && angleDiff(b.yaw, t.yaw) <= tolYaw
}
/** 0..1 closeness to a target (1 = exact), for the "alignment improving" feedback */
export function closeness(b: Xform, t: Xform) {
  const d = Math.hypot(b.x - t.x, b.z - t.z) / 1.2 + angleDiff(b.yaw, t.yaw) / Math.PI
  return Math.max(0, 1 - d)
}

/** keep a blade inside its permitted floor area and clear of obstacles / other blades */
export function constrain(b: Xform, others: Xform[]): Xform {
  let x = Math.min(DRAG.x1, Math.max(DRAG.x0, b.x)), z = Math.min(DRAG.z1, Math.max(DRAG.z0, b.z))
  for (let it = 0; it < 3; it++) {
    for (const o of OBSTACLES) {
      const d = Math.hypot(x - o.x, z - o.z)
      if (d < o.r) { const k = o.r / Math.max(d, 1e-4); x = o.x + (x - o.x) * k; z = o.z + (z - o.z) * k }
    }
    for (const o of others) {
      const d = Math.hypot(x - o.x, z - o.z)
      if (d < BLADE_CLEARANCE) { const k = BLADE_CLEARANCE / Math.max(d, 1e-4); x = o.x + (x - o.x) * k; z = o.z + (z - o.z) * k }
    }
    x = Math.min(DRAG.x1, Math.max(DRAG.x0, x)); z = Math.min(DRAG.z1, Math.max(DRAG.z0, z))
  }
  return { x, z, yaw: b.yaw }
}

// ---------------------------------------------------------------- deterministic scrambles
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** scrambled starting transforms for composition c (same seed -> same layout, always unsolved) */
export function scramble(c: number, seed = P.seed): Xform[] {
  const rnd = mulberry32(seed * 31 + c * 977 + 7)
  const out: Xform[] = []
  const targets = slotsOf(c).map((s) => s.target)
  let guard = 0
  while (out.length < PER && guard++ < 5000) {
    const b = { x: START.x0 + rnd() * (START.x1 - START.x0), z: START.z0 + rnd() * (START.z1 - START.z0), yaw: rnd() * Math.PI * 2 }
    if (out.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < BLADE_CLEARANCE + 0.15)) continue
    if (OBSTACLES.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < o.r)) continue
    if (targets.some((t) => matches(b, t, TOL_POS * 3, TOL_YAW * 3))) continue
    out.push(b)
  }
  return out
}

// ---------------------------------------------------------------- game state transitions (pure)
export interface BladeState extends Xform { slot: number | null }   // slot = index into SLOTS once locked
export interface GalleryProgress {
  composition: number          // 0..COMPOSITIONS (== COMPOSITIONS when complete)
  filled: boolean[]            // length TOTAL
  blades: BladeState[]
  complete: boolean
}
export function freshProgress(seed = P.seed): GalleryProgress {
  return { composition: 0, filled: Array(TOTAL).fill(false), blades: scramble(0, seed).map((b) => ({ ...b, slot: null })), complete: false }
}
export const alignedCount = (g: GalleryProgress) => g.filled.filter(Boolean).length

/** try to lock blade i into any free slot of the current composition; returns the slot index or null */
export function tryLock(g: GalleryProgress, i: number, tolPos = TOL_POS, tolYaw = TOL_YAW): number | null {
  const b = g.blades[i]
  if (!b || b.slot !== null || g.complete) return null
  for (let k = 0; k < SLOTS.length; k++) {
    const s = SLOTS[k]
    if (s.composition !== g.composition || g.filled[k]) continue
    if (matches(b, s.target, tolPos, tolYaw)) return k
  }
  return null
}
export function applyLock(g: GalleryProgress, i: number, k: number): GalleryProgress {
  const filled = g.filled.slice(); filled[k] = true
  const blades = g.blades.map((b, j) => (j === i ? { ...SLOTS[k].target, slot: k } : b))
  return { ...g, filled, blades }
}
export const compositionDone = (g: GalleryProgress, c = g.composition) => slotsOf(c).every((s) => g.filled[SLOTS.indexOf(s)])
/** advance to the next composition: blades are released to the next scrambled start */
export function advance(g: GalleryProgress, seed = P.seed): GalleryProgress {
  const next = g.composition + 1
  if (next >= COMPOSITIONS) return { ...g, composition: COMPOSITIONS, complete: true }
  return { ...g, composition: next, blades: scramble(next, seed).map((b) => ({ ...b, slot: null })) }
}
/** reset the active composition (keeps completed compositions) */
export function resetComposition(g: GalleryProgress, seed = P.seed): GalleryProgress {
  if (g.complete) return g
  const filled = g.filled.map((f, k) => (SLOTS[k].composition === g.composition ? false : f))
  return { ...g, filled, blades: scramble(g.composition, seed).map((b) => ({ ...b, slot: null })) }
}
