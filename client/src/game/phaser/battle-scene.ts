// Phaser battle replay: samples a Timeline (./timeline.ts) at the playback clock. Everything on
// screen is a function of that clock, so skip, replay and speed changes need no extra state.
import Phaser from 'phaser'
import type { MotionSheet } from '../../generated/game-assets'
import type { WeaponLayer } from '../../generated/game-extra'
import type { Replay } from '../types'
import { createGame, LABEL_STYLE, loadSheet } from './game'
import { frameAt, originOf, sheetOf, sheetTicks, type FighterArt } from './motion'
import {
  BATTLE_TICK_MS,
  FADE_MS,
  HOME,
  latestAt,
  poseX,
  STAGE,
  type FloatText,
  type Pose,
  type TextKind,
  type Timeline,
} from './timeline'
import { weaponFrameAt, weaponSheetFor } from './weapon'

export interface BattleSetup {
  replay: Replay
  timeline: Timeline
  art: (FighterArt | undefined)[]
  /** Weapon layer drawn over each fighter's body (the player's equipped weapon; none for monsters). */
  weapons: (WeaponLayer | undefined)[]
  names: string[]
  background?: string
  /** Name shown with a buff id in the status line. */
  buffName: (buffId: number) => string | undefined
  onFinished: () => void
}

export interface BattleHandle {
  skip: () => void
  replay: () => void
  setSpeed: (speed: number) => void
  destroy: () => void
}

const TEXT_LIFE_MS = 1100
const TEXT_RISE = 60
const TEXT_SLOT = 30
const HEAD_Y = STAGE.groundY - 130
const TEXT_STYLE: Record<TextKind, { color: string; size: number }> = {
  damage: { color: '#ff5a3c', size: 30 },
  crit: { color: '#ffd23c', size: 38 },
  miss: { color: '#e8f4ff', size: 26 },
  mp: { color: '#5ab4ff', size: 24 },
  buff: { color: '#7dff8a', size: 22 },
  buffEnd: { color: '#c8c8c8', size: 20 },
  skill: { color: '#fff3c4', size: 26 },
  info: { color: '#e8f4ff', size: 24 },
}
const HUD = { margin: 12, portrait: 84, vsGap: 30, hpY: 22, hpH: 24, mpY: 52, mpH: 9 }
/** Puts the weapon right above its body (body depths are pose start times in ms). */
const WEAPON_ABOVE_BODY = 0.01

/** Stacks texts that appear close together over the same fighter. */
function textSlots(texts: FloatText[]) {
  return texts.map(
    (text, i) =>
      texts
        .slice(0, i)
        .filter((o) => o.fighter === text.fighter && text.at - o.at < TEXT_LIFE_MS / 2).length,
  )
}

class BattleScene extends Phaser.Scene {
  private clock = 0
  private speed = 1
  private finished = false
  private sprites: (Phaser.GameObjects.Sprite | undefined)[] = []
  private weaponSprites: (Phaser.GameObjects.Sprite | undefined)[] = []
  private floating = new Map<number, Phaser.GameObjects.Text>()
  private slots: number[]
  private hud!: Phaser.GameObjects.Graphics
  private hudText: Phaser.GameObjects.Text[] = []
  private portraits: Partial<Record<'attackers' | 'defenders', Phaser.GameObjects.Image>> = {}
  private banner!: Phaser.GameObjects.Text

  constructor(private readonly setup: BattleSetup) {
    super('battle')
    this.slots = textSlots(setup.timeline.texts)
  }

  preload() {
    const { background, timeline, art, weapons } = this.setup
    if (background) this.load.image(background, background)
    for (const fighterArt of art) {
      const portrait = fighterArt?.set.portrait
      if (portrait && !this.textures.exists(portrait)) this.load.image(portrait, portrait)
    }
    timeline.poses.forEach((poses, i) => {
      const weapon = weapons[i]
      for (const pose of poses) {
        const sheet = sheetOf(art[i], pose.motion)
        if (sheet) loadSheet(this, sheet)
        const weaponSheet = weapon && weaponSheetFor(weapon, art[i], pose)
        if (weaponSheet) loadSheet(this, weaponSheet)
      }
    })
  }

  create() {
    const { background, replay } = this.setup
    if (background && this.textures.exists(background)) {
      this.add.image(0, 0, background).setOrigin(0).setDisplaySize(STAGE.width, STAGE.height)
    } else {
      // Fallback stage: dusk sky over a dirt ground.
      const g = this.add.graphics()
      g.fillStyle(0x6a8fb5).fillRect(0, 0, STAGE.width, STAGE.groundY - 40)
      g.fillStyle(0x8a6a3e).fillRect(0, STAGE.groundY - 40, STAGE.width, STAGE.height)
    }
    this.sprites = replay.fighters.map(() => this.add.sprite(0, 0, '__MISSING').setVisible(false))
    this.weaponSprites = replay.fighters.map((_, i) =>
      this.setup.weapons[i] ? this.add.sprite(0, 0, '__MISSING').setVisible(false) : undefined,
    )
    this.hud = this.add.graphics().setDepth(900)
    for (const side of ['attackers', 'defenders'] as const) {
      this.portraits[side] = this.add.image(0, 0, '__MISSING').setDepth(901).setVisible(false)
    }
    this.drawEmblem()
    this.banner = this.add
      .text(STAGE.width / 2, STAGE.height / 2 - 60, '', {
        ...LABEL_STYLE,
        fontSize: '72px',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setVisible(false)
    this.render()
  }

  override update(_time: number, delta: number) {
    if (this.finished) return
    this.clock = Math.min(this.setup.timeline.duration, this.clock + delta * this.speed)
    this.render()
    if (this.clock >= this.setup.timeline.duration) this.finish()
  }

  skipToEnd() {
    this.clock = this.setup.timeline.duration
    this.render()
    this.finish()
  }

  restart() {
    this.clock = 0
    this.finished = false
    this.render()
  }

  setSpeed(speed: number) {
    this.speed = speed
  }

  private finish() {
    if (this.finished) return
    this.finished = true
    this.setup.onFinished()
  }

  private render() {
    if (!this.banner) return // not created yet; create() renders the current clock
    const t = this.clock
    this.renderFighters(t)
    this.renderTexts(t)
    this.renderHud(t)
    const { replay, timeline } = this.setup
    this.banner
      .setText(replay.winner === 'attackers' ? 'Victory' : 'Defeat')
      .setVisible(t >= timeline.endAt)
  }

  private renderFighters(t: number) {
    const { timeline, art, replay } = this.setup
    this.sprites.forEach((sprite, i) => {
      const weapon = this.weaponSprites[i]
      weapon?.setVisible(false)
      if (!sprite) return
      const pose = latestAt(timeline.poses[i] ?? [], t)
      const sheet = pose && sheetOf(art[i], pose.motion)
      if (!pose || !sheet || !this.textures.exists(sheet.file)) {
        sprite.setVisible(false)
        return
      }
      const elapsed = t - pose.at
      const origin = originOf(sheet)
      const motionMs = sheetTicks(sheet) * BATTLE_TICK_MS
      let alpha = 1
      if (pose.fade === 'in') alpha = Math.min(1, elapsed / FADE_MS)
      if (pose.fade === 'out') alpha = 1 - Math.min(1, Math.max(0, elapsed - motionMs) / FADE_MS)
      sprite
        .setTexture(sheet.file, frameAt(sheet.durations, elapsed / BATTLE_TICK_MS, pose.loop))
        .setOrigin(origin.x, origin.y)
        .setPosition(poseX(pose, t), STAGE.groundY)
        .setFlipX(replay.fighters[i]?.side === 'defenders')
        .setAlpha(alpha)
        .setDepth(pose.at)
        .setVisible(alpha > 0)
      if (weapon) this.renderWeapon(weapon, i, pose, sheet, sprite)
    })
  }

  /** The weapon over its body: same spot, scale, flip and fade, its own sheet, anchor and cells. */
  private renderWeapon(
    weapon: Phaser.GameObjects.Sprite,
    i: number,
    pose: Pose,
    body: MotionSheet,
    sprite: Phaser.GameObjects.Sprite,
  ) {
    const layer = this.setup.weapons[i]
    const sheet = layer && weaponSheetFor(layer, this.setup.art[i], pose)
    if (!sheet || !this.textures.exists(sheet.file)) return
    const origin = originOf(sheet)
    const tick = (this.clock - pose.at) / BATTLE_TICK_MS
    weapon
      .setTexture(sheet.file, weaponFrameAt(body.durations, sheet.durations, tick, pose.loop))
      .setOrigin(origin.x, origin.y)
      .setPosition(sprite.x, sprite.y)
      .setScale(sprite.scaleX, sprite.scaleY)
      .setFlipX(sprite.flipX)
      .setAlpha(sprite.alpha)
      .setDepth(sprite.depth + WEAPON_ABOVE_BODY)
      .setVisible(sprite.visible)
  }

  private renderTexts(t: number) {
    const { texts, poses } = this.setup.timeline
    texts.forEach((text, i) => {
      const age = t - text.at
      let object = this.floating.get(i)
      if (age < 0 || age >= TEXT_LIFE_MS) {
        object?.destroy()
        this.floating.delete(i)
        return
      }
      if (!object) {
        const style = TEXT_STYLE[text.kind]
        object = this.add
          .text(0, 0, text.text, {
            ...LABEL_STYLE,
            color: style.color,
            fontSize: `${style.size}px`,
            strokeThickness: 6,
          })
          .setOrigin(0.5, 1)
          .setDepth(800)
        this.floating.set(i, object)
      }
      const pose = latestAt(poses[text.fighter] ?? [], t)
      const side = this.setup.replay.fighters[text.fighter]?.side ?? 'attackers'
      const x = pose ? poseX(pose, t) : HOME[side]
      const k = age / TEXT_LIFE_MS
      object
        .setPosition(x, HEAD_Y - this.slots[i]! * TEXT_SLOT - k * TEXT_RISE)
        .setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4)
    })
  }

  /** Portraits in the top corners, long HP bars meeting at the VS emblem, MP bars below. */
  private renderHud(t: number) {
    const { replay, timeline, names, buffName, art } = this.setup
    const g = this.hud
    g.clear()
    let line = 0
    for (const side of ['attackers', 'defenders'] as const) {
      const fighter = this.onStage(side, t)
      const left = side === 'attackers'
      const portraitX = left ? HUD.margin : STAGE.width - HUD.margin - HUD.portrait
      g.fillStyle(0x1c0f07, 0.85).fillRoundedRect(
        portraitX,
        HUD.margin,
        HUD.portrait,
        HUD.portrait,
        8,
      )
      g.lineStyle(3, 0xd9a441).strokeRoundedRect(
        portraitX,
        HUD.margin,
        HUD.portrait,
        HUD.portrait,
        8,
      )
      const portrait = this.portraits[side]
      if (fighter === undefined) {
        portrait?.setVisible(false)
        continue
      }
      const key = art[fighter]?.set.portrait
      if (portrait && key && this.textures.exists(key)) {
        portrait
          .setTexture(key)
          .setScale((HUD.portrait - 8) / Math.max(portrait.width, portrait.height))
          .setPosition(portraitX + HUD.portrait / 2, HUD.margin + HUD.portrait / 2)
          .setVisible(true)
      } else portrait?.setVisible(false)

      const f = replay.fighters[fighter]!
      const state = latestAt(
        timeline.bars.filter((b) => b.fighter === fighter),
        t,
      )
      const hp = state?.hp ?? f.startHp
      const mp = state?.mp ?? f.startMp ?? 0
      const barW = STAGE.width / 2 - HUD.vsGap - HUD.margin * 2 - HUD.portrait
      const barX = left ? HUD.margin * 2 + HUD.portrait : STAGE.width / 2 + HUD.vsGap
      // Remaining HP stays on the portrait side; the loss shows next to the emblem.
      const fill = (ratio: number) => barW * Math.min(1, Math.max(0, ratio))
      const hpW = fill(hp / Math.max(1, f.maxHp))
      g.fillStyle(0x2a0e08, 0.9).fillRect(barX, HUD.hpY, barW, HUD.hpH)
      g.fillGradientStyle(0xffb21c, 0xffb21c, 0xd8401a, 0xd8401a)
      g.fillRect(left ? barX : barX + barW - hpW, HUD.hpY, hpW, HUD.hpH)
      g.lineStyle(2, 0x1c0f07).strokeRect(barX, HUD.hpY, barW, HUD.hpH)
      if (f.maxMp) {
        const mpW = fill(mp / f.maxMp)
        g.fillStyle(0x0e1a2a, 0.9).fillRect(barX, HUD.mpY, barW, HUD.mpH)
        g.fillStyle(0x3a9ae8).fillRect(left ? barX : barX + barW - mpW, HUD.mpY, mpW, HUD.mpH)
      }
      const edge = left ? barX + 4 : barX + barW - 4
      const align = left ? 0 : 1
      this.hudLine(line++, edge, HUD.hpY + 1, `HP ${hp}/${f.maxHp}`, 15, align)
      const buffs = (state?.buffs ?? []).map((id) => buffName(id)).filter(Boolean)
      const status = `${names[fighter]}  Lv. ${f.level}${buffs.length ? `   ${buffs.join(', ')}` : ''}`
      this.hudLine(line++, edge, HUD.mpY + HUD.mpH + 4, status, 17, align)
    }
    for (let i = line; i < this.hudText.length; i++) this.hudText[i]!.setVisible(false)
  }

  private hudLine(i: number, x: number, y: number, text: string, size: number, align: number) {
    this.hudText[i] ??= this.add
      .text(0, 0, '', { ...LABEL_STYLE, strokeThickness: 4 })
      .setDepth(901)
    this.hudText[i]!.setText(text)
      .setFontSize(size)
      .setOrigin(align, 0)
      .setPosition(x, y)
      .setVisible(true)
  }

  /** The diamond "VS" emblem between the HP bars. */
  private drawEmblem() {
    const x = STAGE.width / 2
    const y = HUD.hpY + HUD.hpH / 2
    const r = HUD.vsGap + 4
    const diamond = [
      new Phaser.Math.Vector2(x, y - r),
      new Phaser.Math.Vector2(x + r, y),
      new Phaser.Math.Vector2(x, y + r),
      new Phaser.Math.Vector2(x - r, y),
    ]
    this.add
      .graphics()
      .setDepth(902)
      .fillStyle(0x7a1f12)
      .fillPoints(diamond, true)
      .lineStyle(3, 0xffd23c)
      .strokePoints(diamond, true)
    this.add
      .text(x, y, 'VS', {
        ...LABEL_STYLE,
        fontStyle: 'bold italic',
        fontSize: '30px',
        color: '#ffd23c',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(903)
  }

  /** The side's fighter whose first appearance is the latest one before t. */
  private onStage(side: 'attackers' | 'defenders', t: number) {
    let found: number | undefined
    let since = -Infinity
    this.setup.replay.fighters.forEach((f, i) => {
      const first = this.setup.timeline.poses[i]?.[0]
      if (f.side === side && first && first.at <= t && first.at >= since) {
        found = i
        since = first.at
      }
    })
    return found
  }
}

export function startBattle(parent: HTMLElement, setup: BattleSetup): BattleHandle {
  const scene = new BattleScene(setup)
  const game = createGame(parent, STAGE.width, STAGE.height, scene)
  return {
    skip: () => scene.skipToEnd(),
    replay: () => scene.restart(),
    setSpeed: (speed) => scene.setSpeed(speed),
    destroy: () => game.destroy(true),
  }
}
