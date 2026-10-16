// Phaser battle replay: samples a Timeline (./timeline.ts) at the playback clock. Everything on
// screen is a function of that clock, so skip, replay and speed changes need no extra state.
import Phaser from 'phaser'
import type { MotionSheet } from '../../generated/game-assets'
import type { WeaponLayer } from '../../generated/game-extra'
import type { VisualReplay as Replay, CompanionLook } from './companions'
import { BattleVisuals, DEPTH, type StatusHover } from './battle-visuals'
import { petAsset, visualLook } from './companions'
import { numberAssets } from './effects-map'
import {
  panelPetSkills,
  panelSkills,
  panelStats,
  PET_SKILL_SLOTS,
  SKILL_SLOTS,
  techniqueIcon,
} from './battle-hud'
import { numberGlyphs, glyphLayout } from './numbers'
import { createGame, LABEL_STYLE, loadSheet } from './game'
import { frameAt, originOf, sheetOf, sheetTicks, type FighterArt } from './motion'
import { overlayFrame, shiftAt } from './secret-technique'
import { effectFrameAt } from './skill-effects'
import {
  BATTLE_TICK_MS,
  FADE_MS,
  HOME,
  latestAt,
  poseScaleX,
  poseX,
  secretLayers,
  STAGE,
  type FloatText,
  type Pose,
  type TextKind,
  type Timeline,
} from './timeline'
import { weaponFrameAt, weaponSheetFor } from './weapon'

export interface BattleSetup {
  replay: Replay
  looks?: CompanionLook[]
  timeline: Timeline
  art: (FighterArt | undefined)[]
  /** Weapon layer drawn over each fighter's body (the player's equipped weapon; none for monsters). */
  weapons: (WeaponLayer | undefined)[]
  names: string[]
  background?: string
  /** Name shown with a buff id in the status line. */
  buffName: (buffId: number) => string | undefined
  onStatusHover?: (status: StatusHover) => void
  onPanelFighters?: (fighters: (number | undefined)[]) => void
  /** The art has loaded and the stage is drawn: the loading screen can lift. */
  onReady?: () => void
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
  heal: { color: '#5aff6e', size: 30 },
  shield: { color: '#9ad8ff', size: 24 },
  mp: { color: '#5ab4ff', size: 24 },
  buff: { color: '#7dff8a', size: 22 },
  buffEnd: { color: '#c8c8c8', size: 20 },
  skill: { color: '#fff3c4', size: 26 },
  info: { color: '#e8f4ff', size: 24 },
}
const HUD = { margin: 6, portrait: 72, vsGap: 24, hpY: 28, hpH: 14, mpY: 45, mpH: 7 }
/** Reborn's fight panel (fight__stat-row: 12 px #f5f5f5, Hp crimson, Chakra skyblue). */
const PANEL = { y: 145, width: 165, text: '#f5f5f5', red: '#dc143c', blue: '#87ceeb' }
const PANEL_ART = {
  background: '/assets/reborn/ui/combat/stats.webp',
  petFrame: '/assets/reborn/ui/combat/pet_icon.webp',
  lock: '/assets/reborn/ui/UIResource/SkillTree/Lock4.webp',
}
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
  private panelFighters = ''
  private clock = 0
  private speed = 1
  private finished = false
  private sprites: (Phaser.GameObjects.Sprite | undefined)[] = []
  private weaponSprites: (Phaser.GameObjects.Sprite | undefined)[] = []
  /** Secret-technique layers per fighter (main atlas and its concurrent layer). */
  private overlaySprites: Phaser.GameObjects.Sprite[][] = []
  /** Ninjutsu effect sprites by timeline.effects index, made when first shown. */
  private effectSprites = new Map<number, Phaser.GameObjects.Sprite>()
  private floating = new Map<number, Phaser.GameObjects.Text | Phaser.GameObjects.Container>()
  private visuals: BattleVisuals
  private slots: number[]
  /** Skill grid per fighter (its loadout; cast techniques for replays without a panel). */
  private skills: number[][]
  private hud!: Phaser.GameObjects.Graphics
  private hudText: Phaser.GameObjects.Text[] = []
  private portraits: Partial<Record<'attackers' | 'defenders', Phaser.GameObjects.Image>> = {}
  private banner!: Phaser.GameObjects.Text
  private panelIcons = new Map<string, Phaser.GameObjects.Image>()
  private panelBg: Partial<Record<'attackers' | 'defenders', Phaser.GameObjects.Image>> = {}

  constructor(private readonly setup: BattleSetup) {
    super('battle')
    this.visuals = new BattleVisuals(
      this,
      setup.replay,
      setup.timeline,
      setup.looks,
      setup.onStatusHover,
    )
    this.slots = textSlots(setup.timeline.texts)
    this.skills = setup.replay.fighters.map((_, i) => panelSkills(setup.replay, i))
  }

  preload() {
    this.visuals.preload()
    const { background, timeline, art, weapons } = this.setup
    if (background) this.load.image(background, background)
    for (const fighterArt of art) {
      const portrait = fighterArt?.set.portrait
      if (portrait && !this.textures.exists(portrait)) this.load.image(portrait, portrait)
    }
    for (const fighter of this.setup.replay.fighters) {
      const icon = petAsset(
        visualLook(fighter, this.setup.looks?.[fighter.index]).pet?.avatar,
      )?.icon
      if (icon && !this.textures.exists(icon)) this.load.image(icon, icon)
    }
    const images = [
      ...Object.values(PANEL_ART),
      ...this.skills.flat().map(techniqueIcon),
      ...this.setup.replay.fighters.flatMap((_, i) =>
        panelPetSkills(this.setup.replay, i).map(techniqueIcon),
      ),
    ]
    for (const image of new Set(images))
      if (!this.textures.exists(image)) this.load.image(image, image)
    timeline.poses.forEach((poses, i) => {
      const weapon = weapons[i]
      for (const pose of poses) {
        const sheet = sheetOf(art[i], pose.motion)
        if (sheet) loadSheet(this, sheet)
        const weaponSheet = weapon && weaponSheetFor(weapon, art[i], pose)
        if (weaponSheet) loadSheet(this, weaponSheet)
      }
    })
    // Only the ultimates this replay casts; a failed load leaves the normal motion.
    for (const layer of secretLayers(timeline)) {
      if (this.textures.exists(layer.texture)) continue
      const dir = layer.atlas.slice(0, layer.atlas.lastIndexOf('/') + 1)
      this.load.multiatlas(layer.texture, layer.atlas, dir)
    }
    // Ninjutsu effects keyed by their atlas URL; a failed load only leaves the effect out.
    for (const atlas of new Set((timeline.effects ?? []).map((e) => e.atlas))) {
      if (this.textures.exists(atlas)) continue
      this.load.multiatlas(atlas, atlas, atlas.slice(0, atlas.lastIndexOf('/') + 1))
    }
  }

  create() {
    const { background, replay } = this.setup
    this.setup.onReady?.()
    if (background && this.textures.exists(background)) {
      this.add
        .image(0, 0, background)
        .setOrigin(0)
        .setDisplaySize(STAGE.width, STAGE.height)
        .setDepth(DEPTH.background)
    } else {
      // Fallback stage: dusk sky over a dirt ground.
      const g = this.add.graphics().setDepth(DEPTH.background)
      g.fillStyle(0x6a8fb5).fillRect(0, 0, STAGE.width, STAGE.groundY - 40)
      g.fillStyle(0x8a6a3e).fillRect(0, STAGE.groundY - 40, STAGE.width, STAGE.height)
    }
    this.sprites = replay.fighters.map(() => this.add.sprite(0, 0, '__MISSING').setVisible(false))
    this.weaponSprites = replay.fighters.map((_, i) =>
      this.setup.weapons[i] ? this.add.sprite(0, 0, '__MISSING').setVisible(false) : undefined,
    )
    this.overlaySprites = replay.fighters.map((_, i) =>
      this.setup.timeline.poses[i]?.some((p) => p.secret)
        ? [0, 1].map(() => this.add.sprite(0, 0, '__MISSING').setOrigin(0).setVisible(false))
        : [],
    )
    this.hud = this.add.graphics().setDepth(DEPTH.ui + 100)
    for (const side of ['attackers', 'defenders'] as const) {
      if (!this.textures.exists(PANEL_ART.background)) break
      this.panelBg[side] = this.add
        .image(0, 0, PANEL_ART.background)
        .setOrigin(0)
        .setFlipX(side === 'defenders')
        .setDepth(DEPTH.ui + 99)
        .setVisible(false)
    }
    for (const side of ['attackers', 'defenders'] as const) {
      this.portraits[side] = this.add
        .image(0, 0, '__MISSING')
        .setDepth(DEPTH.ui + 101)
        .setVisible(false)
    }
    this.drawEmblem()
    this.banner = this.add
      .text(STAGE.width / 2, STAGE.height / 2 - 60, '', {
        ...LABEL_STYLE,
        fontSize: '72px',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 200)
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
    this.renderEffects(t)
    this.visuals.render(t)
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
      for (const overlay of this.overlaySprites[i] ?? []) overlay.setVisible(false)
      if (!sprite) return
      const pose = latestAt(timeline.poses[i] ?? [], t)
      if (pose?.secret && this.renderSecret(i, pose, t)) {
        sprite.setVisible(false)
        return
      }
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
      const shift = pose.shift && shiftAt(pose.shift, t)
      const tick = pose.freeze ? 0 : elapsed / BATTLE_TICK_MS
      sprite
        .setTexture(sheet.file, frameAt(sheet.durations, tick, pose.loop))
        .setOrigin(origin.x, origin.y)
        .setPosition(poseX(pose, t) + (shift?.dx ?? 0), STAGE.groundY + (shift?.dy ?? 0))
        .setRotation(shift?.rotation ?? 0)
        // Scale, not flipX: flipX mirrors around the frame centre and moves the feet.
        .setScale(poseScaleX(pose, replay.fighters[i]?.side ?? 'attackers'), 1)
        .setAlpha(alpha)
        .setDepth(pose.at)
        .setVisible(alpha > 0 && (shift?.visible ?? true))
      if (weapon) this.renderWeapon(weapon, i, pose, sheet, sprite)
    })
  }

  /** Ninjutsu effect sprites: top-left origin, mirrored for the attackers, over the bodies. */
  private renderEffects(t: number) {
    ;(this.setup.timeline.effects ?? []).forEach((effect, i) => {
      const index = effectFrameAt(effect, t - effect.at)
      const frame = index === undefined ? undefined : effect.frames[index]
      let sprite = this.effectSprites.get(i)
      if (
        frame === undefined ||
        !this.textures.exists(effect.atlas) ||
        !this.textures.get(effect.atlas).has(frame)
      ) {
        sprite?.setVisible(false)
        return
      }
      sprite ??= this.add.sprite(0, 0, effect.atlas, frame).setOrigin(0)
      this.effectSprites.set(i, sprite)
      sprite
        .setTexture(effect.atlas, frame)
        .setPosition(effect.x, effect.y)
        .setScale(effect.scaleX, 1)
        .setDepth(effect.behind ? DEPTH.overlayBack : DEPTH.overlay - 1)
        .setVisible(true)
    })
  }

  /**
   * Draws the ultimate art of fighter i's pose (the body hides). False when its atlas did not
   * load, so the body plays the normal motion instead.
   */
  private renderSecret(i: number, pose: Pose, t: number) {
    const layers = pose.secret?.layers ?? []
    if (!layers[0] || !this.textures.exists(layers[0].texture)) return false
    layers.forEach((layer, k) => {
      const sprite = this.overlaySprites[i]?.[k]
      const frame = overlayFrame(layer, t - pose.at)
      if (!sprite || frame === undefined || !this.textures.exists(layer.texture)) return
      if (!this.textures.get(layer.texture).has(frame)) return
      sprite
        .setTexture(layer.texture, frame)
        .setPosition(layer.x, layer.y)
        .setScale(layer.scaleX, 1)
        .setDepth(layer.front ? DEPTH.overlay + k : DEPTH.overlayBack)
        .setVisible(true)
    })
    return true
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
      .setRotation(sprite.rotation)
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
        const number = numberGlyphs(text.kind, text.text)
        const key = number && numberAssets[number.atlas].atlas
        if (
          number &&
          key &&
          this.textures.exists(key) &&
          number.glyphs.every((g) => this.textures.get(key).has(g))
        ) {
          const glyphs = number.glyphs.map((g) => this.add.image(0, 0, key, g).setOrigin(0, 1))
          const positions = glyphLayout(glyphs.map((g) => g.width))
          glyphs.forEach((g, k) => g.setX(positions[k]!))
          object = this.add.container(0, 0, glyphs).setDepth(DEPTH.ui)
          if (text.kind === 'crit') object.setScale(1.25)
        } else
          object = this.add
            .text(0, 0, text.text, {
              ...LABEL_STYLE,
              color: style.color,
              fontSize: `${style.size}px`,
              strokeThickness: 6,
            })
            .setOrigin(0.5, 1)
            .setDepth(DEPTH.ui)
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
    const { replay, timeline, art } = this.setup
    const fighters = [this.onStage('attackers', t), this.onStage('defenders', t)]
    const panelKey = fighters.join(':')
    if (panelKey !== this.panelFighters) {
      this.panelFighters = panelKey
      this.setup.onPanelFighters?.(fighters)
    }
    const g = this.hud
    g.clear()
    let line = 0
    for (const icon of this.panelIcons.values()) icon.setVisible(false)
    for (const bg of Object.values(this.panelBg)) bg.setVisible(false)
    for (const side of ['attackers', 'defenders'] as const) {
      const fighter = this.onStage(side, t)
      const left = side === 'attackers'
      const portraitX = left ? HUD.margin : STAGE.width - HUD.margin - HUD.portrait
      const portraitFrame = [
        new Phaser.Math.Vector2(portraitX + (left ? 0 : 10), HUD.hpY),
        new Phaser.Math.Vector2(portraitX + HUD.portrait - (left ? 10 : 0), HUD.hpY),
        new Phaser.Math.Vector2(portraitX + HUD.portrait, HUD.hpY + HUD.portrait - 6),
        new Phaser.Math.Vector2(portraitX, HUD.hpY + HUD.portrait - 6),
      ]
      g.fillStyle(0x050505, 0.98).fillPoints(portraitFrame, true)
      g.lineStyle(1, 0x45463b).strokePoints(portraitFrame, true)
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
          .setPosition(portraitX + HUD.portrait / 2, HUD.hpY + HUD.portrait / 2 - 3)
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
      const bevel = (x: number, y: number, width: number, height: number) => [
        new Phaser.Math.Vector2(x - 8, y),
        new Phaser.Math.Vector2(x + width + 8, y),
        new Phaser.Math.Vector2(x + width - 6, y + height),
        new Phaser.Math.Vector2(x + 6, y + height),
      ]
      const frame = bevel(barX, HUD.hpY - 2, barW, HUD.hpH + 4)
      g.fillStyle(0x121712, 0.95).fillPoints(frame, true)
      g.fillGradientStyle(
        left ? 0xffc022 : 0xc92b0b,
        left ? 0xc92b0b : 0xffc022,
        left ? 0xffa113 : 0xa62208,
        left ? 0xa62208 : 0xffa113,
      )
      if (hpW > 0) g.fillPoints(bevel(left ? barX : barX + barW - hpW, HUD.hpY, hpW, HUD.hpH), true)
      g.lineStyle(3, 0x5a655b).strokePoints(frame, true)
      if (f.maxMp) {
        const mpW = (barW - 16) * Math.min(1, Math.max(0, mp / f.maxMp))
        g.fillStyle(0x13140e, 0.95).fillPoints(
          bevel(barX + (left ? 16 : 0), HUD.mpY, barW - 16, HUD.mpH + 3),
          true,
        )
        if (mpW > 0)
          g.fillGradientStyle(0x126be8, 0x00d5f5, 0x126be8, 0x00b5e5).fillPoints(
            bevel(left ? barX + barW - mpW : barX, HUD.mpY, mpW, HUD.mpH),
            true,
          )
      }
      line = this.renderPanel(line, side, fighter, hp, mp)
    }
    this.hudLine(line++, STAGE.width / 2, STAGE.height - 28, `${(t / 1000).toFixed(1)}s`, 16, 0.5)
    for (let i = line; i < this.hudText.length; i++) this.hudText[i]!.setVisible(false)
  }

  /**
   * Reborn's fight panel (165 x 413 at y 145, mirrored on the right): name and level, the Hp /
   * Chakra / Shield rows, the stat rows, the pet with its skill grid and the 5 x 3 skill grid.
   * Empty slots show the padlock. Returns the next free text line.
   */
  private renderPanel(
    line: number,
    side: 'attackers' | 'defenders',
    fighter: number,
    hp: number,
    mp: number,
  ) {
    const { replay, names } = this.setup
    const f = replay.fighters[fighter]!
    const left = side === 'attackers'
    const panelX = left ? 0 : STAGE.width - PANEL.width
    this.panelBg[side]?.setPosition(panelX, PANEL.y).setVisible(true)
    // Header, pet and skills sit 5 px in (10 on the right); the stat rows fill the 160 px row width.
    const x = panelX + (left ? 5 : 10)
    const stat = left ? 0 : -7
    const text = (y: number, value: string, align: number, dx: number, color?: string) =>
      this.hudLine(line++, x + dx, PANEL.y + y, value, 12, align, color ?? PANEL.text, 80)
    text(15, names[fighter]!, 0, 0)
    text(15, `LV: ${f.level}`, 0, 80)
    // A single row: label right-aligned in 50 px, value centred in the next 110 px.
    const single = (y: number, label: string, value: string, color?: string) => {
      text(y, label, 1, stat + 50, color)
      text(y, value, 0.5, stat + 105, color)
    }
    single(55, 'Hp:', `${hp} / ${f.maxHp}`, PANEL.red)
    single(71, 'Chakra:', `${mp} / ${f.maxMp ?? 0}`, PANEL.blue)
    single(87, 'Shield:', '0')
    panelStats(f).forEach((row, r) => {
      const y = 105 + r * 16
      if (row.length === 1) return single(y, row[0]![0], row[0]![1])
      // Two columns of 80 px: label right-aligned in 50 px, value centred in 30 px.
      row.forEach(([label, value], c) => {
        text(y, label, 1, stat + c * 80 + 50)
        text(y, value, 0.5, stat + c * 80 + 65)
      })
    })
    const petY = PANEL.y + 244
    this.panelIcon(`petframe:${side}`, PANEL_ART.petFrame, x + 27, petY + 27, 54)
    const pet = petAsset(visualLook(f, this.setup.looks?.[fighter]).pet?.avatar)
    if (pet?.icon) this.panelIcon(`pet:${side}`, pet.icon, x + 27, petY + 27, 48)
    const slot = (id: string, skill: number | undefined, sx: number, sy: number) => {
      this.panelIcon(`lock:${id}`, PANEL_ART.lock, sx + 12.5, sy + 12.5, 27)
      if (skill) this.panelIcon(`skill:${id}`, techniqueIcon(skill), sx + 13.5, sy + 13.5, 26)
    }
    const petSkills = panelPetSkills(replay, fighter)
    for (let i = 0; i < PET_SKILL_SLOTS; i++)
      slot(
        `pet:${side}:${i}`,
        petSkills[i],
        x + 66 + (i % 3) * 30,
        petY - 16 + Math.floor(i / 3) * 30,
      )
    const skills = this.skills[fighter] ?? []
    for (let i = 0; i < SKILL_SLOTS; i++)
      slot(`${side}:${i}`, skills[i], x + (i % 5) * 30, PANEL.y + 315 + Math.floor(i / 5) * 30)
    return line
  }

  private hudLine(
    i: number,
    x: number,
    y: number,
    text: string,
    size: number,
    align: number,
    color = '#e1e4d8',
    wrap = 142,
  ) {
    this.hudText[i] ??= this.add
      .text(0, 0, '', {
        ...LABEL_STYLE,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'normal',
        strokeThickness: 1,
      })
      .setDepth(DEPTH.ui + 101)
    this.hudText[i]!.setText(text)
      .setFontSize(size)
      .setColor(color)
      .setWordWrapWidth(wrap)
      .setOrigin(align, 0)
      .setPosition(x, y)
      .setVisible(true)
  }

  private panelIcon(id: string, key: string, x: number, y: number, size: number) {
    if (!this.textures.exists(key)) return
    let icon = this.panelIcons.get(id)
    if (!icon) {
      icon = this.add.image(x, y, key).setDepth(DEPTH.ui + 101)
      this.panelIcons.set(id, icon)
    }
    icon
      .setTexture(key)
      .setPosition(x, y)
      .setScale(Math.min(1, size / Math.max(icon.width, icon.height)))
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
      .setDepth(DEPTH.ui + 102)
      .fillStyle(0x7a1f12)
      .fillPoints(diamond, true)
      .lineStyle(3, 0xffd23c)
      .strokePoints(diamond, true)
    this.add
      .text(x, y, 'VS', {
        ...LABEL_STYLE,
        fontStyle: 'bold italic',
        fontSize: '38px',
        color: '#ffd23c',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 103)
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
