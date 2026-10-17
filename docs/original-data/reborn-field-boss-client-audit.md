# Reborn standing field boss: captured client audit (2026-10-17)

Scope: read-only analysis of captured public Reborn client/config. No gameplay change. Character offsets below are zero-based Unicode character offsets in the minified file (not UTF-8 byte offsets).

## Strongest finding: the dialog level is the player's level

In `data/reborn-raw/re/main.js`, function `$v`, offset 3454459, selects `l = ... e.stats.stats` and renders `ui__level_short` with `{level:l.level}`. It selects `a = ... e.scene.boss` separately for the monster icon. It does not read a monster combat level. The newer public capture `data/reborn-raw/re/field-boss-audit-2026-10-17/main.js`, function `zy`, starts at 3506113, selects `l` from player stats and renders `{level:l.level}` at 3507787. The October 16 capture also contains the same implementation near `Demon Proofs:` at 3495326.

Therefore a displayed Lv.90 is consistent with a Lv.90 character, and the supplied original-game screenshot showing Lv.21 is consistent with its Lv.21 character. This does **not** prove how the server scales enemy stats or selects a combat variant. No captured `fieldBossFight` request/reply was found in the stored `ws.jsonl`, `net.jsonl`, or RPC files, so actual combat level remains unverified.

## Fight requirements and protocol

Latest `zy`, 3506113 onward (old `$v`, 3454459 onward):

- The ticket counter iterates `inventory.items`, selects numeric `iid === 150078`, includes inventory positions whose helper result is `>= 0 && < 10`, and sums quantity through the inventory quantity helper. This is a bag inventory count, not a displayed level gate.
- Clicking the figure first rejects a party member who is not the party leader (`ui__only_leader_can_battle`); otherwise it opens the dialog.
- Fight and Auto are disabled exactly when the counted ticket quantity is zero. Both send `fieldBossFight` without a monster ID or level argument (latest offsets 3508723 and 3508863). Auto first enables the shared demon-boss auto state.
- The repeat callback at latest offset 1498825 calls `clearFight`, then `fieldBossFight`; a `false` reply disables auto. This is distinct from normal field monster fighting.
- There is no spawn timer or scheduled availability test in the captured standing boss dialog. Client absence of a check does not establish server absence of one.

`data/reborn-raw/locales_en_translation.json` names item `150078` **Demon Proof of Suppression**. Achievement keys `achievement__1101`–`1104` say to use 1/100/1000/5000 proofs. Item hints `item__141007--hint` through `141009` say drops come from Demon Boss and require this ticket. These establish ticket identity and intended use, not acquisition or exact per-fight debit. The client source contains only one numeric `150078` occurrence, in the counter; acquisition is not defined there. `re/serverConfig.json` synthesis recipes `synthesisFixed.120003[0]` and `.150301[0]` contain 150078 as an ingredient, so these must not be presented as ticket sources. Actual item grant/debit requires server evidence.

## Captured serverConfig roster

Source: `data/reborn-raw/re/serverConfig.json`, `scenes.<sceneId>.boss`; names from `locales_en_translation.json`, `npc__<id>--name`. Scene `level` is the area access/config level, **not evidence of boss combat level**.

| Scene IDs                    | Area config level | Standing ticket boss ID | Name             |
| ---------------------------- | ----------------: | ----------------------: | ---------------- |
| 2101, 2201, 2301, 2401, 2501 |                 1 |                   10019 | Demon Brute      |
| 2102, 2202, 2302, 2402, 2502 |                11 |                   10026 | Plague Demon     |
| 2103, 2203, 2303, 2403, 2503 |                21 |                   10039 | Firebore Dragon  |
| 2601                         |                16 |                   10015 | Soulender        |
| 2602                         |                31 |                   10032 | Bereaver         |
| 2603                         |                36 |                   10035 | Frozen Nightmare |
| 2604                         |                41 |                   10052 | Demonic Horror   |
| 2605                         |                26 |                   10034 | Fang Reaper      |
| 2701                         |                46 |                   10031 | Soulblade Demon  |

This is 21 configured standing ticket boss scenes, not 28. Scenes 2702/2703/2704 and 2801/2802/2803/2804 have no `boss` key. Their area levels are 51/56/61 and 66/71/81/86 respectively. Scenes 2806/2807/2808 use a **different** `worldMapBoss` key (31062/31071/31072; area levels 91/101/106), with those IDs also present in the normal monster lists. Do not equate that map display marker with the `scene.boss` ticket system.

The latest client selects `m = ... e.scene.boss` at 3546821 and renders the standing component only when `m` is truthy at 3549322 (`m && jsx(zy,{id:m,...})`). `assets/scenes/npcs.json` supports placement for these 21 scenes; it has no sub-20000 boss placement for 2702–2804. Extra stale placement IDs exist in some earlier areas (2102:10018, 2401:10015, 2601:10020), but placement alone is not the active roster. Use config `boss`, not every asset present.

## Limits

No authenticated live challenge, ticket consumption, ticket acquisition, enemy stats, exact server level scaling, or spawn schedule is established by this client audit. The prior `docs/original-data/field-bosses.md` assertion that all 28 fields are Reborn standing ticket boss locations and that the shown level is a combat variant is not supported by these client/config captures.

## Comparison with our implementation

`server/src/modules/game/field-data.ts` selects a backup NPC using LevelAttackRec;
`world.ts:ticketBossView` displays that NPC's `Level`. Its bands round a player's
level up to the next multiple of five (within the recorded range). Our Lv.90
character therefore selects `n3201818`, Level 90, HP 3715, Defense 692, attack
943–1153 (`server/data/game/npc-record-values.json` and `npcs.json`). These are
**our imported backup stats**, not verified Reborn enemy stats. The original
client's Lv.21 screenshot cannot establish that our Lv.90 variant is wrong:
the original dialog displays player level directly.

Our `fightTarget` additionally enforces a repeating UTC schedule from
`scene-timed-npcs.json` and spends one i150078. The captured original client
only establishes proof presence and party leadership gates; its exact debit,
server timing and enemy-stat formula remain unknown. The 28-map implementation
therefore mixes reproduced artwork with backup server rules, rather than a
verified reproduction of all Reborn combat rules.

The supplied local screenshot shows a Lv.90 player, a Lv.90 boss label and
zero proofs. Its disabled Fight button is explained by the proof gate before
combat starts. It is not evidence that a fight was attempted and lost.

## Live public-source check

On 2026-10-17, the original site's loaded main bundle was
`https://pockieninjareborn.com/static/js/main.846c5629.js`; the downloaded source
is the newer capture cited above. A same-origin browser request to
`https://pockieninjareborn.com/assets/scenes/npcs.json` returned HTTP 200 and
confirmed the outdoor placement IDs, including absence of ticket boss artwork
placements in 2702–2804. The sanitized selection is saved as
`data/reborn-raw/re/field-boss-audit-2026-10-17/public-placement-summary.json`.
The authenticated `serverConfig.scenes` roster is from the saved earlier capture;
it was not refreshed from an authenticated current session. The public preview
was logged out, and no battle or inventory mutation was performed.

No gameplay code was changed during this audit. An authenticated battle capture
is the next evidence needed to establish actual combat level/stats, proof debit,
and any server-side schedule. Ticket acquisition is likewise unverified; the
proof name and exploration-related text from the 2011 backup are not sufficient
to claim the current Reborn drop source or rate.
