# Las Noches monster names and skills: battle verification

Inspected 2026-10-16 using the owner's genshinhoyo / Nagatoro session.
This follow-up deliberately started the run and fought floors 1 through 20.
All sampled battles were won. Auto Battle was not enabled and no Claim was
executed. The run remains at cleared floor 20, with 10,730 banked EXP, two
lives, 3/3 displayed daily tries and next floor 21. Fight drops may already
have entered the bag; banked EXP has not been claimed.

## Result

The missing/wrong monster names are a confirmed client text-export defect.
The claim that monsters should never use player skill IDs is **not supported**:
Reborn's floor-20 Aaroniero really uses 1816 and 3810, the same two gameplay
skills assigned to our corresponding NPC. Do not replace every shared skill
with a guessed monster-only move.

Early-floor exposed skill lists differ: Reborn reports no equipped skills on
floors 1–19, whereas our NPC records supply Heavy Strike (2) plus internal
block/init skills (7777/8888). This establishes a data/presentation difference,
not by itself a complete difference in executed combat. Heavy Strike can fall
back to a normal attack, and internal skills may be omitted from Reborn's
public role payload.

## Live observations

| Floor | Reborn result name                    | Exposed enemy skills | Observed enemy event skills                |
| ----- | ------------------------------------- | -------------------- | ------------------------------------------ |
| 1     | Rudobon                               | `[]`                 | `1` (normal attack)                        |
| 2     | Cannibal Hollow                       | `[]`                 | No attack before defeat                    |
| 3–9   | Alternating Rudobon / Cannibal Hollow | `[]`                 | Normal attack where the monster got a turn |
| 10    | Gillian                               | `[]`                 | No attack before defeat                    |
| 11–19 | Alternating Rudobon / Cannibal Hollow | `[]`                 | Normal attack where the monster got a turn |
| 20    | Aaroniero                             | `[1816, 3810]`       | `1`, `1816`, `3810`                        |

The floor-20 View Character panel visibly exposes two enemy skill icons:
`assets/icons/skills/1816.png` and `assets/icons/skills/3810.png`.
The English reference translations identify these as Great Mud River and
The Eight Inner Gates Released. Actual enemy event order in this battle was
`3810, 1816, 1, 1, 1, 3810, 1` (filtered by `role === 1`). This is separate
from the player's role-0 actions. Floor 1, for example, had player skills
1803/1810 and enemy skill 1; attributing all replay skill IDs to the monster
would be incorrect.

Runtime state was read from the page's existing React/Redux store without
dispatching synthetic combat events or changing loadouts. The live server
produced the fight through ordinary visible battle buttons. Raw replays for
floors 1 and 3–20 are retained locally under
`data/reborn-raw/re/las-noches-2026-10-16/fight-floor-*.json`.
Floor 2 was inspected live but its full replay was not retained.
The tracked `las-noches-monster-comparison.json` provides the per-floor table;
null on floor 2 means no retained replay, not an unknown live observation.

## Confirmed name root cause

1. `server/src/game/combat.ts: monsterFighter` emits `lg_${row.Name}`.
   For NPC n900001 this is `lg_name_n900001`.
2. `client/src/game/phaser/index.ts` resolves replay fighter names through
   `plainText(f.name, f.name)`.
3. `client/src/game/text.tsx` merges only the generated client `en.json`,
   `skills-and-titles.json` and `reborn.json`.
4. All 170 Las Noches NPC name keys exist in `tools/i18n/en.json`, including
   Rudobon, Cannibal Hollow, Gillian and Aaroniero. **Zero of those 170 keys**
   exist in the three merged client tables.
5. `client/scripts/game-text.ts` selects NPCs from its scene/quest/exploration
   slice, but never adds the NPCs referenced by `single-gate.json`.

Consequently the renderer falls back to the raw localization key. The smallest
fix is to include Las Noches floor NPC name keys in the existing text-export
pipeline and regenerate the client table, with a check covering all floor NPCs.
Hardcoding display names into the battle renderer would hide the export defect.

## Local skill provenance

The actual path is:

`las-noches/fight` → `singleGateData().floors[floor - 1].npc` →
`duel` / `teamDuel` → `monsterFighter(npcId)` → `npcSkillIds(npcId)` →
`npc-records.json` AttackSkill/TriggerSkill → `npc-record-values.json` →
`skillRows` → `skills.json` / applicable Reborn overlays → battle scripts.

It does **not** copy the player's skill bar. Player and monster fighters are
constructed separately. However, the NPC assignments are imported legacy data,
and those records intentionally contain shared ninjutsu IDs on some floors.

For floor 20, n900020 resolves to `[1816, 7777, 8888, 3810]` locally.
The gameplay skills match Reborn's observed `[1816, 3810]`; 7777 and 8888 are
internal block/init skills. Their absence from the public Reborn role list is
not enough evidence to delete their engine behavior locally.

Local first-floor skill 2 has `skill/skill_guaiwuzhongji_2.js` and a dedicated
instance-monster implementation (`instance-skills.ts`), not a player loadout.
Its script can use `normalAttack` based on MP and initialization-buff state.
Actual equivalence of its probability, cost, damage and replay label has not
been tested against Reborn.

## REA verification and scope

MCP REA analyzed exact inert function excerpts from the production bundle
`main.cfd1c9d9.js`, covering enemy names, result names and monster skill
tooltip selection. The three excerpts parsed without failure.

- Application Evidence:
  `ev_d76e2e7d4da779e0268e0dd5dfb13e5f756edd4c4b36d4cd7a3305f2bfa9b63b`.
- Summary Evidence:
  `ev_39f3e235445073765bee5cfb6bf4a0e28155242963441a7d5b2a10aba7ccf63b`.
- Excerpts and original UTF-16 ranges: `battle-focused/` and
  `battle-provenance.json` under the local investigation directory.
- Complete exported session records: `rea-battle-evidence.json`.

Static source observations: Reborn resolves monster names with
`monster__<id>--name`; its skill tooltip component accepts `isMonster` and
prefers `skill__<id>--tooltip_mob` when a monster-specific translation exists,
otherwise using the ordinary skill tooltip. This is evidence that identical
skill IDs can have context-specific descriptions; it is not evidence that
every monster skill differs from its player version.

REA's application coverage is complete within these three excerpts; semantic
coverage remains unknown/partial with 401 unresolved facts, principally
external minified bindings. These static records do not claim to have observed
the live battle. Browser replay observations above are separate evidence.

Examples of reference monster tooltip variants include 40026 (Entangle),
40200 (Planetary Devastation) and 40201 (Eye of the Moon). No sampled Las Noches
enemy was observed equipping those three IDs; do not assign them speculatively.

## Other discrepancy noticed

After clearing floor 20, Reborn previews floor 21 with HP 2,500 and reward
1,500 EXP. Our imported floor-21 reward is 691 EXP. Therefore matching
floor-20 skill IDs does not establish that the entire legacy floor table still
matches current Reborn. Floor 21 was not fought.

## Next implementation scope

- Fix name export and regenerate client text; cover all floor NPCs.
- Preserve the confirmed floor-20 skills and distinguish actor roles in replay
  diagnostics.
- Compare monster assignments and tooltip variants per floor; do not globally
  remove shared player/monster skills or internal block/init behavior.
- Verify early Heavy Strike behavior, floor-21 onward data, and any additional
  monster-specific skills against retained runtime evidence before changing
  combat rules.

No gameplay code was changed by this verification pass.
