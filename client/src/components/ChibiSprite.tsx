import type { CSSProperties } from 'react'
import sprites from '../generated/sprites.json'

export type ChibiName = keyof typeof sprites

/**
 * Plays an exported sprite strip (tools/export-assets.ts) as a looping CSS animation.
 * The element scales with its width, so callers size it with a width class.
 */
export function ChibiSprite({ name, className = '' }: { name: ChibiName; className?: string }) {
  const sprite = sprites[name]
  const style = {
    aspectRatio: `${sprite.frameWidth} / ${sprite.frameHeight}`,
    backgroundImage: `url(${sprite.file})`,
    backgroundSize: `${sprite.frames * 100}% 100%`,
    backgroundRepeat: 'no-repeat',
    '--sprite-frames': sprite.frames,
    '--sprite-duration': `${sprite.frames / sprite.fps}s`,
  } as CSSProperties

  return (
    <div
      role="img"
      aria-label={sprite.name}
      className={`chibi-sprite ${className}`}
      style={style}
    />
  )
}
