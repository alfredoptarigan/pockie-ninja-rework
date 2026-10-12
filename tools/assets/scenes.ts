// Scene pictures: each village/field scene is drawn from layers (GameScene.as): background,
// background effect, element (buildings and other clickable clips), characters, sky. FFDec exports
// the first frame of each layer as SVG, which sharp renders to WebP. Buildings are buttons whose
// up state also carries an Indonesian name label; labels are removed so the client can draw English
// names, and every named clip is also written on its own (with its position) for hover and clicks.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { cached } from './cache.ts'
import { ffdec } from './ffdec.ts'
import { assetUrl, paths } from './paths.ts'
import { opaqueBounds } from './sheet.ts'
import { FIELD_SCENES, VILLAGE_SCENES } from './sources.ts'

const LAYERS = ['background', 'backgroundeffect', 'element', 'skybox'] as const
type Layer = (typeof LAYERS)[number]
const BACKGROUND_WEBP = { quality: 80 } as const
const OVERLAY_WEBP = { quality: 82, alphaQuality: 90, effort: 6 } as const

export interface Hotspot {
  file: string
  x: number
  y: number
  width: number
  height: number
}

export interface Scene {
  width: number
  height: number
  layers: Partial<Record<Layer, string>>
  /** Named clips of the element layer (buildings, explore spots), by clip name. */
  hotspots: Record<string, Hotspot>
  fightBackground?: string
}

/** Newest version of `<prefix>(.s<version>).swf` in `dir`. */
function newestSwf(dir: string, prefix: string) {
  return readdirSync(dir)
    .map((file) => ({ file, match: new RegExp(`^${prefix}(?:\\.s(\\d+))?\\.swf$`).exec(file) }))
    .filter((entry) => entry.match)
    .sort((a, b) => Number(b.match![1] ?? 0) - Number(a.match![1] ?? 0))
    .map((entry) => join(dir, entry.file))[0]
}

function sceneSources(sceneId: number) {
  const dir = join(
    paths.movieclips,
    'scene',
    VILLAGE_SCENES.includes(sceneId) ? 'maincity' : 'outcity',
  )
  const sources: Record<string, string> = {}
  for (const layer of LAYERS) {
    const file = newestSwf(dir, `${layer}_${sceneId}`)
    if (file) sources[layer] = file
  }
  const fight = newestSwf(join(paths.movieclips, 'ui/fightbg'), `fightbg_${sceneId}`)
  if (fight) sources.fight = fight
  return sources
}

/** Removes the stage colour, button label art and non-up button states from an FFDec frame SVG. */
export function cleanSvg(svg: string) {
  return (
    svg
      .replace(/^ {4}<rect fill="#[0-9a-f]{6}" height="[\d.]+px" width="[\d.]+px"\/>\n/m, '')
      .replace(/<style><!\[CDATA\[[\s\S]*?\]\]><\/style>/g, '')
      .replace(
        /\n( +)<g class="button-frame button-frame-(?:over|down|hittest)"[\s\S]*?\n\1<\/g>/g,
        '',
      )
      // In the up state the building is the biggest piece; the rest is its name label.
      .replace(
        /(<g class="button-frame button-frame-up"[^>]*>\n)([\s\S]*?)(\n *<\/g>)/g,
        (_match, open: string, body: string, close: string) => {
          const uses = body.split('\n')
          const area = (line: string) =>
            Number(/ width="([\d.]+)"/.exec(line)?.[1] ?? 0) *
            Number(/ height="([\d.]+)"/.exec(line)?.[1] ?? 0)
          const biggest = uses.reduce((best, line) => (area(line) > area(best) ? line : best))
          return `${open}${biggest}${close}`
        },
      )
  )
}

async function render(svg: string) {
  const { data, info } = await sharp(Buffer.from(svg), { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

function toWebp(raw: { data: Buffer; width: number; height: number }) {
  return sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } })
}

/** Writes each named top-level clip of the element layer on its own, cropped, with its position. */
async function writeHotspots(svg: string, outDir: string) {
  const lines = svg.split('\n')
  const placed = lines
    .map((line, index) => ({ index, name: /^ {4}<use [^>]*\bid="([^"]+)"/.exec(line)?.[1] }))
    .filter((entry): entry is { index: number; name: string } => Boolean(entry.name))
  const hotspots: Record<string, Hotspot> = {}
  for (const { index, name } of placed) {
    const alone = lines.filter((line, i) => i === index || !/^ {4}<use /.test(line)).join('\n')
    const raw = await render(alone)
    const box = opaqueBounds([raw])
    if (!box) continue
    const relative = `${outDir}/clip-${name}.webp`
    await toWebp(raw).extract(box).webp(OVERLAY_WEBP).toFile(join(paths.assets, relative))
    hotspots[name] = {
      file: assetUrl(relative),
      x: box.left,
      y: box.top,
      width: box.width,
      height: box.height,
    }
  }
  return hotspots
}

async function exportScene(sceneId: number, sources: Record<string, string>): Promise<Scene> {
  const hash = createHash('sha1')
  for (const file of Object.values(sources).sort()) hash.update(file).update(readFileSync(file))
  const outDir = `game/scenes/${sceneId}`
  return cached(`scene:${sceneId}`, hash.digest('hex'), [join(paths.assets, outDir)], async () => {
    const work = mkdtempSync(join(paths.cache, 'scene-'))
    try {
      const input = join(work, 'in')
      mkdirSync(input)
      for (const [layer, file] of Object.entries(sources))
        symlinkSync(file, join(input, `${layer}.swf`))
      await ffdec([
        '-select',
        '1',
        '-format',
        'frame:svg',
        '-export',
        'frame',
        join(work, 'svg'),
        input,
      ])
      const svgOf = (layer: string) =>
        cleanSvg(readFileSync(join(work, 'svg', `${layer}.swf`, '1.svg'), 'utf8'))

      rmSync(join(paths.assets, outDir), { recursive: true, force: true })
      mkdirSync(join(paths.assets, outDir), { recursive: true })
      const scene: Scene = { width: 0, height: 0, layers: {}, hotspots: {} }
      for (const layer of LAYERS.filter((name) => sources[name])) {
        const raw = await render(svgOf(layer))
        scene.width = Math.max(scene.width, raw.width)
        scene.height = Math.max(scene.height, raw.height)
        const relative = `${outDir}/${layer}.webp`
        await toWebp(raw)
          .webp(layer === 'background' ? BACKGROUND_WEBP : OVERLAY_WEBP)
          .toFile(join(paths.assets, relative))
        scene.layers[layer] = assetUrl(relative)
      }
      if (sources.element) scene.hotspots = await writeHotspots(svgOf('element'), outDir)
      if (sources.fight) {
        const relative = `${outDir}/fight-background.webp`
        await toWebp(await render(svgOf('fight')))
          .webp(BACKGROUND_WEBP)
          .toFile(join(paths.assets, relative))
        scene.fightBackground = assetUrl(relative)
      }
      return scene
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
}

export async function exportScenes() {
  const scenes: Record<string, Scene> = {}
  for (const sceneId of [...VILLAGE_SCENES, ...FIELD_SCENES]) {
    scenes[sceneId] = await exportScene(sceneId, sceneSources(sceneId))
    console.log(`Scene ${sceneId}: ${Object.keys(scenes[sceneId]!.hotspots).length} clips`)
  }
  return scenes
}
