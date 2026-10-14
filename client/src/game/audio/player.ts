import { trackUrl, type Track } from './tracks'

export const STORAGE_KEY = 'pockie.audio'
export const FADE_MS = 300
export interface SoundSettings {
  muted: boolean
  volume: number
}
export const DEFAULT_SETTINGS: SoundSettings = { muted: false, volume: 50 }

export function readSettings(): SoundSettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS
    const settings = value as Partial<SoundSettings>
    return {
      muted: typeof settings.muted === 'boolean' ? settings.muted : false,
      volume:
        typeof settings.volume === 'number' && Number.isFinite(settings.volume)
          ? Math.max(0, Math.min(100, settings.volume))
          : 50,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** One element, with a 150 ms fade out followed by a 150 ms fade in. */
export class MusicPlayer {
  private unlocked = false
  private current: Track | null = null
  private wanted: Track | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private gain = 1
  private settings: SoundSettings

  constructor(
    private audio: HTMLAudioElement,
    settings: SoundSettings,
  ) {
    this.settings = settings
    audio.loop = true
    this.apply()
  }

  configure(settings: SoundSettings) {
    this.settings = settings
    this.apply()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* Storage may be disabled. */
    }
  }

  private apply() {
    this.audio.muted = this.settings.muted
    this.audio.volume = (this.settings.volume / 100) * this.gain
  }

  unlock() {
    this.unlocked = true
    if (this.current === null) this.start(this.wanted)
    else this.play()
  }

  private play() {
    // A rejected autoplay promise is harmless; a later gesture retries it.
    void this.audio.play().catch(() => {})
  }

  private start(track: Track | null) {
    this.audio.pause()
    this.current = track
    if (track === null) {
      this.audio.removeAttribute('src')
      return
    }
    this.audio.src = trackUrl(track)
    this.audio.currentTime = 0
    this.play()
  }

  select(track: Track | null) {
    this.wanted = track
    if (!this.unlocked) return
    clearInterval(this.timer)
    if (track === this.current) {
      this.gain = 1
      this.apply()
      return
    }
    if (this.current === null) {
      this.gain = 1
      this.apply()
      this.start(track)
      return
    }
    const initialGain = this.gain
    let elapsed = 0
    let switched = false
    this.timer = setInterval(() => {
      elapsed += 15
      if (elapsed >= FADE_MS / 2 && !switched) {
        this.gain = 0
        this.apply()
        this.start(track)
        switched = true
      }
      this.gain = switched
        ? Math.min(1, (elapsed - FADE_MS / 2) / (FADE_MS / 2))
        : initialGain * (1 - elapsed / (FADE_MS / 2))
      this.apply()
      if (elapsed >= FADE_MS) clearInterval(this.timer)
    }, 15)
  }

  dispose() {
    clearInterval(this.timer)
    this.audio.pause()
    this.audio.removeAttribute('src')
  }
}
