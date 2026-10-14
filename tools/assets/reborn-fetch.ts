export type Target = { group: string; id: string; path: string; atlas?: boolean }
type Item = [string | null, ...unknown[]]
type Config = { WING?: { Line: Record<string, unknown> }; scenes?: Record<string, unknown> }

/** Enumerate references, never execute the downloaded bundle. */
export function enumerateM6(
  bundle: string,
  config: Config,
  items: Record<string, Item>,
  loader: Record<string, number[]>,
): Target[] {
  const targets: Target[] = []
  const add = (group: string, id: string, path: string, atlas = false) =>
    targets.push({ group, id, path, atlas })
  const pets = new Set((loader['combat/pets'] ?? []).map(String))
  for (const [id, item] of Object.entries(items)) {
    if (typeof item[0] !== 'string') continue
    const props = item[7] as { stat?: number; wingSprite?: string; battleAura?: string } | undefined
    if (item[0].startsWith('pets/')) {
      pets.add(item[0].slice(5))
      add('pets', id, `icons/items/${item[0]}.png`)
    }
    if (
      item[0].startsWith('wings/') &&
      props?.stat !== undefined &&
      config.WING?.Line[props.stat]
    ) {
      add(props.battleAura ? 'auras' : 'wings', id, `icons/items/${item[0]}.png`)
      if (props.wingSprite) {
        add('wings', props.wingSprite, `entities/wings/${props.wingSprite}/data.json`)
        add('wings', props.wingSprite, `entities/wings/${props.wingSprite}/avatar.json`, true)
      }
    }
  }
  for (const id of pets) {
    add('pets', id, `entities/pets/${id}/data.json`)
    add('pets', id, `entities/pets/${id}/avatar.json`, true)
    add('pets', id, `icons/pets/${id}.png`)
    add('pets', id, `portraits/${id}.png`)
  }
  // The Tailed Beast map explicitly references this pet directory.
  add('pets', '34071', 'entities/pets/34071/avatar.json', true)
  for (const match of bundle.matchAll(
    /id:"([^"]+)",nameKey:"ui__battle_aura_[^"]+",descriptionKey:"[^"]+",atlasFile:"([^"]+)"/g,
  )) {
    add('auras', match[1]!, `entities/auras/${match[1]}/${match[2]}`, true)
  }
  const effectStart = bundle.indexOf('we={[-1]:{name:"default"')
  const effectEnd = bundle.indexOf('const Se=', effectStart)
  const effects = bundle.slice(effectStart, effectEnd)
  for (const match of effects.matchAll(/(?:name:|je\()"([^"]+)"/g)) {
    if (match[1] !== 'default')
      add('combat-effects', match[1]!, `entities/effects/${match[1]}.json`, true)
  }
  for (const name of ['normal', 'heal'])
    add('combat-effects', name, `entities/numbers/${name}.json`, true)
  add('combat-effects', 'icons', 'icons/effects.json', true)
  add('combat-effects', 'blank', 'entities/skills/core/blank.png')
  for (const name of ['basic_attack', 'jutsu', 'mud_wall', 'substitution_technique'])
    add('combat-effects', name, `entities/skills/core/${name}.json`, true)
  for (const match of bundle.matchAll(/"(ui\/combat\/[^" ]+\.(?:png|jpg))"/g))
    add('combat-effects', match[1]!, match[1]!)
  const backgrounds = new Set(['1_fight.png', '1111_fight.png'])
  for (const match of bundle.matchAll(/"([^"/]+_fight\.(?:png|jpg))"/g)) backgrounds.add(match[1]!)
  for (const id of Object.keys(config.scenes ?? {})) backgrounds.add(`${id}_fight.png`)
  for (const name of backgrounds) add('combat-effects', name, `scenes/backgrounds/${name}`)
  for (const path of ['events/akatsuki/combat.jpg', 'events/hashirama/battle.jpg'])
    add('combat-effects', path, path)
  for (const match of bundle.matchAll(/"([^"/]+\/(?:\d+|Ninja)\.jpg)":"([^"]+)"/g)) {
    add('cards', match[2]!, `icons/items/cards/${match[1]}`)
  }
  // Explicit icons or audio literals, including future SFX references.
  for (const match of bundle.matchAll(
    /"((?:icons\/[^" ]*aura[^" ]*|audio\/[^" ]+)\.(?:png|mp3|ogg|wav|m4a))"/g,
  )) {
    add(match[1]!.startsWith('audio/') ? 'audio' : 'auras', match[1]!, match[1]!)
  }
  return [...new Map(targets.map((target) => [target.path, target])).values()]
}

export function audioPaths(playlist: unknown, bundle: string): string[] {
  const paths = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string' && /\.(mp3|ogg|wav|m4a|opus)$/i.test(value))
      paths.add(value.replace(/^assets\//, '').replace(/^(?!audio\/)/, 'audio/'))
    else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(playlist)
  for (const match of bundle.matchAll(/"([^"\n]+\.(?:mp3|ogg|wav|m4a|opus))"/g)) visit(match[1])
  return [...paths].sort()
}
