# M2 extra assets

Run `pnpm assets:export extra` with the original backup, JDK 8 and FFDec installed.
The full export also includes these assets. Raw SWFs stay in the backup or the ignored cache.

Import `gameItems`, `gameWeapons` and `gameWorldMap` from
`client/src/generated/game-extra.ts`. Item icons are indexed by item ID and shared by resource
when several items use the same image. Coverage includes the game-text quest/field scope,
recursive box drops, the newbie pack, class weapons, early HP items and exploration factories.
Five resources bake labels into their bitmaps: the exporter repaints the EXP/soul label areas.
Those icons carry `textRemoved: true`. The gift (`icon_debris114`) instead uses the complete
English-branded Reborn asset from `/assets/icons/items/etc/114.png`, captured under
`data/reborn-raw/assets/icons/items/etc/114.png` (or `REBORN_RAW_DIR`). Keep the full image:
cropping its logo also cuts off the box. The output remains shared by the backup gift item IDs;
Reborn's current item 159104 is a different item and must not replace our newbie pack mapping.

Weapon coverage matches every outfit in the existing body manifest, with every compatible M2 weapon,
plus the outfit's own-type skin of every weapon number (Reborn draws a weapon of another type as
the outfit's own art of the same number; `loadWeaponLayer` does the same).
Fetch `gameWeapons.outfits[outfitId].file` and parse it as `WeaponLayers` (one runtime file per
outfit). Look up `gameWeapons.items[itemId]`, then `layers[weaponKey]`. The generated index stays
small and does not bundle every weapon timeline with the client.
Use `actions[actionId]` or `skills[skillId]` to select a sheet. A null mapping is an intentionally
transparent original motion: hide the weapon. An undefined mapping is unsupported. `missing` lists any absent SWFs. Outfits 43/59 have no playable body actions and no referenced
weapon layers; `gaps.incompleteBodyOutfits` carries that existing body gap.
`gaps.unmappedActions` and `gaps.unmappedSkills` list body entries absent from the original weapon
table (including nonbattle actions and unused skills). The coverage test pins these original gaps. Draw the
weapon above the body, at the same world position and scale, using its own anchor. Both timelines
start at tick zero and advance at 14 ticks/s; use the sheet's durations, never reuse body cell
indexes (each layer collapses duplicate frames independently). Clamp to the last tick when a
layer ends before the body. Body gaps remain as documented in game-motions.json; weapon art does not restore missing bodies
or upgrade-only victory/provoke body motions.

M3: `gameItems` covers every item of `items.json` with a bitmap icon (shop pools, forge
materials, set pieces, toll gate cards and crystals included). `gameItems.gaps.missingIcons` lists
the 48 resource keys without a bitmap in the backup; `gaps.textIcons` the icons left out because
their art is Chinese text or a partner logo (`ICONS_WITH_TEXT`). Card collection items (CardItem)
are not exported. Weapon layers still cover only the M2 slice weapons.

The world map is the original text-free 768x426 painting. Locations are the bounding rectangles of the original button
hit states in painting coordinates, not guessed point centers. For overlapping bounds, test the higher `depth` first, matching Flash display order. Draw English labels
separately and scale the art and rectangles together. Travel eligibility remains server-owned.
All 34 place buttons are exported (181 is dropped: no such scene; 2804 has no button). The painting
is the grey, unvisited look; each location's `states.up/over/down` is the coloured art the original
showed over it for a visited place (alpha 1), at its painting position. Draw blocked places with the
grey painting only (or dimmed art) and no hover.

## M3 game assets (`pnpm assets:export game`)

Import `gameMotions`, `gameScenes` and `gameTollGates` from `client/src/generated/game-assets.ts`.

- `gameScenes`: villages, Angel City 161, Demon City 171 (buildings as `clip_*` hotspots),
  fields 21xx-25xx xx01-xx03 and 26xx-28xx, Las Noches 3101 and floors 61-64, toll gate lobby 3102.
  The xx04 Christmas maps are not exported.
- `gameTollGates[1000xx]`: the shared backdrop, the gate map without labels (drawn centred, like
  `TollClone.as`), the fight point button art, the named clip rectangles (`Btn_Fight<n>`,
  `Beachhead_<n>`) and the fight background (scene 3101's or the arena, from Binary_SceneFight).
  Scene 5001 has no art of its own.
- `gameMotions.monsters` maps every npc drawn with an exported monster art key, so explore and
  ticket boss level variants resolve too. `gameMotions.people` lists the toll gate, Las Noches and
  pub fight NPCs drawn like players (outfit + weapon key); outfits 77-83 are exported for them.
  Their weapon layers exist only where the outfit's `layers.json` already has the key.
- The shop, forge, toll gate, pub fight and card flip skin pieces are in `game-ui.json` (see the
  `M3_PIECES` comment in `ui.ts`).

## M4 assets (`pnpm assets:export ui`, `pnpm assets:export arena`)

- Window skin: the `M4_PIECES` comment in `ui.ts` lists the pieces per window (team frame and
  boards, Friends, Mail, Market tree and form controls, whisper window, minimap Mail/Whisper,
  arena, Honor shop). Paged lists use `page-first/prev/next/last`; the HUD Friends, Rankings and
  Market buttons are the M3 `menu-social`, `menu-rank`, `menu-mart`. Rankings reuse the panels,
  pager and tree pieces (there is no `UI_GameTop` SWF, only its AsWing layout).
- Not exported (text baked in): the 23 arena tier badges (`Font_PosCall*`, Indonesian names),
  "Kirim", "GO!", "EXP", the "TOP" board, the arena side buttons, "Battle!", the chest cards.
- Import `gameArena` from `client/src/generated/game-assets.ts`: `faces[clothing]` is the arena
  opponent picture for players and NPCs; `npcs[id]` is an outfit + weapon or a mob key (N31023,
  the arena boss, is in `gameArena.mobs`). `gaps` lists 7 outfits without a face in the backup and
  35 outfit/weapon pairs without weapon layers (draw those NPCs without a weapon).
