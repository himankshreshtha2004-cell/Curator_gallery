import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useGame } from '../state/store'
import { CATALOG, WINGS, pad2, byId } from '../data/catalog'
import { TOTAL, COMPOSITIONS, PER, alignedCount, guide, TOL_POS, TOL_YAW } from '../game/puzzle'
import layout from '../data/g01.layout.json'

// ---------------------------------------------------------------- icons (thin, minimal)
const I = {
  pause: <svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12" /></svg>,
  sound: <svg viewBox="0 0 24 24"><path d="M5 10v4h3l4 3V7l-4 3H5zM16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /></svg>,
  mute: <svg viewBox="0 0 24 24"><path d="M5 10v4h3l4 3V7l-4 3H5zM16 10l4 4M20 10l-4 4" /></svg>,
  settings: <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  rotL: <svg viewBox="0 0 24 24"><path d="M7 8a7 7 0 1 1-1.5 7M7 3v5h5" /></svg>,
  rotR: <svg viewBox="0 0 24 24"><path d="M17 8a7 7 0 1 0 1.5 7M17 3v5h-5" /></svg>,
  focus: <svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><circle cx="12" cy="12" r="2" /></svg>,
  close: <svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>,
  undo: <svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>,
  redo: <svg viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></svg>,
  hint: <svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>,
  help: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></svg>,
}
const Btn = ({ label, onClick, children, active, disabled }: any) => (
  <button className={'icon' + (active ? ' on' : '')} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
)

// ---------------------------------------------------------------- floor plan drawn from the actual room data
export function FloorPlan({ size = 220 }: { size?: number }) {
  const R = layout.room, w = R.x1 - R.x0, d = R.z1 - R.z0 + layout.door.vestibuleDepth + R.wall, pad = 0.8
  const vb = `${R.x0 - pad} ${R.z0 - layout.door.vestibuleDepth - R.wall - pad} ${w + pad * 2} ${d + pad * 2}`
  const D = layout.decor, pc = layout.puzzle.circle
  return (
    <svg className="plan" viewBox={vb} style={{ height: size }} aria-label="Floor plan of Gallery 01">
      <rect x={R.x0} y={R.z0} width={w} height={R.z1 - R.z0} className="pl-room" />
      <rect x={-1.6} y={R.z0 - R.wall - layout.door.vestibuleDepth} width={3.2} height={layout.door.vestibuleDepth} className="pl-room" />
      <line x1={-0.75} x2={0.75} y1={R.z0 - R.wall / 2} y2={R.z0 - R.wall / 2} className="pl-door" />
      {layout.skylights.map((s, i) => <rect key={i} x={s.x0} y={s.z0} width={s.x1 - s.x0} height={s.z1 - s.z0} className="pl-sky" />)}
      <rect x={D.platformFront.x - D.platformFront.w / 2} y={D.platformFront.z - D.platformFront.d / 2} width={D.platformFront.w} height={D.platformFront.d} className="pl-obj" />
      <rect x={D.pedestalFront.x - D.pedestalFront.s / 2} y={D.pedestalFront.z - D.pedestalFront.s / 2} width={D.pedestalFront.s} height={D.pedestalFront.s} className="pl-obj" />
      <circle cx={D.platformRight.x} cy={D.platformRight.z} r={D.platformRight.r} className="pl-obj" />
      <rect x={D.pedestalFar.x - D.pedestalFar.w / 2} y={D.pedestalFar.z - D.pedestalFar.w / 2} width={D.pedestalFar.w} height={D.pedestalFar.w} className="pl-obj" />
      <circle cx={D.ribbon.x} cy={D.ribbon.z} r={0.35} className="pl-obj" />
      <circle cx={pc.x} cy={pc.z} r={pc.radius} className="pl-target" />
    </svg>
  )
}

// ---------------------------------------------------------------- screens
function Loading() {
  const { active, progress } = useProgress()
  const [gone, setGone] = useState(false)
  useEffect(() => { if (!active && progress >= 100) { const t = setTimeout(() => setGone(true), 600); return () => clearTimeout(t) } }, [active, progress])
  if (gone) return null
  return <div className={'loading' + (!active && progress >= 100 ? ' out' : '')}><div className="eyebrow">THE CURATOR</div><div className="bar"><i style={{ width: `${progress}%` }} /></div></div>
}

function Title({ onSettings }: { onSettings(): void }) {
  const st = useGame()
  const hasJourney = Object.keys(st.save.galleries).length > 0 || st.save.completed.length > 0
  return (
    <div className="title fade-in">
      <div className="title-block">
        <h1>THE CURATOR</h1>
        <p className="tagline">Every shadow holds a secret.</p>
        <nav className="menu">
          {hasJourney && <button onClick={() => st.enterGallery(1)}>Continue</button>}
          <button onClick={() => st.newJourney()}>New Journey</button>
          <button onClick={() => st.go('atlas')}>Explore Galleries</button>
          <button onClick={onSettings}>Settings</button>
        </nav>
      </div>
    </div>
  )
}

function Atlas() {
  const st = useGame()
  return (
    <div className="atlas fade-in">
      <header>
        <button className="link" onClick={() => st.go('title')}>← The Curator</button>
        <div><div className="eyebrow">GALLERY ATLAS</div><h2>Fifty rooms, three wings</h2></div>
        <div className="atlas-stat">{st.save.completed.length} / 50 complete</div>
      </header>
      <div className="wings">
        {WINGS.map((w) => (
          <section key={w.id} className="wing">
            <div className="wing-head"><span className="numeral">{w.numeral}</span><div><h3>{w.title}</h3><div className="eyebrow">{w.difficulty} · {CATALOG.filter((g) => g.wing === w.id).length} GALLERIES</div></div></div>
            <ol>
              {CATALOG.filter((g) => g.wing === w.id).map((g) => {
                const unlocked = st.save.unlocked.includes(g.id), done = st.save.completed.includes(g.id)
                const playable = unlocked && g.built
                return (
                  <li key={g.id} className={(playable ? 'playable ' : '') + (unlocked ? '' : 'locked')}>
                    <button disabled={!playable} onClick={() => playable && st.enterGallery(g.id)}>
                      <span className="num">{pad2(g.id)}</span>
                      <span className="nm">{g.name}<small>{g.architecture} · {g.pattern}</small></span>
                      <span className="meta">{g.alignments}<small>{done ? 'complete' : !unlocked ? 'locked' : g.built ? 'open' : 'in preparation'}</small></span>
                    </button>
                    {g.id === 1 && <div className="preview"><FloorPlan size={150} /><p>Long rectangular skylight gallery. Lay the sculptures' shadows into a perfect circle.</p></div>}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}

function SettingsPanel({ onClose, inGame }: { onClose(): void; inGame: boolean }) {
  const st = useGame(), s = st.save.settings
  return (
    <div className="paper-overlay fade-in" role="dialog" aria-label={inGame ? 'Paused' : 'Settings'}>
      <div className="paper">
        <div className="eyebrow">{inGame ? 'PAUSED' : 'SETTINGS'}</div>
        {inGame && (
          <div className="stack">
            <button className="row-btn" onClick={onClose}>Resume</button>
            <button className="row-btn" onClick={() => st.resetComposition()}>Restart composition</button>
            <button className="row-btn" onClick={() => { if (confirm('Restart Gallery 01 from the first composition?')) st.restartGallery() }}>Restart gallery</button>
            <button className="row-btn" onClick={() => st.go('atlas')}>Gallery atlas</button>
          </div>
        )}
        <div className="settings">
          <label><span>Sound</span><input type="checkbox" checked={s.sound} onChange={(e) => st.setSettings({ sound: e.target.checked })} /></label>
          <label><span>Volume</span><input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => st.setSettings({ volume: +e.target.value })} /></label>
          <label><span>Room ambience</span><input type="checkbox" checked={s.music} onChange={(e) => st.setSettings({ music: e.target.checked })} /></label>
          <label><span>Camera sensitivity</span><input type="range" min={0.5} max={1.5} step={0.05} value={s.cameraSensitivity} onChange={(e) => st.setSettings({ cameraSensitivity: +e.target.value })} /></label>
          <label><span>Graphics quality</span>
            <select value={s.quality} onChange={(e) => st.setSettings({ quality: e.target.value as any })}>
              <option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low</option>
            </select>
          </label>
          <label><span>Reduced motion</span><input type="checkbox" checked={s.reducedMotion} onChange={(e) => st.setSettings({ reducedMotion: e.target.checked })} /></label>
          <label><span>High-contrast interface</span><input type="checkbox" checked={s.highContrastUI} onChange={(e) => st.setSettings({ highContrastUI: e.target.checked })} /></label>
        </div>
        <button className="link close" onClick={onClose}>{inGame ? 'Resume' : 'Done'}</button>
      </div>
    </div>
  )
}

const TUTORIAL = [
  'Click one of the three stone crescents to pick it up.',
  'Drag it into the patch of sunlight on the left. Its shadow appears on the floor.',
  'Turn it with the bronze ring, or Q and E, until its shadow curves like the circle.',
  'Slide the curved shadow onto the etched circle. When it fits, it locks.',
]
const HINT_TEXT = [
  '',
  'Hint 1 · The line on the floor leads the crescent to where it belongs.',
  'Hint 2 · The pale outline shows exactly how it should stand.',
  'Hint 3 · Select a crescent and press “Place it” to set it for you.',
]

function Briefing() {
  const st = useGame()
  if (!st.briefing) return null
  return (
    <div className="briefing fade-in" role="dialog" aria-label="How to play">
      <div className="paper">
        <div className="eyebrow">GALLERY 01 · FIRST LIGHT</div>
        <h2>The light writes in shadow.</h2>
        <ol className="steps">
          <li><b>1</b><span>An empty circle is etched into the floor, inside a patch of sunlight.</span></li>
          <li><b>2</b><span>Move and turn each stone crescent so its <em>curved shadow</em> lies exactly on the circle.</span></li>
          <li><b>3</b><span>Every shadow that fits locks in place. Fill all five arcs, 15 shadows, and the way on opens.</span></li>
        </ol>
        <p className="keys">Drag to move · drag the bronze ring or press Q / E to turn · H for a hint · drag anywhere else to look around · scroll to zoom</p>
        <button className="begin" onClick={() => st.closeBriefing()} autoFocus>Begin</button>
      </div>
    </div>
  )
}

/** live guidance for the selected crescent: how far, which way to turn, and when it fits */
function Guidance({ i }: { i: number }) {
  const progress = useGame((s) => s.progress), dragging = useGame((s) => s.dragging)
  const g = guide(progress, i)
  if (!g) return null
  const deg = Math.round((Math.abs(g.turn) * 180) / Math.PI)
  const fits = g.dist <= TOL_POS && Math.abs(g.turn) <= TOL_YAW
  if (fits) return <span className="guide fit">{dragging ? 'It fits — let go' : 'It fits'}</span>
  const parts: string[] = []
  if (g.dist > TOL_POS) parts.push(g.dist < 0.4 ? 'very close' : g.dist < 1.2 ? `${g.dist.toFixed(1)} m away` : 'far from its place')
  if (Math.abs(g.turn) > TOL_YAW) parts.push(`turn ${g.turn > 0 ? 'left ↺ (Q)' : 'right ↻ (E)'} ${deg}°`)
  return <span className="guide">{parts.join(' · ')}</span>
}

function Hud() {
  const st = useGame()
  const g = byId(st.gallery ?? 1)
  const count = alignedCount(st.progress)
  const sel = st.selected
  const [now, setNow] = useState(performance.now())
  useEffect(() => { const t = setInterval(() => setNow(performance.now()), 5000); return () => clearInterval(t) }, [])
  const stuck = !st.briefing && !st.progress.complete && now - st.lastProgressAt > 40000
  return (
    <div className="hud">
      <div className="hud-tl">
        <div className="eyebrow">GALLERY {pad2(g.id)}</div>
        <div className="gname">{g.name}</div>
        {!st.progress.complete && <div className="objective">Lay each crescent's shadow on the etched circle</div>}
      </div>
      <div className="hud-tr">
        <Btn label="How to play" onClick={() => st.openBriefing()}>{I.help}</Btn>
        <Btn label="Pause" onClick={() => st.setPaused(true)}>{I.pause}</Btn>
        <Btn label={st.save.settings.sound ? 'Mute sound' : 'Unmute sound'} onClick={() => st.setSettings({ sound: !st.save.settings.sound })}>{st.save.settings.sound ? I.sound : I.mute}</Btn>
        <Btn label="Settings" onClick={() => st.setPaused(true)}>{I.settings}</Btn>
      </div>
      <div className="hud-bl">
        <div className="eyebrow">{g.pattern.toUpperCase()}</div>
        <div className="count"><b>{pad2(count)}</b> / {TOTAL} ALIGNMENTS</div>
        <div className="dots" aria-label={`Composition ${Math.min(st.progress.composition + 1, COMPOSITIONS)} of ${COMPOSITIONS}`}>
          {Array.from({ length: COMPOSITIONS }, (_, c) => {
            const n = st.progress.filled.slice(c * PER, c * PER + PER).filter(Boolean).length
            return <i key={c} className={n === PER ? 'done' : c === st.progress.composition ? 'active' : ''}><em style={{ width: `${(n / PER) * 100}%` }} /></i>
          })}
        </div>
      </div>
      <div className="hud-bc">
        {sel !== null && !st.progress.complete ? (
          <div className="ctx fade-in">
            <Btn label="Turn left (Q)" onClick={() => st.nudge(sel, 0, 0, (5 * Math.PI) / 180)}>{I.rotL}</Btn>
            <span className="ctx-label">Crescent {sel + 1}<small><Guidance i={sel} /></small></span>
            <Btn label="Turn right (E)" onClick={() => st.nudge(sel, 0, 0, (-5 * Math.PI) / 180)}>{I.rotR}</Btn>
            <span className="sep" />
            {st.hint >= 3 && <button className="txt on" onClick={() => st.placeSelected()}>Place it</button>}
            <Btn label="Focus (F)" onClick={() => st.setCam('focus')}>{I.focus}</Btn>
            <Btn label="Deselect (Esc)" onClick={() => st.select(null)}>{I.close}</Btn>
          </div>
        ) : null}
        {!st.progress.complete && !st.briefing && (st.hint ? (
          <p className="caption fade-in" key={'h' + st.hint}>{HINT_TEXT[st.hint]}</p>
        ) : st.tutorial < 4 && sel === null ? (
          <p className="caption fade-in" key={st.tutorial}>{TUTORIAL[st.tutorial]}</p>
        ) : stuck && sel === null ? (
          <p className="caption fade-in">Stuck? Tap Hint, or press H. It shows where each shadow belongs.</p>
        ) : null)}
        {st.dragging && st.closeness > 0.55 && <div className="meter"><i style={{ width: `${Math.round(st.closeness * 100)}%` }} /></div>}
      </div>
      <div className="hud-br">
        <Btn label="Undo (Ctrl+Z)" onClick={() => st.doUndo()} disabled={!st.undo.length}>{I.undo}</Btn>
        <Btn label="Redo (Ctrl+Y)" onClick={() => st.doRedo()} disabled={!st.redo.length}>{I.redo}</Btn>
        <span className="sep" />
        <button className={'txt' + (st.hint ? ' on' : '') + (stuck && !st.hint ? ' pulse' : '')} onClick={() => st.setHint(((st.hint + 1) % 4) as any)} aria-label="Hint (H)">
          {I.hint}<span>{st.hint ? `Hint ${st.hint}/3` : 'Hint'}</span>
        </button>
        <span className="sep" />
        {(['explore', 'align', 'plan'] as const).map((m) => (
          <button key={m} className={'txt' + (st.camMode === m ? ' on' : '')} onClick={() => st.setCam(m)}>{m === 'explore' ? 'Explore' : m === 'align' ? 'Align view' : 'Plan'}</button>
        ))}
      </div>
    </div>
  )
}

function Banner() {
  const b = useGame((s) => s.banner)
  const [, tick] = useState(0)
  useEffect(() => { if (!b) return; const t = setTimeout(() => tick((x) => x + 1), b.kind === 'arrival' ? 3800 : 3600); return () => clearTimeout(t) }, [b])
  if (!b) return null
  const age = performance.now() - b.t, life = b.kind === 'arrival' ? 3800 : b.kind === 'complete' ? 6000 : 3600
  if (age > life) return null
  return (
    <div className={'banner ' + b.kind} key={b.t}>
      <div className="eyebrow">{b.title}</div>
      <div className="banner-sub">{b.sub}</div>
    </div>
  )
}

function NextGallery() {
  const [show, setShow] = useState(false)
  const st = useGame()
  useEffect(() => { const f = () => setShow(true); window.addEventListener('curator:transition-done', f); return () => window.removeEventListener('curator:transition-done', f) }, [])
  useEffect(() => { if (st.screen !== 'game') setShow(false) }, [st.screen])
  if (!show) return null
  const g = byId(2)
  return (
    <div className="next fade-in">
      <div className="eyebrow">GALLERY {pad2(g.id)}</div>
      <h2>{g.name}</h2>
      <p className="muted">{g.architecture} · {g.pattern} · {g.alignments} alignments</p>
      <p className="note">Unlocked. This room opens once the visual standard of Gallery 01 is approved.</p>
      <div className="row"><button onClick={() => st.go('atlas')}>Gallery atlas</button><button onClick={() => { setShow(false); st.setCam('explore') }}>Stay in First Light</button></div>
    </div>
  )
}

export function Overlay() {
  const st = useGame()
  const [settings, setSettings] = useState(false)
  if (typeof location !== 'undefined' && location.search.includes('clean')) return <div className="overlay"><Loading /></div>
  return (
    <div className={'overlay' + (st.save.settings.highContrastUI ? ' hc' : '')}>
      <Loading />
      {st.screen === 'title' && !settings && <Title onSettings={() => setSettings(true)} />}
      {st.screen === 'atlas' && <Atlas />}
      {st.screen === 'game' && <Hud />}
      {st.screen === 'game' && <Briefing />}
      {st.screen === 'game' && <Banner />}
      {st.screen === 'game' && <NextGallery />}
      {(settings || (st.screen === 'game' && st.paused)) && <SettingsPanel inGame={st.screen === 'game'} onClose={() => { setSettings(false); st.setPaused(false) }} />}
    </div>
  )
}
