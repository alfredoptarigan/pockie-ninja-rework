# Reborn titles: reverse-engineering notes

Sources (gitignored): `data/reborn-raw/re/main.js`, `re/serverConfig.json`,
`locales_en_translation.json`, `re/live/` (no title traffic captured).

## Observations

- **Bonus table.** `serverConfig.titles` (the client reads it as `at.Fq.TITLES`) maps title id to
  `[statId, value][]`. 116 entries: ids 0-10, 13-50, 56, 61, 63-77, 79-98, 100-129. Title 0 is `[]`.
- **Stat ids used:** 1-15, 17, 19, 20, 105. Labels from `stat__<id>` in the locale file; 105 is
  "Block", 14 is "Max Chakra %", 9 "Max Health %", 11 "Attack %", 12 "Speed %".
- **Hover.** The Inventory title plate (`vc`, main.js @2579589) renders `TITLES[current]` lines
  through the same stat formatter as equipment (`ya.k(t("stat__"+id), id, value)`), so title values
  share equipment units (attributes whole points, `%` stats per-mille shown /10).
- **Selector options** are `character.titles.unlocked` mapped to `title__<id>` names. The initial
  state is `titles: { current: 0, unlocked: [0], timed: {} }`, so every character has title 0
  ("No Title") in the list. There is no separate "unequip" control; choosing title 0 via
  `setTitle` is how a title is taken off. The plate shows title 0's art/name when nothing else is on.

## Our mapping (tools/game-data/import-reborn-titles.ts)

| Reborn stat                             | Equipment term                                | Scale                          |
| --------------------------------------- | --------------------------------------------- | ------------------------------ |
| 1/2/3 Strength/Agility/Stamina          | `StrengthEquip`/`AgilityEquip`/`StaminaEquip` | x100 (our attributes are x100) |
| 4 Defense                               | `DefenseEquip`                                | 1                              |
| 5 Defense Break                         | `NeglectDefAttachEquip`                       | 1                              |
| 6 Dodge, 7 Hit                          | `DodgeMulEquip`, `HitMulEquip`                | 1                              |
| 8 Max Health, 13 Max Chakra             | `MaxHPEquip`, `MaxMPEquip`                    | 1                              |
| 9 Max Health %, 14 Max Chakra %         | `MaxHPMulEquip`, `MaxMPMulEquip`              | 1 (per-mille)                  |
| 10 Max Attack, 20 Min Attack            | `MaxAtkEquip`, `MinAtkEquip`                  | 1                              |
| 11 Attack %, 12 Speed %                 | `AbsAddAtkMulEquip`, `AtkTimeMulEquip`        | 1 (per-mille)                  |
| 15 Critical, 17 Constitution, 19 Pierce | `CritMulEquip`, `ToughEquip`, `PierceEquip`   | 1                              |
| 105 Block                               | `ParryMulEquip`                               | 1                              |

The import fails on any other stat id, so a new one in a future dump is noticed.

## Server behaviour

- The equipped title's lines (`server/data/game/reborn/titles.json`) are added to the buff
  bonus totals (`buffBonuses`), so they reach combat, arena snapshots and the stat page. Titles no
  longer create a `character_buffs` row; a `'title'` row left by the 2011 rules is ignored and
  is deleted on the next title change.
- Activating title 0 clears the equipped title (already the API contract).

## Assumptions

- **Reborn's server code is not available.** We assume it sums title lines with equipment stats
  in the same units the client tooltip uses. No live capture shows a stat change from `setTitle`.
- **Ids Reborn dropped** (our 11, 12, 51-55, 57-60, 62, 78 exist in the 2011 data but not in
  Reborn's table) keep their 2011 title buff properties as the bonus.
- **Reborn-only ids** 94-129 are imported but unused until we have those titles.
- A timed title's bonus ends with the title (its `expiresAt`); the arena snapshot treats that as
  an expiry like food buffs.
