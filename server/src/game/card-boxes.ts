// Card box drop sources (M6 decision 29): each source asks for its box here and grants it the way
// it grants its other rewards (fight loot is lost on a full bag; boxes and mail keep their rules).
import type { Random } from '@pockie/game-core'
import { rollCardBox } from '../../../game-core/src/cards/boxes.js'
import type { CardBoxSource } from '../../../game-core/src/cards/constants.js'
import type { GrantedItem } from './gear.js'

/** The source's card box as one bound item, or nothing when the roll misses. */
export function cardBoxDrop(source: CardBoxSource, random: Random): GrantedItem[] {
  const box = rollCardBox(source, random)
  return box ? [{ itemId: box, bound: true }] : []
}
