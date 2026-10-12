// Character creation screen (CreatRoleBase.as with Version_CreateRole_new): the 1000x600
// creatrolenew.swf without its Indonesian text, its tab and button art per state, and the large
// outfit pictures (bitmap/peoplecreate). Positions are stage pixels of the 1000x600 screen.
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { cached } from './cache.ts'
import { mapButtonSvg } from './extra.ts'
import { ffdec } from './ffdec.ts'
import { assetUrl, paths } from './paths.ts'
import { opaqueBounds } from './sheet.ts'

export interface Art {
  file: string
  x: number
  y: number
  width: number
  height: number
}
type States = Record<'up' | 'over' | 'down', Art>

const OUT = 'game/create'
// Static text and dynamic text fields drawn by the SWF (step titles, hints, button captions).
const TEXT_CHARACTERS = [10, 11, 17, 19, 21, 23, 25, 27, 115, 125, 130, 134, 135]
// Interactive clips drawn separately (tabs, buttons) or filled at run time.
const INTERACTIVE = [
  'clip_Photo',
  'clip_Name',
  'clip_Nation',
  'clip_Role',
  'clip_Btn',
  'Btn_back',
  'Btn_reset',
  'dice',
  'null_mc',
  'null_mc_selectRole',
  'Txt_SelectRoleInfo',
  'Txt_UserName',
  'NameCheckText',
]
// TabSelect clips and their TabItem frames (1 normal, 2 over, 3 selected).
const NATION_CLIP = { x: 121.5, y: 89.8 }
const ROLE_CLIP = { x: 57.75, y: 198 }
const TAB_FRAMES = { normal: 1, over: 2, selected: 3 } as const
// clip_Photo, where CreatRoleBase.FlushAvatar adds the loaded picture.
const PHOTO = { x: 612.2, y: 50.15 }

/** Drops text and the given top-level instances from the frame SVG. */
export function withoutText(svg: string, drop: string[] = []) {
  const text = new RegExp(`ffdec:characterId="(?:${TEXT_CHARACTERS.join('|')})"`)
  return svg
    .split('\n')
    .filter((line) => !(/<use /.test(line) && text.test(line)))
    .filter(
      (line) => !drop.some((id) => line.startsWith('    <use ') && line.includes(` id="${id}"`)),
    )
    .join('\n')
}

/** `tab<n>` placements inside a TabSelect clip sprite: sprite character id and offset. */
export function tabPlacements(svg: string, clipSprite: string) {
  const group = new RegExp(`<g id="${clipSprite}">([\\s\\S]*?)\\n {4}</g>`).exec(svg)?.[1] ?? ''
  const tabs: Record<number, { characterId: number; x: number; y: number; width: number }> = {}
  for (const m of group.matchAll(
    /ffdec:characterId="(\d+)"[^>]*id="tab(\d+)" transform="matrix\([^,]+, [^,]+, [^,]+, [^,]+, ([-\d.]+), ([-\d.]+)\)" width="([\d.]+)"/g,
  ))
    tabs[Number(m[2])] = {
      characterId: Number(m[1]),
      x: Number(m[3]),
      y: Number(m[4]),
      width: Number(m[5]),
    }
  return tabs
}

/** Top-left of the picture in a peoplecreate SWF: placements plus the shape bounds (twips). */
export function createArtOrigin(xml: string) {
  const matrices = [
    ...xml.matchAll(
      /<item type="PlaceObject\dTag"[^>]*>\s*<matrix [^>]*translateX="(-?\d+)" translateY="(-?\d+)"/g,
    ),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
  const bounds =
    /<shapeBounds [^>]*Xmax="(-?\d+)" Xmin="(-?\d+)" Ymax="(-?\d+)" Ymin="(-?\d+)"/.exec(xml)
  if (!bounds || !matrices.length) throw new Error('Unexpected create picture SWF')
  const sum = matrices.reduce((a, m) => ({ x: a.x + m.x, y: a.y + m.y }), { x: 0, y: 0 })
  return { x: (sum.x + Number(bounds[2])) / 20, y: (sum.y + Number(bounds[4])) / 20 }
}

async function save(input: Buffer | string, name: string, at = { x: 0, y: 0 }): Promise<Art> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const box = opaqueBounds([{ data, width: info.width, height: info.height }])
  if (!box) throw new Error(`Empty create art ${name}`)
  const relative = `${OUT}/${name}.webp`
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .webp({ quality: 88, alphaQuality: 90, effort: 6 })
    .toFile(join(paths.assets, relative))
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    file: assetUrl(relative),
    x: round(at.x + box.left),
    y: round(at.y + box.top),
    width: box.width,
    height: box.height,
  }
}

/** Drawn top-level groups (masked art like the screen's bars), not definitions (`<g id=`). */
const DRAWN_GROUPS = /\n {4}<g ffdec:characterId="\d+">[\s\S]*?\n {4}<\/g>/g

async function buttonStates(svg: string, element: string, name: string) {
  const states = {} as States
  for (const state of ['up', 'over', 'down'] as const) {
    const alone = mapButtonSvg(svg, element, state).replace(DRAWN_GROUPS, '')
    states[state] = await save(Buffer.from(alone), `${name}-${state}`)
  }
  return states
}

/** The newest `<name>.s<stamp>.swf` in a folder. */
function newestSwf(dir: string, pattern: RegExp) {
  const stamp = (name: string) => Number(/\.s(\d+)\.swf$/.exec(name)?.[1] ?? 0)
  const found = readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort((a, b) => stamp(b) - stamp(a))[0]
  if (!found) throw new Error(`Nothing matching ${pattern} in ${dir}`)
  return join(dir, found)
}

export async function exportCreateRole() {
  const outfits = JSON.parse(
    readFileSync(join(paths.gameData, 'creation-outfits.json'), 'utf8'),
  ) as { Cloth: number | string; Sex: number | string }[]
  const screen = newestSwf(join(paths.movieclips, 'ui'), /^creatrolenew\.s\d+\.swf$/)
  const pictures = outfits.map((o) => ({
    clothing: Number(o.Cloth),
    swf: newestSwf(
      join(paths.apache, 'source/bitmap/peoplecreate'),
      new RegExp(`^avatars_${Number(o.Sex)}_${Number(o.Cloth)}_clothing_create\\.s\\d+\\.swf$`),
    ),
  }))
  const hash = createHash('sha1')
  for (const file of [screen, ...pictures.map((p) => p.swf)]) hash.update(readFileSync(file))
  const work = mkdtempSync(join(paths.cache, 'create-'))
  try {
    return await cached(
      'create-role-v3',
      hash.digest('hex'),
      [join(paths.assets, OUT)],
      async () => {
        rmSync(join(paths.assets, OUT), { recursive: true, force: true })
        mkdirSync(join(paths.assets, OUT), { recursive: true })
        mkdirSync(join(work, 'in'))
        writeFileSync(join(work, 'in/create.swf'), readFileSync(screen))
        await ffdec([
          '-format',
          'frame:svg',
          '-export',
          'frame',
          join(work, 'svg'),
          join(work, 'in'),
        ])
        await ffdec([
          '-format',
          'sprite:png',
          '-export',
          'sprite',
          join(work, 'sprites'),
          join(work, 'in/create.swf'),
        ])
        const svg = readFileSync(join(work, 'svg/create.swf/1.svg'), 'utf8')
        const clean = withoutText(svg)
        const clipSprite = (id: string) =>
          new RegExp(`id="${id}"[^>]*xlink:href="#(sprite\\d+)"`).exec(svg)?.[1] ?? ''

        const tabArt = async (clip: { x: number; y: number }, sprite: string, prefix: string) => {
          const result: Record<string, Record<keyof typeof TAB_FRAMES, Art>> = {}
          for (const [index, tab] of Object.entries(tabPlacements(svg, sprite))) {
            const states = {} as Record<keyof typeof TAB_FRAMES, Art>
            for (const [state, frame] of Object.entries(TAB_FRAMES)) {
              const png = join(work, `sprites/DefineSprite_${tab.characterId}/${frame}.png`)
              // Sprite PNGs grow by the filter margin on every side (glow tabs); take it off.
              const { width = tab.width } = await sharp(png).metadata()
              const margin = Math.max(0, (width - tab.width) / 2)
              states[state as keyof typeof TAB_FRAMES] = await save(
                png,
                `${prefix}${index}-${state}`,
                { x: clip.x + tab.x - margin, y: clip.y + tab.y - margin },
              )
            }
            result[index] = states
          }
          return result
        }

        const art: Record<string, Art> = {}
        for (const picture of pictures) {
          const dir = join(work, `p${picture.clothing}`)
          mkdirSync(join(dir, 'in'), { recursive: true })
          writeFileSync(join(dir, 'in/p.swf'), readFileSync(picture.swf))
          await ffdec(['-swf2xml', join(dir, 'in/p.swf'), join(dir, 'p.xml')])
          await ffdec([
            '-format',
            'image:png',
            '-export',
            'image',
            join(dir, 'images'),
            join(dir, 'in/p.swf'),
          ])
          const origin = createArtOrigin(readFileSync(join(dir, 'p.xml'), 'utf8'))
          const image = readdirSync(join(dir, 'images')).find((f) => f.endsWith('.png'))!
          art[picture.clothing] = await save(
            join(dir, 'images', image),
            `outfit-${picture.clothing}`,
            { x: PHOTO.x + origin.x, y: PHOTO.y + origin.y },
          )
        }

        return {
          width: 1000,
          height: 600,
          background: await save(Buffer.from(withoutText(svg, INTERACTIVE)), 'background'),
          // TabSelect order: tab1 Fire, tab2 Wind, tab3 Water, tab4 Lightning, tab5 Earth.
          nations: await tabArt(NATION_CLIP, clipSprite('clip_Nation'), 'nation'),
          // tab<n> is Binary_CreatRole row n-1 (creation-outfits.json order).
          roles: await tabArt(ROLE_CLIP, clipSprite('clip_Role'), 'role'),
          enter: await buttonStates(clean, 'clip_Btn', 'enter'),
          back: await buttonStates(clean, 'Btn_back', 'back'),
          random: await buttonStates(clean, 'Btn_reset', 'random'),
          outfits: art,
        }
      },
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
