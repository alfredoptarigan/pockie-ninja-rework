# Original data: characters, outfits, stats, levels, skills

Reference for the importer and the character model. RES = `app/code/props/serv/game/Resource`,
J = decompiled server, C = decompiled client, DT = `apache/source/binary/datatable`.

## Character creation

- Offered outfits: the first 10 rows of `DT/creatrole` (s30124 assumed live; s25585 has the same
  first 10): Cloth 39, 65, 32, 3, 17, 63, 9, 14, 34, 16 with Sex 1,1,1,0,0,1,0,0,1,0 (5 per sex;
  0 male "Cowok", 1 female "Cewek"). `Cloth == AvatarID` for these rows; `Pos` is the weapon class
  (1 Blunt, 2 Sharp, 4 Fists, 7 All). Default: row 0; typing a name picks
  `MD5(name).charCodeAt(0) % 10` unless the player chose manually (`CreatRoleBase.as:708`).
- Name (client): not empty, banned-word check, at most 12 UTF-8 bytes, no spaces, no
  `\ ' * " { } :`. Server replies: 2 exists, 3 too long, 4 error, 5 illegal, 6 full. (Our rule:
  3-12 `[A-Za-z0-9_]`, unique case-insensitive.)
- Server (`CreateRoleSystem.java:76`): stores Sex, Nation, clothing. First login maps clothing via
  `RES/Equip/avatarclothingmap.ini` to an avatar item, whose `AvatarID` becomes the player's.
- Starting values (`firstset.js`): currencies 0, `HPContainerMax=50`, `MPContainerMax=30`; Level 1;
  30 empty skill rows; no starting items except the outfit (`playerInit.js` is empty).
  `minnation()` gives 58 Gift Coupons for joining the least-populated village when the largest has
  more than 800 players.
- Village: `Common_Nation_0..4` = Desa Api / Air / Tanah / Angin / Petir. Client pre-selects the
  least-populated village; the server moves players when `max > 800 && chosen >= 2 * min`.
  Start scene (`nationscene.ini` login): 0 → 111, 1 → 121, 2 → 151, 3 → 141, 4 → 131.

## Stats: `RES/role/RoleInitProperty.ini` (section id = AvatarID)

- 3840 sections: every outfit × upgrade tier +0..+31. AvatarID for clothing 1-100 is
  `tier*100 + clothing`; clothing 101-120 is `4000 + tier*20 + (clothing - 100)`.
  `base_N = base_0 + 8*N*Up` (`AvatarSystem.java:291`).
- Fields: `Strength`/`Agility`/`Stamina` (×100), `StrengthUp`/`AgilityUp`/`StaminaUp` per level,
  `MaxHP`/`MaxMP` + `MaxHPUp`/`MaxMPUp`, divisors `MaxHPAdd`, `MaxMPAdd`, `StrAtkAdd`,
  `AgiAtkAdd`, `DodgeAdd`, `StrParryAdd`, base `AtkTime`, `Popsinger` (weapon class).
  `StrDefAdd` is unused. Client copy: `DT/rolebase.s33651.tab`.

### Formulas (`RefreshSystem.java`, integer division, L = level)

- `str = Strength + L*StrengthUp + StrengthAdd` (same for agility, stamina);
  `hpbase = MaxHP + L*MaxHPUp` (lines 154-158). Final stat = base + skill + buff + equip + collection.
- HP: `(hpbase + adds) * (1000 + allsta/MaxHPAdd*10 + muls) * 0.001` (357).
- MP: same shape but uses the collection HP multiplier (original bug, 358).
- Min/MaxAtk: `(1 + atkAdds) * (1000 + allstr/StrAtkAdd*10 + muls) * 0.001` (359-360); base 1, so
  weapons provide damage.
- AtkTime: `AtkTime / ((1000 + allagi/AgiAtkAdd*10 + muls) * 0.001)` (361).
- Dodge: `(allagi/DodgeAdd + muls) * (100 + mulmul) * 0.01` (362).
- Parry: `(allstr/StrParryAdd + muls) * (100 + mulmul) * 0.01` (368).
- Hit, Crit, Defence: only gear, skills, buffs, collection. `CritAttach = 230 + …`,
  `CounterMul = 5 + …`. Current HP/MP clamp to the new max.

## Levels

- `RES/role/LevelExp.ini` `[levelexp]` keys 1-100, `[role] maxlevel=90`. EXP is per level and
  resets on level-up; L → L+1 costs key `L+1` (1→2 = 15, 89→90 = 129,442,842).
- Level-up (`LevelSystem.java:237`): recompute stats, refill HP/MP, learn one random secondary
  skill; at multiples of 10 learn/upgrade a random primary skill (`UpSkilCfg.ini` Precursor=1).
  Stat points are dead (`LevelPoint.ini` all 0).

## Outfits

- Item config: `i29` + 4-digit AvatarID up to 1900 (`i290045`, `i291045`), `i29` + AvatarID + `0`
  above (`i2940450`). Fields: `AvatarID`, `AvatarLevel` (tier + 1), `Clothing` (1-120 visual),
  `Name=avatar<ID>`.
- `RES/Equip/AvatarAddSkill.ini` `[itemConfig]`: `SkillID1..4`, `RecastSkillID1/2` (recast 2 / 3
  replace the last skill). Naruto `[i290045]`: 1945 (ultimate), 7777 (parry), 8888 (init),
  2042 (passive); recast 2043 / 2044. Tiers keep the same skills.
- Names: `lg_avatar<AvatarID>` = "Name ＋N" (tier names); `lg_name_avatar<clothing>` = base name.
  Named clothing slots: 1-72, 74, 76, 84-90, 98, 103-109, 111, 113, 114 (the rest are unnamed).
  Clothing 103 is AvatarID 4003 (Kakuzu); AvatarID 103 is Ggio Vega +1.

## Skills: `RES/skill/skill.ini` (1098 sections, `FightModule/SkillInfo.java:123`)

- Fields: `secondid` (family), `level`, `type` (1 active, 2 trigger, 3 passive), `quomodo`
  (trigger moment; 2 = normal attack), `probability` (≥ 100 always), `priority`, `effect`,
  `decmp` (MP cost), `canbecounter`, `mul`/`add`/`selfmul`/`selfadd`, `skilladd` (→ `skilladd.ini`),
  `skilladdtype`, `ispet`, `javascript`. No cooldown or target fields (scripts handle them).
- Player skill id = `(level - 1) * 10000 + secondid`. Slots: 3 trees × 10 rows, positions 0-5 usable.
- Keys: `lg_Skill_<id>`, `lg_SkillDes_<id>`, `lg_SkillName_<id>`, `lg_SkillName_<fake>_Fake`.
- `DT/clientskill.s34542.tab` (FakeID, MaxLevel, PreID, NextLevelID, Type 1 panel / 2 ultimate /
  3 pet / 4 stage monster), `DT/clientskillid.s34542.tab` (ID, FakeID, Level, NextLevelID, MPCostMul).

## Monsters (`RES/npc/npc.ini`)

Final stats under the player output names: MinAtk/MaxAtk, AtkTime, DodgeMul, HitMul, CritMul,
CritAttach (230), ParryMul, Defense, Pierce, Tough, NeglectDefAttach, CounterMul, MaxHP/HP,
MaxMP/MP, Level, NpcExp, drops. Skills from `npcrecord.ini` (AttackSkill / TriggerSkill →
`npcrecordvalue.ini`). n33017: Lv 2, HP 15, Atk 9-10, AtkTime 1004, Def 71, Exp 8; AttackSkill
1018 → 40027, TriggerSkill 1000 → 7777, 8888, 1.

## Example: Naruto (AvatarID 45, +0)

Str 2800/+140, Agi 2400/+120, Sta 2400/+120, Popsinger 4 (Fists), MaxHPAdd 1200, StrAtkAdd 1200,
AgiAtkAdd / DodgeAdd 1500. Level 1 without gear: HP 224, attack multiplier 1.02, AtkTime 990,
Dodge 1, Parry 2.
