// Reborn's Akatsuki scene table (main.js `$w`): each member's name, sprite and where they stand on
// the statue's fingers of the 1920x1080 background (`finger` = feet), with the locked hologram's
// size and feet offset. Entrance lines per pair from Reborn's ambush overlay.
import type { AkatsukiMember, AkatsukiPairKey } from '../../../../shared/src/schemas/akatsuki'

export const SCENE = { width: 1920, height: 1080 }
export const ART = '/assets/reborn/features/akatsuki'

export interface MemberArt {
  key: AkatsukiMember
  name: string
  /** Revealed / defeated sprite (Reborn's file names, `kakuzo` included); none for Zetsu, Obito. */
  sprite: string | null
  finger: { x: number; y: number }
  image: { width: number; height: number; footX: number; footY: number }
}

export const MEMBERS: MemberArt[] = [
  {
    key: 'pain',
    name: 'Pain',
    sprite: 'pain',
    finger: { x: 547, y: 552 },
    image: { width: 110, height: 120, footX: 56, footY: 109 },
  },
  {
    key: 'deidara',
    name: 'Deidara',
    sprite: 'deidara',
    finger: { x: 603, y: 477 },
    image: { width: 100, height: 110, footX: 52, footY: 101 },
  },
  {
    key: 'konan',
    name: 'Konan',
    sprite: 'konan',
    finger: { x: 677, y: 464 },
    image: { width: 100, height: 110, footX: 49, footY: 97 },
  },
  {
    key: 'itachi',
    name: 'Itachi',
    sprite: 'itachi',
    finger: { x: 748, y: 464 },
    image: { width: 115, height: 140, footX: 57, footY: 112 },
  },
  {
    key: 'zetsu',
    name: 'Zetsu',
    sprite: null,
    finger: { x: 804, y: 500 },
    image: { width: 110, height: 120, footX: 56, footY: 110 },
  },
  {
    key: 'obito',
    name: 'Obito / Tobi',
    sprite: null,
    finger: { x: 1106, y: 500 },
    image: { width: 120, height: 140, footX: 61, footY: 114 },
  },
  {
    key: 'kisame',
    name: 'Kisame',
    sprite: 'kisame',
    finger: { x: 1159, y: 464 },
    image: { width: 110, height: 120, footX: 52, footY: 108 },
  },
  {
    key: 'kakuzu',
    name: 'Kakuzu',
    sprite: 'kakuzo',
    finger: { x: 1230, y: 464 },
    image: { width: 110, height: 120, footX: 57, footY: 105 },
  },
  {
    key: 'hidan',
    name: 'Hidan',
    sprite: 'hidan',
    finger: { x: 1307, y: 477 },
    image: { width: 105, height: 110, footX: 52, footY: 97 },
  },
  {
    key: 'sasori',
    name: 'Sasori',
    sprite: 'sasori',
    finger: { x: 1367, y: 552 },
    image: { width: 120, height: 140, footX: 58, footY: 108 },
  },
]

export const memberName = (key: string) => MEMBERS.find((m) => m.key === key)?.name ?? key
export const pairNames = (members: readonly string[]) => members.map(memberName).join(' & ')
export const spriteUrl = (key: string) => {
  const sprite = MEMBERS.find((m) => m.key === key)?.sprite
  return sprite ? `${ART}/${sprite}.webp` : null
}

/** Reborn's entrance lines (`akatsuki__entrance_*`). */
export const ENTRANCES: Record<AkatsukiPairKey, string> = {
  clay: 'A clay bird’s shadow passes over you...',
  ritual: 'A blood-red circle forms beneath your feet...',
  crows: 'Crows scatter. Two cloaks step out of the dark...',
  paper: 'Paper swirls through the rain...',
}
