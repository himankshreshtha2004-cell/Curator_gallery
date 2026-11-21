// Local persistence: progress is saved after every confirmed alignment.
import type { GalleryProgress } from './puzzle'

export interface Settings {
  sound: boolean
  music: boolean
  volume: number            // 0..1
  quality: 'high' | 'balanced' | 'low'
  reducedMotion: boolean
  cameraSensitivity: number // 0.5..1.5
  highContrastUI: boolean
}
export interface SaveData {
  version: 1
  unlocked: number[]
  completed: number[]
  galleries: Record<number, GalleryProgress>
  settings: Settings
  tutorialDone: boolean
  briefingSeen?: boolean
}
export const KEY = 'the-curator.save.v1'

export const defaultSettings = (): Settings => ({
  sound: true, music: false, volume: 0.7, quality: 'balanced', reducedMotion: false, cameraSensitivity: 1, highContrastUI: false,
})
export const emptySave = (): SaveData => ({ version: 1, unlocked: [1], completed: [], galleries: {}, settings: defaultSettings(), tutorialDone: false })

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void }
const ls = (): Store | null => (typeof localStorage !== 'undefined' ? localStorage : null)

export function loadProgress(store: Store | null = ls()): SaveData {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return emptySave()
    const d = JSON.parse(raw) as SaveData
    if (d.version !== 1 || !Array.isArray(d.unlocked)) return emptySave()
    return { ...emptySave(), ...d, settings: { ...defaultSettings(), ...d.settings } }
  } catch {
    return emptySave()
  }
}
export function saveProgress(d: SaveData, store: Store | null = ls()) {
  try { store?.setItem(KEY, JSON.stringify(d)) } catch { /* storage full or blocked: play on */ }
}
export function completeGallery(d: SaveData, id: number): SaveData {
  const completed = d.completed.includes(id) ? d.completed : [...d.completed, id]
  const unlocked = d.unlocked.includes(id + 1) || id >= 50 ? d.unlocked : [...d.unlocked, id + 1]
  return { ...d, completed, unlocked }
}
