import sprites from '../generated/sprites.json'

// Normalize legacy database copy at the landing boundary. Server seed data is owned separately.
export const LANDING_LEVEL_CAP = 90
const names: Record<string, string> = {
  'Uzumaki Naruto': sprites.naruto.name,
  'Uchiha Sasuke': sprites.sasuke.name,
  'Kurosaki Ichigo': sprites.ichigo.name,
  'Kuchiki Rukia': sprites.rukia.name,
  'Forge Highlands': 'Smelting Mountains',
  'Sunset Wasteland': 'Eventide Barrens',
  'Blazing Gorge': 'Fiery Ridge',
  'Green Path': 'Verdant Alley',
  'Flowing Blossom River': 'Slowflower River',
  'Thousand Peaks': 'Peaked Whetstone',
  'Thunder Ladder': 'Thundering Steps',
  'Dragon Tamer Valley': 'Dragontame Valley',
  'Endless Night Ruins': 'Abandoned Evernight City',
  'Endless Night': 'Abandoned Evernight City',
  'Valley of Lost Souls': 'Soulshatter Valley',
  'Plain of Despair': 'Plains of Despair',
}
const oldNames = new RegExp(
  `\\b(?:${Object.keys(names)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g',
)

export function landingCopy(text: string) {
  return text
    .replace(
      /(\blevel cap(?:\s+(?:at|of|is))?\s*[:=]?\s*)100\b/gi,
      (_match, prefix: string) => `${prefix}${LANDING_LEVEL_CAP}`,
    )
    .replace(
      /(\blevel table that tops out at\s*)100\b/gi,
      (_match, prefix: string) => `${prefix}${LANDING_LEVEL_CAP}`,
    )
    .replace(oldNames, (name) => names[name]!)
}
