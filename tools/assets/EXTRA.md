# M2 extra assets

Run `pnpm assets:export extra` with the original backup, JDK 8 and FFDec installed.
The full export also includes these assets. Raw SWFs stay in the backup or the ignored cache.

Import `gameItems`, `gameWeapons` and `gameWorldMap` from
`client/src/generated/game-extra.ts`. Item icons are indexed by item ID and shared by resource
when several items use the same image. Coverage includes the game-text quest/field scope,
recursive box drops, the newbie pack, class weapons, early HP items and exploration factories.
Six resources bake labels into their bitmaps: the exporter repaints the EXP/soul label areas
and crops the promotional logo from the gift. Those icons carry `textRemoved: true`.

Weapon coverage matches every outfit in the existing body manifest, with every compatible M2 weapon.
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

The world map is the original text-free 768x426 painting. Locations are the bounding rectangles of the original button
hit states in painting coordinates, not guessed point centers. For overlapping bounds, test the higher `depth` first, matching Flash display order. Draw English labels
separately and scale the art and rectangles together. Travel eligibility remains server-owned.
