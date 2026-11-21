// The 50-gallery catalogue (level-design specification from the master brief).
// Only Gallery 01 has a built room so far; the others are catalogued and locked until
// Gallery 01's visual standard is approved.

export type Wing = 'foundations' | 'intersections' | 'masterpieces'
export interface GalleryDef {
  id: number
  name: string
  architecture: string
  pattern: string
  alignments: number
  wing: Wing
  seed: number
  built: boolean
}

export const WINGS: { id: Wing; numeral: string; title: string; subtitle: string; difficulty: string }[] = [
  { id: 'foundations', numeral: 'I', title: 'The Foundations', subtitle: 'Easy', difficulty: 'EASY' },
  { id: 'intersections', numeral: 'II', title: 'The Intersections', subtitle: 'Medium', difficulty: 'MEDIUM' },
  { id: 'masterpieces', numeral: 'III', title: 'The Masterpieces', subtitle: 'Hard', difficulty: 'HARD' },
]

const rows: [string, string, string, number][] = [
  // WING I — THE FOUNDATIONS
  ['First Light', 'Long rectangular skylight gallery', 'Perfect circle', 15],
  ['The Pair', 'Twin-niche sculpture room', 'Two mirrored arcs', 16],
  ['Quiet Axis', 'Symmetrical linear hall', 'Geometric cross', 15],
  ['White Steps', 'Stepped, terraced gallery', 'Staircase silhouette', 16],
  ['The Arch', 'Vaulted stone alcove', 'Complete arch', 15],
  ['Hourline', 'Narrow gallery with slit skylight', 'Continuous straight line', 16],
  ['Ripple', 'Circular courtyard gallery', 'Concentric circles', 15],
  ['The Window', 'Square gallery with central skylight', 'Nested squares', 16],
  ['Two Halves', 'Split-level trapezoidal room', 'Joined semicircles', 15],
  ['The Leaf', 'Botanical sculpture gallery', 'Leaf silhouette', 16],
  ['The Balance', 'Offset-pedestal chamber', 'Balanced scales', 15],
  ['The Spiral', 'Circular gallery', 'Continuous spiral', 16],
  ['The Bridge', 'Sunken central exhibition room', 'Bridge-shaped arch', 15],
  ['The Compass', 'Octagonal gallery', 'Four-point compass', 16],
  ['Threshold', 'Monumental framed doorway hall', 'Keyhole silhouette', 16],
  // WING II — THE INTERSECTIONS
  ['The Sundial', 'Radial rotunda', 'Sundial markings', 17],
  ['The Echo', 'Mirrored dogleg corridor', 'Interlocking waves', 18],
  ['Folded Paper', 'Angular asymmetric gallery', 'Folded diamond', 19],
  ['The Bird', 'Tall pavilion with clerestory windows', 'Flying bird silhouette', 20],
  ['Hourglass', 'Double-height exhibition chamber', 'Hourglass', 18],
  ['Interlock', 'Intersecting corridor gallery', 'Linked rings', 17],
  ['The Orchard', 'Three-bay courtyard', 'Branching tree', 19],
  ['The Ribbon', 'L-shaped gallery', 'Infinity ribbon', 20],
  ['Celestial', 'Circular oculus chamber', 'Constellation arrangement', 18],
  ['Waterline', 'Gallery with a shallow reflecting pool', 'Continuous horizon', 17],
  ['The Maze', 'Pillar-grid exhibition space', 'Labyrinth', 20],
  ['The Canopy', 'Branching skylight gallery', 'Fractal branches', 19],
  ['Twin Suns', 'Two connected atriums', 'Eclipse discs', 18],
  ['The Loom', 'Colonnaded exhibition hall', 'Woven geometric grid', 20],
  ['The Mountain', 'Terraced landscape gallery', 'Mountain silhouette', 17],
  ['Sliced Sphere', 'Long gallery with narrow light slots', 'Segmented sphere', 19],
  ['The Feather', 'Diagonally arranged sculpture room', 'Feather silhouette', 20],
  ['Four Seasons', 'Four-alcove quadrangle', 'Quartered rosette', 18],
  ['The Passage', 'U-shaped architectural gallery', 'Continuous doorway outline', 19],
  ['The Crown', 'Five-bay exhibition gallery', 'Radial crown', 20],
  // WING III — THE MASTERPIECES
  ['Impossible Stair', 'Split-level optical-illusion room', 'Penrose staircase', 22],
  ['The Labyrinth', 'Interconnected stone courtyards', 'Continuous maze path', 23],
  ['The Observatory', 'Circular gallery with rotating skylights', 'Astronomical star chart', 24],
  ['Palimpsest', 'Room with layered movable partitions', 'Overlapping symbolic glyph', 25],
  ['The Timekeeper', 'Ring-shaped clock chamber', 'Complete clock face', 26],
  ['The Bloom', 'Petal-shaped radial gallery', 'Eight-fold flower', 23],
  ['Convergence', 'Intersecting triangular galleries', 'Geometric tessellation', 24],
  ['The Mirror Maze', 'Zigzag mirrored sculpture room', 'Symmetrical mandala', 25],
  ['Cathedral of Light', 'Tall minimalist vaulted gallery', 'Rose-window geometry', 26],
  ["Architect's Secret", 'Irregular polygonal gallery', 'Impossible cube', 27],
  ['The Atlas', 'Large stepped amphitheatre gallery', 'Topographic contour composition', 24],
  ['Eclipsed', 'Concentric elliptical mezzanine', 'Sequence of eclipse phases', 26],
  ['The Equation', 'Three interconnected mathematical rooms', 'Pythagorean geometric tiling', 28],
  ['Fracture', 'Fragmented architectural chamber', 'Reconstructed broken geometry', 29],
  ['The Final Curator', 'Five connected grand gallery chambers', 'Final composition combining five previously learned motifs', 30],
]

export const CATALOG: GalleryDef[] = rows.map(([name, architecture, pattern, alignments], i) => ({
  id: i + 1,
  name,
  architecture,
  pattern,
  alignments,
  wing: i < 15 ? 'foundations' : i < 35 ? 'intersections' : 'masterpieces',
  seed: 1000 + (i + 1) * 101,
  built: i === 0,
}))

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const byId = (id: number) => CATALOG[id - 1]
