// Reborn's title bonus table (serverConfig.titles, the client's `TITLES`: title id -> [stat id,
// value][]) as `<Name>Equip` lines in our units, for server/data/game/reborn/titles.json.
// docs/audit/reborn-titles-re.md has the reverse engineering.

/**
 * Reborn stat id -> equipment term and factor into our units. Attributes are x100 internally;
 * 9, 11, 12 and 14 are per-mille in both games (Reborn prints them /10 as "%"). 105 is Reborn's
 * "Block" rating (stat__105). 18 is left out: titles never use it and its meaning is disputed
 * (import-reborn.ts STAT_FIELDS).
 */
const TITLE_TERMS: Record<number, [name: string, scale: number]> = {
  1: ['StrengthEquip', 100],
  2: ['AgilityEquip', 100],
  3: ['StaminaEquip', 100],
  4: ['DefenseEquip', 1],
  5: ['NeglectDefAttachEquip', 1],
  6: ['DodgeMulEquip', 1],
  7: ['HitMulEquip', 1],
  8: ['MaxHPEquip', 1],
  9: ['MaxHPMulEquip', 1],
  10: ['MaxAtkEquip', 1],
  11: ['AbsAddAtkMulEquip', 1],
  12: ['AtkTimeMulEquip', 1],
  13: ['MaxMPEquip', 1],
  14: ['MaxMPMulEquip', 1],
  15: ['CritMulEquip', 1],
  16: ['CritAttachEquip', 1],
  17: ['ToughEquip', 1],
  19: ['PierceEquip', 1],
  20: ['MinAtkEquip', 1],
  105: ['ParryMulEquip', 1],
}

export type TitleLine = { name: string; value: number }

export function buildTitles(titles: Record<string, [number, number][]>) {
  return Object.fromEntries(
    Object.entries(titles).map(([id, lines]) => [
      id,
      lines.map(([stat, value]): TitleLine => {
        const term = TITLE_TERMS[stat]
        if (!term) throw new Error(`Title ${id}: unknown Reborn stat id ${stat}`)
        return { name: term[0], value: value * term[1] }
      }),
    ]),
  )
}
