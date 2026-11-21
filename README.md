# THE CURATOR — Gallery 01 "First Light"

*Every shadow holds a secret.* A browser-based architectural puzzle game in React Three Fiber.
This build contains **Gallery 01 only**, rebuilt for photorealism and awaiting visual approval
before the other 49 rooms are built. All 50 galleries are catalogued in the Atlas; the others stay locked.

## Run it

```bash
cd app
npm install
npm run dev          # http://localhost:5173
npm test             # catalogue, solvability, alignment counts, progression, saving
npm run build        # static build in app/dist (deployable to Vercel/Netlify as-is)
```

Controls: click a stone crescent to select · drag it across the floor · drag the bronze ring
(or **Q / E**, Shift for 1°) to turn it · arrow keys nudge · **Tab** cycles sculptures · **H** hint
(three stages) · **V** align view · **P** plan view · **R** explore view · **F** focus ·
**Ctrl+Z / Ctrl+Y** undo / redo · **Esc** deselect / pause. Touch: tap, drag, pinch.

## How Gallery 01 plays

The sun falls through the first skylight onto the floor, where a circle is etched into the concrete.
Three movable sculptures each hold a crescent of limestone 92 cm above the floor. A crescent's
shadow is a segment of a circle with the same radius as the etched one. Each sculpture locks
when its shadow lies on a free segment of the circle (±12 cm, ±8° on Easy). That makes
**5 compositions × 3 alignments = 15 alignments**. After each composition the light
"inlays" that arc into the floor and the sculptures are released for the next one. When the circle
is whole, a hidden plaster door in the end wall slides open onto a sunlit vestibule.

Every target is computed by inverting the sun-shadow geometry from the solved configuration.
The scrambled starts come afterwards from the gallery's deterministic seed, so the puzzle is
always solvable (`src/game/puzzle.test.ts` proves it).

## Asset pipeline (Blender → glTF → three.js)

`pipeline/` builds the room headlessly with Blender's Python module (`pip install bpy==5.3.0`):

| Step | Script | Output (`app/public/…`) |
|---|---|---|
| PBR textures (albedo / normal / roughness, tileable, 2048 px) | `textures.py` | `tex/*.jpg` |
| Architecture + static sculptures, lightmap UVs, **Cycles bake of sky + sun + bounced light**, HDR light probe | `build_g01.py --lm 2048 --samples 160` | `assets/g01/gallery01.glb`, `lightmap.hdr`, `probe.hdr` |
| Path-traced still from the game camera (for comparison) | `build_g01.py … --ref` | `pipeline/ref_cycles.png` |
| The movable crescent sculpture | `build_blade.py` | `assets/g01/blade.glb` |

All of it is driven by one layout file, `app/src/data/g01.layout.json` (room, skylights, sun, decor,
puzzle), read by both Blender and the game.

**In the browser:**
- **Static architecture:** carries the baked light, with the real-time sun switched off on it so nothing is lit twice.
- **Movable sculptures:** lit by a real-time sun, masked analytically by the skylight geometry (they're only sunlit inside the true sun patches), plus the Cycles light probe and real-time soft shadows.
- **Floor shadow catcher:** shows the sculptures' shadows only where sunlight falls.
- **Finishing:** N8AO ambient occlusion, ACES filmic tone mapping and a slight desaturation grade.

## Not yet available here
Scanned photo textures and photogrammetry models (Poly Haven, ambientCG, Sketchfab) are blocked by
this workspace's network allowlist. Textures are generated PBR sets instead. To upgrade, drop
2K/4K CC0 sets into `app/public/tex/` with the same file names (`concrete.jpg`, `concrete_n.jpg`,
`concrete_r.jpg`, …) and rebuild.
