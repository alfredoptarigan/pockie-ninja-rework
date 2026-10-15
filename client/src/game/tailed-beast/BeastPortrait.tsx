// A beast's picture: frame "1" of its Reborn atlas, cropped with CSS.
import { useQuery } from '@tanstack/react-query'

/** Reborn art (client/src/generated/reborn-assets.json, category "event"). */
export const beastAtlas = (beast: number) => `/assets/reborn/scenes/tailedBeast/beast-${beast}`

type Frame = { x: number; y: number; w: number; h: number }

/** Nothing until the atlas data has loaded; `size` is the box the frame is fitted into. */
export function BeastPortrait({
  beast,
  name,
  size = 96,
}: {
  beast: number
  name: string
  size?: number
}) {
  const atlas = useQuery({
    queryKey: ['asset', 'tailedBeast', beast],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch(`${beastAtlas(beast)}.json`)
      const data = (await response.json()) as {
        textures: { size: { w: number; h: number }; frames: { filename: string; frame: Frame }[] }[]
      }
      const texture = data.textures[0]!
      return { size: texture.size, frame: texture.frames.find((f) => f.filename === '1')!.frame }
    },
  })
  if (!atlas.data) return <span className="block shrink-0" style={{ width: size, height: size }} />
  const { size: sheet, frame } = atlas.data
  const scale = Math.min(1, size / Math.max(frame.w, frame.h))
  return (
    <span
      role="img"
      aria-label={name}
      className="block shrink-0"
      style={{
        width: frame.w * scale,
        height: frame.h * scale,
        backgroundImage: `url(${beastAtlas(beast)}.webp)`,
        backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
        backgroundSize: `${sheet.w * scale}px ${sheet.h * scale}px`,
      }}
    />
  )
}
