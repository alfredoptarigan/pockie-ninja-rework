# Standing field bosses

> Implementation history, not a verified Reborn rules specification. The
> [2026-10-17 client audit](reborn-field-boss-client-audit.md) corrects the roster
> and distinguishes displayed player level from actual combat level.

The current placement roster follows `re/serverConfig.json` from Reborn: 21
standing ticket bosses, across 2101–2503 (three per village), 2601–2605, and 2701. Maps 2702–2704 and 2801–2804 have no ticket boss. The separate
`worldMapBoss` entries are outside this system. All five third village fields
use Firebore Dragon's appearance and name.

The dialog shows the player's exact level, Demon Proofs, Fight, Auto, and
Cancel. Its level label does not establish combat scaling. Auto repeats after
the replay and stops on defeat, a refused challenge, or Stop Auto. A proof is
required. The old backup countdown and hourly challenge gate were removed to
follow the observed Reborn client flow; this is a local policy choice because
Reborn server schedule behavior has not been captured.

Outdoor NPC atlases run at 12 fps with original registration and name offsets.
`tools/assets/field-bosses.ts` exports the captured atlases, canonical names,
placement roster in `server/data/game/reborn/field-bosses.json`, and animation
metadata in `client/src/generated/field-bosses.json`. Regenerate with:

```sh
node tools/assets/field-bosses.ts
```

The exporter requires captured Reborn assets and the backup ID mapping.
Restart Vite after adding new public assets: its asset watcher is disabled.

Combat still uses backup LevelAttackRec variants. The existing local rule
spends one i150078 per accepted fight and blocks team fights. These rules,
combat stats, and proof acquisition are **not verified Reborn server behavior**.
A captured `fieldBossFight` response is needed before claiming battle parity.

Slay the Demon (50007/52007/54007/56007/58007) targets the base spawn ID.
Combat previously credited only the level variant, so a victory never advanced
these quests above level 5. World fights now pass the challenged ID separately
from the combat variant for quest kill/drop credit. Ready quests navigate to
their submission NPC, rather than back to the defeated monster.
