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

/** Mount within the HUD's Sound settings dialog. */
export function SoundSettings() {
  const { settings, configure } = useAudio()
  return (
    <fieldset className="space-y-3">
      <legend>Sound</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(event) => configure({ ...settings, muted: event.target.checked })}
        />
        Mute music
      </label>
      <label className="flex items-center gap-2">
        Music volume
        <input
          type="range"
          min="0"
          max="100"
          value={settings.volume}
          onChange={(event) => configure({ ...settings, volume: Number(event.target.value) })}
        />
        <output>{settings.volume}%</output>
      </label>
    </fieldset>
  )
}
