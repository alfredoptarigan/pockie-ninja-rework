// M6 pet script registration. Keep the existing FightBuff.ini definitions and attach only
// their newly ported callbacks. Importing this registry is the single skills.ts wiring point.
import fightBuffs from '../../../../server/data/game/fight-buffs.json'
import { BUFFS } from '../buffs.js'
import { PET_HALO_BUFFS, PET_HALO_SKILLS } from './pet-halo-skills.js'
import { PET_HELP_BUFFS } from './pet-help-buffs.js'
import { PET_HELP_SKILLS } from './pet-help-skills.js'

const scripts = { ...PET_HALO_BUFFS, ...PET_HELP_BUFFS }
for (const [id, row] of Object.entries(fightBuffs)) {
  const path = (row as { javascript?: string }).javascript
  if (path && scripts[path]) Object.assign(BUFFS[Number(id)]!, scripts[path])
}

export const PET_SCRIPTS = { ...PET_HALO_SKILLS, ...PET_HELP_SKILLS }
