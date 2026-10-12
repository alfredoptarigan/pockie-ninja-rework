# Original data: equipment sets

Reference for equipment stats and set (suit) bonuses. RES = `app/code/props/serv/game/Resource`,
J = decompiled server (`EquipModule/`), C = decompiled client, DT = `apache/source/binary/datatable`.
Stat formulas are in `characters.md`; this file covers what equipment feeds into them.

## Equip slots (`RES/Equip/EquipDefine.ini [EquipType]`, `J/EquipSystem.java:57`)

`EquipBox` has 8 slots (`EQUIPBOXCAP = 8`), one item per slot, slot index = `EquipType`:

| Slot | EquipType | Items in item.ini |
| ---- | --------- | ----------------- |
| 0    | Hat       | 72                |
| 1    | Cloth     | 90                |
| 2    | Shoes     | 72                |
| 3    | Amulet    | 82                |
| 4    | Weapon    | 116               |
| 5    | Ring      | 65                |
| 6    | Glove     | 47                |
| 7    | Girdle    | 47                |

The avatar (outfit) is not in the EquipBox; it is a separate system (`characters.md`).

## Equip rules (`J/EquipSystem.java`)

| Rule                                | Where   | Detail                                                                                        |
| ----------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Equip checks (`CheckEquipProp`)     | 374-    | `Sex` (2 any), `UseLevel <= level`, `Hardiness > 0`, `UsePopsinger & player.Popsinger > 0`    |
| Item is active (`CheckEquipEffect`) | 339-355 | exists, `Hardiness > 0`, job bitmask matches, sex matches. **No level check.**                |
| Bind on equip                       | 193-194 | `BindingType == 2` and unbound → bound when put in the EquipBox                               |
| Refresh                             | 188-215 | every equip/unequip calls `RefreshRoleProperty(player, 5)` (`RefreshSystem.java:174`)         |
| Broken item (Hardiness 0)           | 339-345 | gives no stats, no skills and does **not** count toward its set (durability: `blacksmith.md`) |

## Stats from one item (`GetEquipTotalProp`, `J/EquipSystem.java:294-300`)

Per active item, in this order, all appended to one list:

| Source                             | Lines   | Fields                                                                                                                                       |
| ---------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Base (`GetEquipSelfProp`)          | 233-243 | `AttackMin` → MinAtkEquip, `AttackMax` → MaxAtkEquip, `Defense` → DefenseEquip, `ConsolidatedMaxHP` (enhance, runtime) → MaxHPEquip          |
| Fixed extras (`AddOtherProp`)      | 245-265 | `OtherPropName` / `OtherPropValue`, `;`-separated pairs; ignored if the counts differ (80 of 591 items, e.g. i298001 `AbsAddAtkMulEquip` 50) |
| Identify props (`IdentifyPropRec`) | 267-274 | rolled by identify (`blacksmith.md`)                                                                                                         |
| Jewels (`JewelItemRec`)            | 276-283 | socketed gems                                                                                                                                |
| Inscriptions (`InscribeRec`)       | 285-292 | `blacksmith.md`                                                                                                                              |
| Magic (`AddMagicSystem`)           | 299     | `MagicPropLib.ini`                                                                                                                           |

Then `SuitEquipSystem.GetEquipBoxSuitProp` appends set bonuses (`EquipSystem.java:315`) and
`SetPlayerEquipProp` (321-336) sums the list **only for props with `PropType 0`** in
`EquipPropDefine.ini` (loaded 535-566, list built at 562); anything else is silently dropped.
The sums are written to the player's `<Name>Equip` fields, which `RefreshSystem` reads.

## Property names (`RES/Equip/EquipPropDefine.ini`, 58 rows)

`PropType` (`EquipDefine/EquipPropType.java`): 0 add/sub (summed), 1 append-not-repeat
(`AddSkillEquip`), 2 append (`EffectSkillEquip`), 3 player-ignore (`IsDecHardEquip`). All others are 0.

How each type-0 prop enters `RefreshSystem.java` 283-393 (characters.md formulas; `Mul` props are
added before the multiplier, `MulMul` props are the percent multiplier):

| Prop (`…Equip`)                                                                                                 | Formula term (RefreshSystem line)                          | Unit                   |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- |
| Strength, Agility, Stamina                                                                                      | `allstr/allagi/allsta` (354-356)                           | ×100 (2800 = +28)      |
| MaxHP, MaxMP                                                                                                    | added to `hpbase`/`mpbase` before the multiplier (357-358) | flat                   |
| MaxHPMul, MaxMPMul                                                                                              | multiplier `1000 + …` (357-358)                            | per mille (43 = +4.3%) |
| MinAtk, MaxAtk                                                                                                  | `(1 + atk adds)` (359-360)                                 | flat                   |
| AbsAddAtk                                                                                                       | added to both MinAtk and MaxAtk (293-294)                  | flat                   |
| MinAtkMul, MaxAtkMul, AbsAddAtkMul (both)                                                                       | attack multiplier `1000 + …` (295-296, 359-360)            | per mille              |
| AtkTimeMul                                                                                                      | `AtkTime / ((1000 + … ) * 0.001)` (361)                    | per mille              |
| AtkTime                                                                                                         | read (288) but **unused** in any formula                   | none                   |
| DodgeMul / DodgeMulMul                                                                                          | dodge add / percent multiplier (362)                       | rating / %             |
| HitMul / HitMulMul, CritMul / CritMulMul                                                                        | (363-364)                                                  | rating / %             |
| CritAttach                                                                                                      | `230 + …` (365)                                            | crit damage            |
| NeglectDefAttach, NeglectDefMul                                                                                 | `attach * (100 + mul) * 0.01` (366-367)                    | rating / %             |
| ParryMul / ParryMulMul                                                                                          | (368)                                                      | rating / %             |
| Pierce / PierceMul, Tough / ToughMul                                                                            | (369, 379)                                                 | rating / %             |
| Defense / DefenseMul                                                                                            | (370)                                                      | flat / %               |
| CounterBombMul, VampiricHP, DecDamage, AbsorptionDamage, ReboundAttach, PriorityMul, CounterMul (`5 + …`), Luck | plain sums (371-380)                                       | battle.md              |
| SkillAdd0..9                                                                                                    | `allskilladdN = skill + equip` (381-390)                   | see below              |
| ExpMul, CapMul, DropMul                                                                                         | plain sums (391-393)                                       | reward multipliers     |
| UseSkillMPOdds                                                                                                  | defined (`PropertyIndex.java:954`) but **read nowhere**    | none                   |

### SkillAdd (element boosts)

`SkillAddN` (N = skill element tree; client labels `SkillAdd0..4` as Fire, Water, Earth,
Lightning, Wind, `lg_SkillAddAllEquip%`) is used two ways:

- Skill probability: `prob + SkillAddN % 100` (`J/FightModule/SkillSystem.java:701`) for skills with
  `skilladdtype = N`. Every SkillAdd value in the set data is a multiple of 100, so this adds **0**.
- Skill scripts (82 files in `RES/javascript/skill/`): `x * (1 + 0.01 * ToInt(self.SkillAddN * 0.01))`,
  i.e. 3000 = +30% to that script's damage, chance or duration.

`SkillAddAllEquip` in a set expands to `SkillAdd0Equip..SkillAdd4Equip` with the same value
(`SuitEquipSystem.java:99-120`).

## Sets (`RES/Equip/SuitProp.ini`, `J/EquipModule/SuitEquipSystem.java`)

- `SuitProp.ini`: 145 rows, sections are row indexes; fields `ID` (set id = item `SuitID`),
  `Index` (pieces required), `PropName`, `PropValue`. Loaded keyed by `(ID, Index)`
  (`LoadResource` 159-208): a second row with the same `ID` and `Index` would replace the first
  (none exist). 61 set ids.
- Membership: an EquipItem's `SuitID` (item.ini). 62 suit ids appear on items; 8862 has bonuses but
  no items; 10001 and 10003 have items (level-1 test gear: i555555-i999999, i210050 etc.) but no
  bonuses.

### Counting and bonuses (`GetEquipBoxSuitIDType` 60-82, `GetEquipBoxSuitProp` 85-126)

```
count[suit] = number of EquipBox items with CheckEquipEffect true and SuitID > 0
for each suit: for i in 2..count[suit]: if a row (suit, Index = i) exists, apply it
```

| Rule                     | Detail                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Threshold                | a bonus with `Index = k` applies when `count >= k`; bonuses are cumulative (2-, 4- and 7-piece all apply) |
| Index 1                  | never applied (loop starts at 2); no row uses it                                                          |
| What counts              | equipped and active only (not broken, job and sex match); bag items never count                           |
| Enhance / identify level | irrelevant to the count                                                                                   |
| Duplicates               | one item per slot, so a set can count at most one weapon (10-piece sets have 3 class weapons → max 8)     |
| Skipped names            | `AddSkillEquip`, `EffectSkillEquip` (97); names that are not Player properties (`AddSkillComeOdds`, 8669) |
| Summing                  | same path as item props; non-type-0 props dropped in `SetPlayerEquipProp`                                 |

A second overload returning a `HashMap` (132-157) is never called and does not expand `SkillAddAllEquip`.

Index histogram: 2 (48 rows), 3 (22), 4 (32), 5 (13), 7 (23), 8 (7).

### All sets

Pieces: C Cloth, H Hat, S Shoes, A Amulet, G Glove, B Girdle (belt), R Ring, W Weapon (Sharp,
Fists, Blunt in that order). Bonuses are `Index: PropName value` in raw units (table above).
Line = first row in `SuitProp.ini`. Names: `lg_Suit_<id>` (`tools/i18n/en.json`).

| Set       | Name                                                   | Lv    | Pieces                                           | Bonuses                                                              | Line    |
| --------- | ------------------------------------------------------ | ----- | ------------------------------------------------ | -------------------------------------------------------------------- | ------- |
| 8160      | Oracle Outfit                                          | 13-20 | i281601-07 (CHSAGBR)                             | 2: Stamina 2800; 4: Strength 2800; 7: Agility 2800                   | 2       |
| 8161      | Tigerlord Outfit                                       | 13-20 | i281611-17 (CHSAGBR)                             | 2: CritMul 25; 4: HitMul 43; 7: Pierce 43                            | 20      |
| 8260      | Prajna's Outfit                                        | 23-30 | i282601-07 (CHSAGBR)                             | 2: Stamina 3200; 4: Strength 3200; 7: Agility 3200                   | 38      |
| 8261      | Fiendish Outfit                                        | 23-30 | i282611-17 (CHSAGBR)                             | 2: CritMul 27; 4: HitMul 47; 7: Pierce 47                            | 56      |
| 8360      | Nightmare Outfit                                       | 33-40 | i283601-07 (CHSAGBR)                             | 2: Stamina 3900; 4: Strength 3900; 7: Agility 3900                   | 74      |
| 8361      | Berserker Outfit                                       | 33-40 | i283611-17 (CHSAGBR)                             | 2: CritMul 30; 4: HitMul 51; 7: Pierce 51                            | 92      |
| 8362      | Kagura Outfit                                          | 33-40 | i283621-27 (CHSAGBR)                             | 2: MaxHP 19; 4: ParryMul 28; 7: SkillAdd0 3000                       | 110     |
| 8460      | Beryl Outfit                                           | 43-50 | i284601-07 (CHSAGBR)                             | 2: Stamina 4300; 4: Strength 4300; 7: Agility 4300                   | 128     |
| 8461      | Ogre Outfit                                            | 43-50 | i284611-17 (CHSAGBR)                             | 2: CritMul 32; 4: HitMul 53; 7: Pierce 53                            | 146     |
| 8462      | Outfit of Destruction                                  | 43-50 | i284621-27 (CHSAGBR)                             | 2: NeglectDefAttach 36; 4: CritMul 24; 7: SkillAdd0 3000             | 164     |
| 8560      | Radiant Outfit                                         | 53-60 | i285601-07 (CHSAGBR)                             | 2: MaxHP 38; 4: Stamina 4400; 7: Defense 56                          | 182     |
| 8561      | Frigid Outfit                                          | 53-60 | i285611-17 (CHSAGBR)                             | 2: AbsAddAtk 4; 4: Strength 4900; 7: CritMul 35                      | 200     |
| 8562      | Jadeglow Outfit                                        | 53-60 | i285621-27 (CHSAGBR)                             | 2: MaxHP 34; 4: ParryMul 32; 7: SkillAdd0 3000                       | 218     |
| 8660      | Glorious Outfit                                        | 63-70 | i286601-07 (CHSAGBR)                             | 2: Agility 5600; 4: MinAtk 8; 7: MaxAtk 15                           | 236     |
| 8661      | Sun Outfit                                             | 63-70 | i286611-17 (CHSAGBR)                             | 2: MaxHPMul 43; 4: Tough 33; 7: DodgeMul 54                          | 254     |
| 8662      | Bloody Outfit                                          | 63-70 | i286621-27 (CHSAGBR)                             | 2: NeglectDefAttach 45; 4: CritMul 27; 7: SkillAdd0 3000             | 272     |
| 8663      | Dragon Soul Sets                                       | 71    | i286631-40 (WWWCHSGBAR)                          | 3: CounterBombMul 0; 5: AbsorptionDamage 0; 8: SkillAddAll 1500      | 290     |
| 8664      | Dragon Soul Sets                                       | 21    | i298001-10 (WWWCHSGBAR)                          | same as 8663                                                         | 308     |
| 8665      | Dragon Soul Sets                                       | 31    | i298101-10 (WWWCHSGBAR)                          | same as 8663                                                         | 326     |
| 8666      | Dragon Soul Sets                                       | 41    | i298201-10 (WWWCHSGBAR)                          | same as 8663                                                         | 344     |
| 8667      | Dragon Soul Sets                                       | 51    | i298301-10 (WWWCHSGBAR)                          | same as 8663                                                         | 362     |
| 8668      | Dragon Soul Sets                                       | 61    | i298401-10 (WWWCHSGBAR)                          | same as 8663                                                         | 380     |
| 8669      | Kage Sets                                              | 81    | i298901-10 (WWWCHSGBAR)                          | 3: AddSkillComeOdds 200; 5: UseSkillMPOdds 1500; 8: SkillAddAll 2000 | 398     |
| 8760      | Streamray Outfit                                       | 73-80 | i287601-07 (CHSAGBR)                             | 2: MaxAtk 19; 4: MaxHP 83; 7: Strength 12200                         | 416     |
| 8761      | Empty Soul Outfit                                      | 73-80 | i287611-17 (CHSAGBR)                             | 2: MaxAtk 19; 4: MaxHP 83; 7: Agility 12200                          | 434     |
| 8762      | Exorcism Outfit                                        | 73-80 | i287621-27 (CHSAGBR)                             | 2: MaxAtk 19; 4: MaxHP 83; 7: Stamina 12200                          | 452     |
| 8763      | Angelic Union                                          | 73-79 | i286651-55 (CHSGB)                               | 3: DodgeMul 64; 5: AtkTimeMul 55                                     | 470     |
| 8764      | Dragon King                                            | 73-79 | i286661-65 (CHSGB)                               | 3: MinAtk 22; 5: NeglectDefAttach 55                                 | 482     |
| 8765      | Sacred Army                                            | 73-79 | i286671-75 (CHSGB)                               | 3: ParryMul 65; 5: Defense 69                                        | 494     |
| 8766      | Angelic Union                                          | 83-89 | i286681-85 (CHSGB)                               | 3: DodgeMul 68; 5: AtkTimeMul 60                                     | 506     |
| 8767      | Dragon Lord                                            | 83-89 | i286691-95 (CHSGB)                               | 3: MinAtk 28; 5: NeglectDefAttach 62                                 | 518     |
| 8768      | Sacred Army                                            | 83-89 | i286701-05 (CHSGB)                               | 3: ParryMul 70; 5: Defense 77                                        | 530     |
| 8860      | Lament Melody                                          | 83-90 | i288601-07 (CHSAGBR)                             | 2: MaxAtk 25; 4: MaxHP 91; 7: Strength 13000                         | 542     |
| 8861      | Harvest Bugle                                          | 83-90 | i288611-17 (CHSAGBR)                             | 2: MaxAtk 25; 4: MaxHP 91; 7: Agility 13000                          | 560     |
| 8862      | Gods Weep                                              | -     | none (client lists i288621-27, not in item.ini)  | 2: MaxAtk 25; 4: MaxHP 91; 7: Strength 13000                         | 578     |
| 8863      | Thunder Storm                                          | 83-90 | i288631-37 (CHSAGBR)                             | 2: MaxAtk 25; 4: MaxHP 91; 7: Agility 13000                          | 596     |
| 9210      | Beastlord Outfit                                       | 21    | i292101-04 (CHSA)                                | 2: MaxMP 13; 3: DodgeMul 40; 4: ParryMul 40                          | 614     |
| 9310      | Gilded Outfit                                          | 31    | i293101-04 (CHSA)                                | 2: MaxMP 24; 3: DodgeMul 44; 4: ParryMul 44                          | 632     |
| 9311      | Tengu Bamboo Hat Outfit                                | 31    | i293111-14 (CHSA)                                | 2: Tough 32; 3: AtkTimeMul 20; 4: Defense 34                         | 650     |
| 9410      | Quicksilver Outfit                                     | 41    | i294101-04 (CHSA)                                | 2: MaxMP 33; 3: DodgeMul 47; 4: ParryMul 47                          | 668     |
| 9411      | Ferocious Outfit                                       | 41    | i294111-14 (CHSA)                                | 2: Tough 35; 3: AtkTimeMul 25; 4: Defense 43                         | 686     |
| 9412      | Deity's Outfit                                         | 41    | i294121-24 (CHSA)                                | 2: Stamina 3800; 3: Strength 3800; 4: Agility 3800                   | 704     |
| 9510      | Cosmic Outfit                                          | 51    | i295101-04 (CHSA)                                | 2: MaxMP 45; 3: DodgeMul 51; 4: ParryMul 51                          | 722     |
| 9511      | Oni Outfit                                             | 51    | i295111-14 (CHSA)                                | 2: Tough 42; 3: AtkTimeMul 30; 4: Defense 53                         | 740     |
| 9512      | Balanced Outfit                                        | 51    | i295121-24 (CHSA)                                | 2: Stamina 4400; 3: Strength 4400; 4: Agility 4400                   | 758     |
| 9513-9517 | Fire / Water / Earth / Lightning / Wind Outfit         | 61    | i210113-17 (A) + i300118-22 (R), paired in order | 2: SkillAdd0..4 1500 (one element each)                              | 776-800 |
| 9518-9520 | Azure Dragon / Vermilion Bird / Black Tortoise Costume | 71    | i210118-20 (A) + i300123-25 (R)                  | 2: Strength / Agility / Stamina 6100                                 | 806-818 |
| 9521-9525 | Fire / Water / Earth / Lightning / Wind Release Sets   | 81    | i210121-25 (A) + i300126-30 (R)                  | 2: SkillAdd0..4 2000                                                 | 824-848 |
| 9526-9528 | Azure Dragon / Vermilion Bird / Black Tortoise Sets    | 81    | i210126-28 (A) + i300131-33 (R)                  | 2: Strength / Agility / Stamina 7200                                 | 854-866 |

Per-piece `UseLevel` varies inside the 7-piece sets (e.g. 8160: Cloth 17, Hat 13, Shoes 15,
Amulet 14, Glove 18, Girdle 19, Ring 20). All set pieces have `Sex 2`; armour has `UsePopsinger 7`,
weapons 2 (Sharp), 4 (Fists), 1 (Blunt).

### Where pieces come from (`DropItemLib.ini` → monsters / boxes)

No set piece drops from a field monster placed by `RefresNpc.ini` (21xx-28xx), from explore spots or
from quest rewards. Set availability depends on toll gates, arena and packs:

| Sets                 | Source                                                                                                                                                                                     | Milestone                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 8160-8862 (7-piece)  | toll-gate monsters (`n30x153`, `n60x153`… in `RES/scene/clonescene/MonsterGroup.ini`) and toll-gate card chests (Gold/Orange/Blue Equipment Chest i150500-i150525, `TGCardDropLib.ini:17`) | M3 (toll gates)                                  |
| 8663-8669, 8763-8768 | packs only (Dragon Soul i152089-92 / i159062-64, Kage i159111-13, Angelic/Dragon/Sacred i152132-37, i159205-07)                                                                            | origin of the packs unknown (likely mall/events) |
| 9210-9512 (4-piece)  | arena prizes (`RES/compete/competeprize.ini`, `scoreprize.ini`)                                                                                                                            | M4                                               |
| 9513-9528 (A+R)      | packs (i152064-76, i152093, i152126, i159071-80)                                                                                                                                           | unknown                                          |

Toll gate → sets shown in its preview (`DT/tollgoteequipsuit.s26644.tab`, 20 rows,
`ConfigID` = toll gate id in `TollGate.ini`):

| Toll gates (all difficulties) | Name (`lg_TollGate_*`) | Levels | Sets       |
| ----------------------------- | ---------------------- | ------ | ---------- |
| 100001, 100021                | Valhalla Camp          | 16-25  | 8160, 8161 |
| 100002, 100022                | Endless Sea Forests    | 26-35  | 8260, 8261 |
| 100003, 100023                | Crimson Grassland      | 36-45  | 8360-8362  |
| 100004, 100024                | Deadwood Villa         | 46-55  | 8460-8462  |
| 100005, 100025, 100035        | Night of Valhalla      | 56-65  | 8560-8562  |
| 100006, 100026, 100036        | Windstorm Desert       | 66-75  | 8660-8662  |
| 100007, 100027, 100037        | Desperate Forest       | 76-85  | 8760-8762  |
| 100008, 100028, 100038        | The Lost Realm         | 86-95  | 8860, 8861 |

100000 (Decadent Nest, 11-20) has no set row.

## Client presentation

| What                     | Source                                                                          | Behaviour                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item name                | `C/Common/PublicData.as:1574-1600` `GetItemName`                                | set items use `TipNameSuit0` / `TipNameSuit` (green `#00a03c`) instead of `TipName0`                                                                                                                                                                                                                                                      |
| Set block in the tooltip | `C/Common/Tip/TipCallBack.as:1442-1600` `onTipSuitID`                           | `lg_Suit_<id>`, then one line per bonus sorted by Index: `TipSuitPro<Index-1>` ("N-piece effect", green) when reached, `TipSuitProEx<Index-1>` (grey) otherwise; `…Ng…` keys for negative values; `%` appended when the prop label contains `%`; then the piece names (`TipSuitElement` for the hovered piece, `TipSuitElementEx` others) |
| Piece count              | same                                                                            | counted only when the hovered item sits in the Equip view: one per set config the player has equipped (`EquipHaveItem`). No durability/job check, so it can differ from the server                                                                                                                                                        |
| Value format             | `TipCallBack.as:974-993` `getValueS`                                            | Str/Agi/Sta `/100`; AbsAddAtkMul, AtkTimeMul, MaxHPMul, MaxMPMul `/10` with one decimal; SkillAddN and SkillAddAll `/100`; others raw                                                                                                                                                                                                     |
| Bonus rows               | `C/Common/ClientTip/ClientTipSystem.as:112-148`                                 | from `DT/equipsuitpro.s36180.tab` (copy of SuitProp.ini, row 0 is a Chinese header)                                                                                                                                                                                                                                                       |
| Piece lists              | `DT/equipsuit.s36180.tab` (61 rows)                                             | `ID`, `EquipElement` (comma list of item ids), `EquipElementName` (`Suit_<id>`)                                                                                                                                                                                                                                                           |
| Toll gate set preview    | `C/GameUI/TollGate/ChallengeFrame.as:201-204`, `UI_EquipSuitShowFrame.as:49-54` | "view sets" button in the toll gate window lists the sets of `tollgoteequipsuit` for that gate                                                                                                                                                                                                                                            |

## Ambiguities

| Topic                                | Candidates                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dragon Soul 3- and 5-piece (value 0) | (a) placeholders: the server adds 0, the tooltip shows "Shortens debuff duration" / "Increases attack and speed when HP is below 30%" (`lg_CounterBombMulEquip%`, `lg_AbsorptionDamageEquip%`) with no effect; (b) the effect lived in code not in the backup. No Java or script reads these props beyond plain sums. Port (a). |
| Kage 3- and 5-piece                  | `AddSkillComeOdds` is not a Player property (dropped); `UseSkillMPOdds` is summed nowhere. Both do nothing in the original.                                                                                                                                                                                                     |
| SkillAdd in set bonuses              | probability bonus is `value % 100 = 0`; only script multipliers apply. Faithful port keeps the `% 100`.                                                                                                                                                                                                                         |
| `AtkTimeEquip`                       | read but unused (only `AtkTimeMulEquip` matters). No set or item uses it.                                                                                                                                                                                                                                                       |
| 8862 Gods Weep                       | bonuses and client row exist, items i288621-27 do not. Skip.                                                                                                                                                                                                                                                                    |
| Client vs server count               | client ignores broken/wrong-job pieces' state; server is authoritative.                                                                                                                                                                                                                                                         |

## Import

| New file (`server/data/game/`) | Source                                    | Shape                                                     |
| ------------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| `equip-suits.json`             | `RES/Equip/SuitProp.ini`, grouped by `ID` | `{ "<suit>": [{ Index, PropName, PropValue }] }`          |
| `equip-props.json`             | `RES/Equip/EquipPropDefine.ini`           | `{ "<row>": { PropName, PropType } }`                     |
| `tollgate-suits.json`          | `DT/tollgoteequipsuit.s26644.tab`         | rows `{ ConfigID, SuitID: "8160,8161" }` (client preview) |

Slot order (`EquipDefine.ini`) is 8 constants; piece lists derive from `items.json` `SuitID`, so
`equipsuit.tab` is not needed. `game-core/src/stats.ts` `Bonuses` covers only part of the table
above (no Pierce, Tough, NeglectDef, Defense multiplier, separate Min/Max attack multipliers,
MulMul for hit/crit, SkillAdd, vampiric/absorb/rebound/decdamage, Exp/Cap/Drop mul); a general
"sum `…Equip` props by name" step feeding `deriveStats` is needed for sets, identify, inscribe and
jewels alike.
