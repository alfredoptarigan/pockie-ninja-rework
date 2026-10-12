// Phaser scene picture: layers at original coordinates, hoverable and clickable buildings, NPCs
// and monsters with English labels. Loaded lazily by ../stage.tsx.
import { gameMotions } from '../../generated/game-assets'
import type { SceneMonster, SceneNpc } from '../types'
import { createGame, LABEL_STYLE, loadSheet, setHighlight } from './game'
import { frameAt, originOf, tickMs } from './motion'
import { PORTRAIT_CELL, type PictureLayout } from './picture-layout'
import Phaser from 'phaser'

export interface PictureActions {
  onNpc: (npc: SceneNpc) => void
  onMonster: (monster: SceneMonster) => void
}

const SCENE_TICK_MS = tickMs(gameMotions.fps.scene)
const LABEL_SIZE = 34
/** Invisible but still hit-testable (Phaser skips input on alpha 0). */
const HIDDEN_ALPHA = 0.001
const TITLE_SIZE = 30
/** Longer monster names are cut like the original plates ("Sorchin..."). */
const NAME_CHARS = 10
/** Building names sit this far down the building's clip (its roof). */
const TITLE_DROP = 0.22

class PictureScene extends Phaser.Scene {
  private animated: { sprite: Phaser.GameObjects.Sprite; durations: number[] }[] = []
  private label!: Phaser.GameObjects.Text

  constructor(
    private readonly layout: PictureLayout,
    private readonly actions: PictureActions,
  ) {
    super('picture')
  }

  preload() {
    const { under, hotspots, figures, portraits, skybox } = this.layout
    const files = [
      ...under,
      ...hotspots.map((h) => h.spot.file),
      ...portraits.map((p) => p.portrait),
    ]
    for (const file of [...files, skybox]) {
      if (file) this.load.image(file, file)
    }
    for (const figure of figures) loadSheet(this, figure.sheet)
  }

  create() {
    const { under, hotspots, figures, skybox } = this.layout
    const ready = (key: string | undefined): key is string =>
      Boolean(key) && this.textures.exists(key!)
    for (const file of under.filter(ready)) this.add.image(0, 0, file).setOrigin(0)

    for (const hotspot of hotspots) {
      if (!ready(hotspot.spot.file)) continue
      const npc = hotspot.npc
      if (!npc) continue
      // The element layer already shows the building; its clip copy only appears while hovered
      // (drawn twice, the soft edges of the clip leave seams).
      const image = this.add
        .image(hotspot.spot.x, hotspot.spot.y, hotspot.spot.file)
        .setOrigin(0)
        .setAlpha(HIDDEN_ALPHA)
      this.interactive(image, hotspot.label, () => this.actions.onNpc(npc), true)
    }

    for (const figure of figures) {
      if (!ready(figure.sheet.file)) continue
      const origin = originOf(figure.sheet)
      const sprite = this.add
        .sprite(figure.x, figure.y, figure.sheet.file, 0)
        .setOrigin(origin.x, origin.y)
        .setScale(figure.scale)
        .setFlipX(figure.flip)
      this.animated.push({ sprite, durations: figure.sheet.durations })
      const npc = figure.npc
      this.interactive(sprite, figure.label, () => this.actions.onNpc(npc))
    }

    if (ready(skybox)) this.add.image(0, 0, skybox).setOrigin(0)
    this.drawTitles()
    this.drawPortraits()

    this.label = this.add
      .text(0, 0, '', { ...LABEL_STYLE, fontSize: `${LABEL_SIZE}px`, strokeThickness: 8 })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false)
  }

  /** Small building names floating over the village, like the original's signs. */
  private drawTitles() {
    for (const { spot, title } of this.layout.hotspots) {
      const text = this.add
        .text(0, spot.y + spot.height * TITLE_DROP, title, {
          ...LABEL_STYLE,
          fontStyle: 'bold italic',
          fontSize: `${TITLE_SIZE}px`,
          color: '#fff6dc',
          stroke: '#7a1f12',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
      const half = text.width / 2
      text.setX(Phaser.Math.Clamp(spot.x + spot.width / 2, half, this.layout.width - half))
    }
  }

  /** The area's monsters as portraits in a row at the top; a click starts the fight. */
  private drawPortraits() {
    const { size } = PORTRAIT_CELL
    for (const { monster, portrait, name: full, x, y } of this.layout.portraits) {
      const name = full.length > NAME_CHARS ? `${full.slice(0, NAME_CHARS - 1)}...` : full
      const g = this.add.graphics()
      g.fillStyle(0x1c0f07, 0.85).fillRoundedRect(x - size / 2, y - size / 2, size, size, 10)
      g.lineStyle(4, 0xd9a441).strokeRoundedRect(x - size / 2, y - size / 2, size, size, 10)
      g.fillStyle(0x1c0f07, 0.85).fillRoundedRect(x - size / 2, y + size / 2 + 6, size, 34, 8)
      g.lineStyle(3, 0xd9a441).strokeRoundedRect(x - size / 2, y + size / 2 + 6, size, 34, 8)
      if (this.textures.exists(portrait)) {
        const image = this.add.image(x, y - 6, portrait)
        image.setScale((size - 24) / Math.max(image.width, image.height))
        this.interactive(image, '', () => this.actions.onMonster(monster))
      }
      const small = { ...LABEL_STYLE, strokeThickness: 5 }
      this.add
        .text(x, y + size / 2 - 6, `Lv.${monster.level}`, {
          ...small,
          fontSize: '24px',
          color: '#ffd23c',
        })
        .setOrigin(0.5, 1)
      this.add.text(x, y + size / 2 + 23, name, { ...small, fontSize: '22px' }).setOrigin(0.5)
    }
  }

  override update(time: number) {
    const tick = time / SCENE_TICK_MS
    for (const { sprite, durations } of this.animated)
      sprite.setFrame(frameAt(durations, tick, true))
  }

  private interactive(
    object: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
    text: string,
    onClick: () => void,
    hidden = false,
  ) {
    object.setInteractive({ pixelPerfect: true, useHandCursor: true })
    object.on('pointerover', () => {
      if (hidden) object.setAlpha(1)
      setHighlight(object, true)
      if (!text) return
      const bounds = object.getBounds()
      const y = Math.max(LABEL_SIZE + 8, bounds.top + Math.min(40, bounds.height / 3))
      this.label.setText(text).setPosition(bounds.centerX, y).setVisible(true)
    })
    object.on('pointerout', () => {
      if (hidden) object.setAlpha(HIDDEN_ALPHA)
      setHighlight(object, false)
      this.label.setVisible(false)
    })
    object.on('pointerup', onClick)
  }
}

export interface PictureHandle {
  destroy: () => void
}

export function startScenePicture(
  parent: HTMLElement,
  layout: PictureLayout,
  actions: PictureActions,
): PictureHandle {
  const game = createGame(parent, layout.width, layout.height, new PictureScene(layout, actions))
  return { destroy: () => game.destroy(true) }
}
