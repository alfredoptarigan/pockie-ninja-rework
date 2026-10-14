import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { MusicPlayer, readSettings, type SoundSettings } from './player'
import { battleTrack, sceneTrack, type Track } from './tracks'

interface AudioContextValue {
  settings: SoundSettings
  configure: (settings: SoundSettings) => void
  register: (id: symbol, track: Track, priority: number) => () => void
}
const AudioContext = createContext<AudioContextValue | null>(null)
function useAudio() {
  const value = useContext(AudioContext)
  if (!value) throw new Error('Audio controls require AudioProvider')
  return value
}

export function AudioProvider({ children, sceneId }: { children: ReactNode; sceneId?: number }) {
  const [settings, setSettings] = useState(readSettings)
  const audio = useRef<HTMLAudioElement>(null)
  const player = useRef<MusicPlayer | null>(null)
  const [tracks, setTracks] = useState<Map<symbol, { track: Track; priority: number }>>(new Map())
  const register = useCallback((id: symbol, track: Track, priority: number) => {
    setTracks((previous) => new Map(previous).set(id, { track, priority }))
    return () =>
      setTracks((previous) => {
        const next = new Map(previous)
        next.delete(id)
        return next
      })
  }, [])
  useEffect(() => {
    const music = new MusicPlayer(audio.current!, readSettings())
    player.current = music
    const unlock = () => music.unlock()
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
      music.dispose()
      player.current = null
    }
  }, [])
  useEffect(() => {
    player.current?.configure(settings)
  }, [settings])
  useEffect(() => {
    const override = [...tracks.values()].sort((a, b) => b.priority - a.priority)[0]
    player.current?.select(override?.track ?? (sceneId === undefined ? null : sceneTrack(sceneId)))
  }, [tracks, sceneId])
  return (
    <AudioContext value={{ settings, configure: setSettings, register }}>
      <audio ref={audio} loop preload="none" />
      {children}
    </AudioContext>
  )
}

function useTrack(track: Track | null, priority: number) {
  const { register } = useAudio()
  useEffect(
    () => (track === null ? undefined : register(Symbol(), track, priority)),
    [register, track, priority],
  )
}
/** Use when the provider is not given a sceneId prop. */
export function useSceneTrack(sceneId: number) {
  useTrack(sceneTrack(sceneId), 0)
}
/** Mount only while the replay is open. Tailed Beast takes precedence over battle music. */
export function useBattleTrack(seed: number | undefined) {
  useTrack(seed === undefined ? null : battleTrack(seed), 1)
}
export function useTailedBeastTrack(active = true) {
  useTrack(active ? 'tb' : null, 2)
}

/**
 * The top bar's 22x18 speaker: mutes or unmutes the music. ponytail: Reborn's sound-on/off PNGs
 * are not exported, so it draws a speaker; swap in the art when tools/ exports it.
 */
export function SoundToggle() {
  const { settings, configure } = useAudio()
  return (
    <button
      type="button"
      aria-label={settings.muted ? 'Unmute music' : 'Mute music'}
      title={settings.muted ? 'Sound off' : 'Sound on'}
      onClick={() => configure({ ...settings, muted: !settings.muted })}
      className="h-[18px] w-[22px] cursor-pointer text-[#f5f5f5] hover:brightness-125"
    >
      <svg viewBox="0 0 22 18" aria-hidden="true" className="size-full">
        <path d="M2 6h4l5-4v14l-5-4H2z" fill="currentColor" />
        {settings.muted ? (
          <path d="M14 6l6 6M20 6l-6 6" stroke="#ff5555" strokeWidth="2" />
        ) : (
          <path
            d="M14 5.5a5 5 0 0 1 0 7M16.5 3a8.5 8.5 0 0 1 0 12"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
          />
        )}
      </svg>
    </button>
  )
}

/**
 * The "Sound:" block of Reborn's Settings window: Mute Music, then "Volume %" as a number field and
 * a 0-100 slider, both disabled while the music is muted.
 */
export function SoundSettings() {
  const { settings, configure } = useAudio()
  const setVolume = (value: string) => {
    // An emptied field reads as 0, so typing a new number starts from scratch.
    const volume = Number(value)
    if (Number.isFinite(volume))
      configure({ ...settings, volume: Math.max(0, Math.min(100, Math.round(volume))) })
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-bold">Sound:</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(event) => configure({ ...settings, muted: event.target.checked })}
        />
        Mute Music
      </label>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          Volume %
          <input
            type="number"
            min="0"
            max="100"
            disabled={settings.muted}
            value={settings.volume}
            onChange={(event) => setVolume(event.target.value)}
            className="w-[50px] border border-wood-light bg-parchment px-1 disabled:opacity-50"
          />
        </label>
        <input
          type="range"
          aria-label="Volume"
          min="0"
          max="100"
          disabled={settings.muted}
          value={settings.volume}
          onChange={(event) => setVolume(event.target.value)}
          className="flex-1 disabled:opacity-50"
        />
      </div>
    </fieldset>
  )
}
