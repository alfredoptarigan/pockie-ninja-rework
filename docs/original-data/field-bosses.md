# Standing field bosses

Reverse engineered from the captured Reborn client `data/reborn-raw/re/main.js`
(`Jv`, `$v`, `Zv`), `assets/scenes/npcs.json`, and `assets/entities/npcs`.
The server roster and spawn coordinates come from `scene-timed-npcs.json`
(RefresHeartNpc.ini); level variants come from LevelAttackRec.

The 28 fields are 2101–2503 (three per village), 2601–2605, 2701–2704,
and 2801–2804. Each shows its ticket boss as a standing, clickable figure,
including while the existing server schedule blocks challenges. The dialog
shows Demon Boss, the player's level variant, Demon Proofs, Fight, Auto,
and Cancel. Auto repeats after the replay, and stops on defeat, a refused
challenge, or Stop Auto. Each accepted fight spends one i150078 server-side.

Reborn uses outdoor NPC atlases at 12 fps, with separate registration and
name offsets; battle stand sprites are smaller and must not substitute for them.
`tools/assets/field-bosses.ts` exports the captured atlases where placement data
exists and the backup's original NPC SWFs otherwise. All 28 placements are
recorded in `client/src/generated/field-bosses.json`, with WebP sheets under
`client/public/assets/game/field-bosses`. Regenerate with:

```sh
node tools/assets/field-bosses.ts
```

The exporter requires the original backup and captured Reborn assets, as the
other asset tools do. Restart Vite after adding new public assets: its asset
watcher is intentionally disabled.

Slay the Demon (50007/52007/54007/56007/58007) targets the base spawn ID.
Combat previously credited only the level variant, so a victory never advanced
these quests above level 5. World fights now pass the challenged ID separately
from the combat variant for quest kill/drop credit. Ready quests navigate to
their submission NPC, rather than back to the defeated monster.
