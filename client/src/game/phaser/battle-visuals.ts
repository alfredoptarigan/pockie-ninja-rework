import type Phaser from 'phaser'
import {
  auraAsset,
  artSign,
  layerPosition,
  petAsset,
  petX,
  PET_DY,
  PET_FRAME_MS,
  visualLook,
  wingAsset,
  type AtlasAsset,
  type CompanionLook,
  type VisualReplay,
} from './companions'
import { effectAsset, numberAssets, statusAsset } from './effects-map'
import { numberGlyphs } from './numbers'
import { HOME, latestAt, poseX, STAGE, type Timeline } from './timeline'

/**
 * Ultimate art, global and pet effects go over every body, their back layers behind them; texts
 * and HUD stay on top. Body depths are pose start times in ms.
 */
export const DEPTH = { background: -2, overlayBack: -1, overlay: 1e6, ui: 2e6 }

export function loadAtlas(scene: Phaser.Scene, asset: AtlasAsset | undefined) {
  if (!asset?.atlas || scene.textures.exists(asset.atlas)) return
  scene.load.multiatlas(
    asset.atlas,
    asset.atlas,
    asset.atlas.slice(0, asset.atlas.lastIndexOf('/') + 1),
  )
}
/** A small reusable sprite pool, sampled by replay clock (including rewind). */
export class BattleVisuals {
  private frameCache = new Map<string, string[]>()
  private loaded = new Set<string>()
  private sprites = new Map<string, Phaser.GameObjects.Sprite>()
  constructor(
    private scene: Phaser.Scene,
    private replay: VisualReplay,
    private timeline: Timeline,
    private looks: CompanionLook[] = [],
  ) {}
  preload() {
    const scene = this.scene
    const load = (asset: AtlasAsset | undefined) => {
      if (!asset?.atlas || this.loaded.has(asset.atlas)) return
      this.loaded.add(asset.atlas)
      loadAtlas(scene, asset)
    }
    this.replay.fighters.forEach((f, i) => {
      const look = visualLook(f, this.looks[i])
      const pet = petAsset(look.pet?.avatar)
      load(pet)
      // Pets without exported motions only have their item icon.
      if (!pet?.atlas && pet?.icon && !scene.textures.exists(pet.icon))
        scene.load.image(pet.icon, pet.icon)
      load(wingAsset(look.wingSprite))
      const aura = auraAsset(look.aura)
      load(aura)
      if (aura?.atlas) scene.load.json(`meta:${aura.atlas}`, aura.atlas)
    })
    for (const bar of this.timeline.bars) for (const buff of bar.buffs) load(effectAsset(buff))
    for (const text of this.timeline.texts) {
      const number = numberGlyphs(text.kind, text.text)
      if (number) load(numberAssets[number.atlas])
    }
    if (this.timeline.bars.some((b) => b.buffs.length)) load(statusAsset)
  }
  private sprite(id: string, key: string) {
    let sprite = this.sprites.get(id)
    if (!sprite) {
      sprite = this.scene.add.sprite(0, 0, key)
      this.sprites.set(id, sprite)
    }
    return sprite
  }
  private draw(
    id: string,
    asset: AtlasAsset | undefined,
    prefix: string,
    elapsed: number,
    x: number,
    y: number,
    sign: number,
    depth: number,
    offset: [number, number] = [0, 0],
    fps = 1000 / PET_FRAME_MS,
    loop = true,
    anchor?: { x: number; y: number },
  ) {
    const key = asset?.atlas
    if (!key || !this.scene.textures.exists(key)) return
    const texture = this.scene.textures.get(key)
    const cacheKey = `${key}:${prefix}`
    const frames =
      this.frameCache.get(cacheKey) ??
      texture
        .getFrameNames()
        .filter((f) => f.startsWith(prefix))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    this.frameCache.set(cacheKey, frames)
    const tick = Math.floor((Math.max(0, elapsed) * fps) / 1000 + 1e-9)
    const frame = frames[loop ? tick % frames.length : tick]
    if (!frame) return
    const sprite = this.sprite(id, key)
    sprite
      .setTexture(key, frame)
      .setOrigin(
        anchor ? anchor.x / sprite.frame.realWidth : 0,
        anchor ? anchor.y / sprite.frame.realHeight : 0,
      )
      .setPosition(x + offset[0] * sign, y + offset[1])
      .setScale(sign, 1)
      .setDepth(depth)
      .setVisible(true)
  }
  render(t: number) {
    for (const sprite of this.sprites.values()) sprite.setVisible(false)
    this.replay.fighters.forEach((fighter, i) => {
      const pose = latestAt(this.timeline.poses[i] ?? [], t)
      if (!pose || pose.secret) return
      const bar = latestAt(
        this.timeline.bars.filter((b) => b.fighter === i),
        t,
      )
      if ((bar?.hp ?? fighter.startHp) <= 0) return
      const look = visualLook(fighter, this.looks[i])
      const x = poseX(pose, t),
        y = STAGE.groundY,
        sign = artSign(fighter.side)
      const pet = petAsset(look.pet?.avatar)
      const action = latestAt(
        (this.timeline.pets ?? []).filter((p) => p.fighter === i),
        t,
      )
      const attacking = action && t < action.end
      const motion = attacking ? action.motion : '999'
      if (!pet?.atlas && pet?.icon && this.scene.textures.exists(pet.icon))
        this.sprite(`pet:${i}`, pet.icon)
          .setTexture(pet.icon)
          .setOrigin(0.5, 1)
          .setPosition(petX(HOME[fighter.side], fighter.side), y + PET_DY)
          .setScale(sign, 1)
          .setDepth(pose.at - 0.3)
          .setVisible(true)
      this.draw(
        `pet:${i}`,
        pet,
        `${motion}/`,
        attacking ? t - action.at : t,
        petX(HOME[fighter.side], fighter.side),
        y + PET_DY,
        sign,
        pose.at - 0.3,
        pet?.animations?.[motion],
      )
      const wing = wingAsset(look.wingSprite)
      const wingMotion = wing?.animations?.[pose.motion] ? pose.motion : '999'
      const mount = layerPosition(x, y, fighter.side, wing?.offset)
      this.draw(
        `wing:${i}`,
        wing,
        `${wingMotion}/`,
        t - pose.at,
        mount.x,
        mount.y,
        sign,
        pose.at - 0.1,
        wing?.animations?.[wingMotion],
      )
      const aura = auraAsset(look.aura)
      if (aura?.atlas) {
        const meta = this.scene.cache.json.get(`meta:${aura.atlas}`)?.meta
        for (const [k, layer] of (meta?.layers ?? []).entries()) {
          this.draw(
            `aura:${i}:${k}`,
            aura,
            `${layer.name}/idle/`,
            t,
            x,
            y,
            sign,
            pose.at - 0.2 + k * 0.001,
            [0, 0],
            meta.fps,
            true,
            meta.anchor,
          )
        }
      }
      const changes = this.timeline.bars.filter((b) => b.fighter === i && b.at <= t)
      const transitions = new Map<number, { at: number; removed: boolean }>()
      let previous: number[] = []
      for (const state of changes) {
        for (const buff of state.buffs)
          if (!previous.includes(buff)) transitions.set(buff, { at: state.at, removed: false })
        for (const buff of previous)
          if (!state.buffs.includes(buff)) transitions.set(buff, { at: state.at, removed: true })
        previous = state.buffs
      }
      for (const [buff, transition] of transitions) {
        const effect = effectAsset(buff)
        this.draw(
          `effect:${i}:${buff}`,
          effect,
          '',
          t - transition.at,
          effect?.global
            ? STAGE.width / 2
            : effect?.onPet
              ? petX(HOME[fighter.side], fighter.side)
              : x,
          effect?.global ? STAGE.height / 2 : effect?.onPet ? y + PET_DY : y,
          sign,
          effect?.global || effect?.onPet
            ? effect.depth === 'behind'
              ? DEPTH.overlayBack
              : DEPTH.overlay
            : pose.at + (effect?.depth === 'behind' ? -0.4 : 0.2),
          effect?.offset,
          1000 / PET_FRAME_MS,
          !transition.removed,
        )
      }
      ;(bar?.buffs ?? []).forEach((buff, k) => {
        const key = statusAsset.atlas
        if (!this.scene.textures.exists(key) || !this.scene.textures.get(key).has(String(buff)))
          return
        this.sprite(`status:${i}:${k}`, key)
          .setTexture(key, String(buff))
          .setOrigin(0)
          .setPosition(HOME[fighter.side] + (k - 2) * 22, 91)
          .setDepth(DEPTH.ui + 102)
          .setVisible(true)
      })
    })
  }
}
