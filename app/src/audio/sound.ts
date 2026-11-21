// Restrained procedural sound: stone on stone, soft clicks, a quiet two-note chime, room tone.
import type { Settings } from '../game/save'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let room: { src: AudioBufferSourceNode; gain: GainNode } | null = null
let slide: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null
let settings: Settings | null = null

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext
    if (!C) return null
    ctx = new C(); master = ctx.createGain(); master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}
function noise(c: AudioContext, seconds: number, brown = false) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate), d = b.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w
  }
  return b
}
const on = () => !!settings?.sound

export const sfx = {
  apply(s: Settings) {
    settings = s
    const c = ac(); if (!c || !master) return
    master.gain.setTargetAtTime(s.sound ? s.volume : 0, c.currentTime, 0.05)
    if (room) room.gain.gain.setTargetAtTime(s.sound && s.music ? 0.05 : 0.018, c.currentTime, 0.5)
  },
  ambience(s: Settings) {
    sfx.apply(s)
    const c = ac(); if (!c || !master || room) return
    const src = c.createBufferSource(); src.buffer = noise(c, 6, true); src.loop = true
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260
    const gain = c.createGain(); gain.gain.value = 0
    src.connect(f).connect(gain).connect(master); src.start()
    gain.gain.setTargetAtTime(s.music ? 0.05 : 0.018, c.currentTime, 1.5)
    room = { src, gain }
  },
  tick() {
    const c = ac(); if (!c || !master || !on()) return
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 1800
    g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05)
    o.connect(g).connect(master); o.start(); o.stop(c.currentTime + 0.06)
  },
  /** continuous stone-on-stone drag; speed 0..1 */
  slide(speed: number) {
    const c = ac(); if (!c || !master) return
    if (!slide) {
      const src = c.createBufferSource(); src.buffer = noise(c, 3); src.loop = true
      const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 420; filter.Q.value = 0.7
      const gain = c.createGain(); gain.gain.value = 0
      src.connect(filter).connect(gain).connect(master); src.start(); slide = { src, gain, filter }
    }
    const v = on() ? Math.min(1, speed) : 0
    slide.gain.gain.setTargetAtTime(v * 0.08, c.currentTime, 0.04)
    slide.filter.frequency.setTargetAtTime(300 + v * 500, c.currentTime, 0.05)
  },
  lock() {
    const c = ac(); if (!c || !master || !on()) return
    const t = c.currentTime
    const src = c.createBufferSource(); src.buffer = noise(c, 0.08)
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2
    const g = c.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    src.connect(f).connect(g).connect(master); src.start(t)
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 110
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.09, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    o.connect(og).connect(master); o.start(t); o.stop(t + 0.4)
  },
  chime(final = false) {
    const c = ac(); if (!c || !master || !on()) return
    const notes = final ? [523.25, 659.25, 783.99] : [587.33, 880]
    notes.forEach((hz, i) => {
      const t = c.currentTime + i * 0.32
      for (const [mult, amp] of [[1, 0.05], [2.76, 0.012]] as const) {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = hz * mult
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
        o.connect(g).connect(master!); o.start(t); o.stop(t + 2.7)
      }
    })
  },
  release() {
    const c = ac(); if (!c || !master || !on()) return
    const src = c.createBufferSource(); src.buffer = noise(c, 1.2)
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500
    const g = c.createGain(); const t = c.currentTime
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.2)
    src.connect(f).connect(g).connect(master); src.start(t)
  },
  door() {
    const c = ac(); if (!c || !master || !on()) return
    const src = c.createBufferSource(); src.buffer = noise(c, 3.2, true)
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180
    const g = c.createGain(); const t = c.currentTime
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 3.2)
    src.connect(f).connect(g).connect(master); src.start(t)
  },
}
