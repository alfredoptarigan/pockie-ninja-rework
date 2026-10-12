// Shared Phaser setup: one game per mount, scaled to fit its parent with the picture's aspect ratio.
import Phaser from 'phaser'

export const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"Trebuchet MS", Verdana, sans-serif',
  fontStyle: 'bold',
  color: '#fff3c4',
  stroke: '#2b1608',
}

export function createGame(
  parent: HTMLElement,
  width: number,
  height: number,
  scene: Phaser.Scene,
) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#1c0f07',
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  })
}

/** Loads a motion sheet once per texture key (the file path). */
export function loadSheet(
  scene: Phaser.Scene,
  sheet: { file: string; frameWidth: number; frameHeight: number },
) {
  if (scene.textures.exists(sheet.file)) return
  scene.load.spritesheet(sheet.file, sheet.file, {
    frameWidth: sheet.frameWidth,
    frameHeight: sheet.frameHeight,
  })
}

/** Soft gold glow while the pointer is over an object. */
export function setHighlight(
  object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
  on: boolean,
) {
  if (!object.filters) {
    if (!on) return
    object.enableFilters()
    object.filters!.internal.addGlow(0xffe27a, 12, 0, 1.5)
  }
  for (const filter of object.filters!.internal.list) filter.setActive(on)
}
