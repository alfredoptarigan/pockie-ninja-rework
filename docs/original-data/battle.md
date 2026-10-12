# Original data: battle engine

Reference for the `game-core` fight engine. F = decompiled `FightModule/`, RES = `Resource/`.

## Flow (`FightSystem.java` ObjFight 423-534)

- Fighters get global indexes (attackers 0..n-1, defenders after). `Tough = ceil(Tough / 1.5)`.
  Skills copied and sorted by ascending `priority` (stable). Type 3 passives only matter for the
  replay. Pets merge their skills into the owner; they are not separate fighters.
- HP/MP: PvP starts full; PvE uses the player's current HP/MP and writes it back.
- **Sequential 1v1 duels** while both sides have fighters left. Each duel starts by removing all
  buffs of both current fighters (event 9). On timeout (60 actions) the lower HP percentage
  (`HP*100/MaxHP*100`, integer) loses; **a tie kills the target**. Target dies → event 20, next
  target event 21; then attacker dies → 20 / 21. The survivor keeps HP/MP.
  `win = selfdie == selfcount ? 0 : 1` (both dying on the last pair = attacker wins).

### Timeline (`Fight`, 1141-1185)

```
self.Next = self.AtkTime; tgt.Next = tgt.AtkTime
begin-fight skills (q1): self then target; stop if anyone died
i = min(self.AtkTime, tgt.AtkTime)
for j in 0..59:                              // MaxBout = 60 actions, both sides
  sA |= i == self.Next; tA |= i == tgt.Next
  if sA && tA: if RandInt(0,100) >= RandInt(0,100) then sA = false else tA = false
  if sA: ok = act(self, tgt, i); self.Next += self.AtkTime; sA = false
  else:  ok = act(tgt, self, i); tgt.Next += tgt.AtkTime; tA = false
  i = min(self.Next, tgt.Next)
  if !ok: break
```

`ChangeAtkTime`: `AtkTime = (int)(InitAtkTime*100f/(100+mul)) - add`.

### One action (`AttackTarget`, 1377-1407)

1. Actor's buffs tick (type 2 → event 9 + OnActivation; expired buffs removed when
   `timer > StartTime + LifeTime`, LifeTime -1 = permanent). Stop if the actor died.
2. `CanMove <= 0` → event 3, end.
3. Event 1. Priority strike: if the defender can move and use skills and
   `RandInt(1,100) + actor.PriorityMul <= defender.PriorityMul`, the defender attacks normally
   (event 5, no counter) and the turn ends (event 2).
4. Defender triggers q3, actor triggers q2, then the attack skill, then event 2.
   Any HP <= 0 ends the duel.

## Skill choice (`SkillSystem.java`)

- skill.ini: `type` 1 active / 2 trigger / 3 passive; `quomodo`; `priority`; `probability`;
  `effect`; `decmp`; `canbecounter`; `mul`, `add`, `selfmul`, `selfadd`; `javascript`.
  Section `[1]` = normal attack (mul 1, quomodo 2, can be countered).
- Effective probability `prob + (SkillAddN % 100)`.
- Active pick (`FindAttackSkill` 570): `CanMove <= 0` → none; `CanUseSkill <= 0` → skill 1;
  skip quomodo 2 when `CanAttack <= 0`; probability >= 100 → must-skills (tried in priority order,
  first success wins); the rest weighted: if sum < 100, `r = RandInt(0,100)`, `r > sum` → normal
  attack, else `r = RandInt(0,sum)`; pick first with `acc < r <= acc + p`; r = 0 → normal attack.
  A failed skill falls back to skill 1.
- After an `effect == 1` physical (q2) hit: actor q7, actor q8, defender q9 triggers.
- Trigger quomodo: 1 fight begin (all run, scripts roll), 2 before own attack, 3 before being
  attacked, 4 on being damaged, 5 on death (HP set to 0 first; scripts may revive), 7/8/9 after hit.
- MP: `decmp` is almost always 0; scripts compute and deduct MP themselves.
- Script-less skills: `Attack(self, tgt, (int)(dmg*mul+add), (int)(dmg*selfmul+selfadd))`.
- Counter (1413): if `canbecounter`, hit, and target can attack: `RandInt(1,100) <= CounterMul` →
  normal attack, event 7, no counter of a counter.
- Generic skills on every fighter: **8888** (q1, status-immunity bookkeeping, rolls parry),
  **7777** (q4 parry: `Chance = (ParryMul - attacker.Pierce)/16`; if `RandInt(0,99) < Chance`
  and no buff 11841, add 11841 with `SaveData = attacker.InitAtkTime*0.6`; returns LOSE).
  Buff 11841: `Parry = 40`, consumed by the next hit, then adds 11851 and delays the attacker.

## Damage (`Attack` 1440-1492, `Damage.java`)

1. Stop if target HP <= 0 or both damages are 0.
2. Hit: `hit = T.Dodge <= A.Hit ? 100 : 100 - (int)((dodge - hit)/16f)`; miss if
   `RandInt(1,100) > hit` (IsHit = 0).
3. Crit: `c = CritMul - T.Tough`; if `c > 0` and `RandInt(1,100) <= c/16` (int):
   `m = (CritAttach + c*0.125f*0.01f) * 0.01f`; if `m > 1`, `d = (int)(d*m)`. CritAttach 230 base.
4. `back = Rebound > 0 ? (int)((float)(d*T.Rebound)*0.01f) : 0`;
   `absorb = (int)((float)(d*T.AbsorptionDamage)/100f)` (both before mitigation).
5. `d = (int)(d*(1 - min(T.DecDamage,100)/100f))`.
6. Parry: `T.Parry > 0` → `IsParry = T.SaveSkillID`, `d = (int)((double)(d*(100-Parry))*0.01)`.
7. Defence: `def = max(-1353, T.Defense - A.NeglectDefAttach)`;
   `d = max(0, (int)(d*(1 - def/(def+1354))))`.
8. Shield (1494, only while a type 3 buff is `ShieldBuff`): `dmg >= ShieldDamage` → subtract and
   remove the shield; otherwise absorb all, decrement ShieldCount (remove at 0, -1 unlimited).
   Absorbed amounts go to `TargetShield` / `SelfShield`.
9. Rebound `back` mitigated by the attacker's DecDamage and defence (`BackDamage` is written here),
   then by the attacker's shield. `selfhp = (int)(sd*A.AbsorptionDamage/100f)` first runs through
   the target's shield (bug: it drains it, and the call with 0 still decrements ShieldCount), then
   the target's DecDamage and defence.
10. Vampiric: `inchp = (int)(A.VampHP*0.01f*(d - absorb))` (MP too, uncapped). Float order
    matters: `20*0.01f` rounds to 0.19999999f, so 20 % of 100 gives 19.
11. `lastT = d - absorb`, `lastS = back + sd - selfhp - inchp` (negative heals), HP clamped to
    `[0, MaxHP]`. Clear the target's type-2 buffs; type-1 buffs when damaged. If `d > 0` and both
    alive, fire the target's q4.

- `SelfLastDamage = lastS + inchp`, `TargetLastDamage = lastT` (the port's `damage`). Self damage
  comes from `selfmul`/`selfadd` of script-less skills or the scripts' `Attack(..., selfdamage)`.
- Damage roll: `MaxAtk <= MinAtk ? MaxAtk : RandInt(MinAtk, MaxAtk)`.
  Check: 1848 vs Def 154 → `1848*(1 - 154/1508) = 1659` (matches a sample replay).

## Buffs (`RES/skill/FightBuff.ini`, `BuffSystem.java`)

`type` 1 stat/flag (script), 2 ticks each action, 3 shield; `replace` group (adding removes the
group); `cleartype` 1 removed when damaged, 2 removed when hit; `lifttime` in timeline units
(-1 permanent); `javascript` with `OnAdd` / `OnActivation` / `OnRemove(fs, obj, buff, fv, timer)`.
`buff.ini` and `UnFightBuff.ini` are not used in fights.

Turn flags `CanMove` / `CanAttack` / `CanUseSkill` start at 1; buffs lower and restore them.
`CanMove <= 0`: the action is event 3 only. Triggers q2-q9 and the priority strike need
`CanMove > 0 && CanUseSkill > 0` (q5 then does not even zero the HP); begin-fight skills ignore the
flags. `FindAttackSkill`: `CanUseSkill <= 0` → normal attack without a roll; `CanAttack <= 0` drops
quomodo 2 skills and the normal attack (a failed skill still falls back to it). Counters need
`target.CanAttack != 0`. Scripted `UserSkill` returns 2 when the flags forbid the skill.

The 136 rows are imported to `server/data/game/fight-buffs.json` (`validity` must be 1 or 2 for
`AddFightBuff` to add the buff; `overlying` is unused in fights). `game-core/src/battle/buffs.ts`
joins them with the ported scripts by the `javascript` path; rows without a ported script are
markers only (added, replaced, expired, cleared). Ported scripts: 8888, 11801 paralysis marker,
11802 freeze (CanMove, Dodge -9999, DecDamage -= SaveData-100, cleartype 2), 11811 poison, 11812
seal (marker, LifeTime = SaveData), 11813 stun / 11815 seduction (CanMove, LifeTime = SaveData),
11817 needles (Rebound +25), 11824 earth wall (Parry 40, Rebound +60), 11826 daze (CanAttack +
CanUseSkill, cleartype 1), 11830 interrupt (Pierce -= SaveData; Burrow adds it with SaveData 0),
11831 static barrier (type 3, ShieldDamage = SaveData, ShieldCount 999), 11841, 11843, 11851. The
regeneration auras 11861-11863 (pets) shorten the stuns and heal by `SaveData1`, which only pet
skills set; not ported (no pets in the slice).

## Scripts (Rhino, `RES/javascript/skill/*.js`)

`OnUser(fightsystem, self, target, skill, fv, timer)` returns 0 success, 1 no mana, 2 can't use,
3 lose. Most used: `GetBuff`, `LogicTool.RandInt`, `LogicTool.ToInt`, `Damage`, `Math.pow`,
`RemoveBuff`, `AddBuff`, `ChangeSkill`, `UserSkill`, `Attack`. Scripts write fighter fields
(`HP`, `MP`, `CanMove`, `CanAttack`, `CanUseSkill`, `Parry`, `ShieldDamage`) and `fv` fields.
Examples: Fireball 1808 (own MP cost, falls back to skill 1 when sealed, adds burn 11804);
Heal 3803 (q5 revive with `HP = MaxHP*0.25`).

Monster skills of the 2101-2501 fields (`game-core/src/battle/scripts/monster-skills.ts`, all the
`AttackSkill` / `TriggerSkill` records of the 53 spawned monsters): Heal 40020 (MaxHP * 0.1, normal
attack at full HP), Bite 40023 (poison), Combo Hit 40024 / 40042 (60 % two strikes x1.1, else three
x1.2), Sun Fist 40027 (blind), Crush 40028 (x0.8, 2-unit stun on a hit), Burrow 40029 (q3 trigger:
own roll `RandInt(0,100) < 8*MaxMP*T.AtkTime/18000`, damage `MaxMP*0.19`, interrupt 11830), Blade
Light 40031 / 40037-40040 (break earth wall, x1.2), Launch 40033, Combo Slash 40032 / 40036. Each
costs a share of MaxMP (truncated into `MP` / `DecMP`) and falls back to skill 1 without it, except
Burrow which just fails. Explore-spot variants (`n330261`, ...) only have 1 / 7777 / 8888.

Outfit ultimates `skill_aoyi_<id>.js` (must-skills, quomodo 1, never countered): execute chance from
the avatar-level gap: `HPCond = 15 + gap^1.26`, `Prob = 10 + gap^1.2`; if `RandInt(0,99) < Prob`
and `HP < MaxHP*HPCond%`, damage `RandInt(300,500)/100*T.HP` (truncated). Avatar level: players
`getAvatarLevel(PlayerAvatarID)`, NPCs `CounterBombMul` unless -1, else `Level/3 - 5`.
66 scripts (1902, 1903, ...) have the +9 branch commented out. 48 (1901, 1904, 1905, 1908, 1924,
1927, 1929-1931, 1935, 1937, 1944-1951, 1953, 1955-1958, 1967, 1970, 1972, 1974, 1984-1987, 1990,
1998, 2201-2214) run it (verified: each group is byte-identical apart from the ids and blank
lines, so `scripts/execute.ts` covers all 114 outfit ultimates): at avatar level >= 9,
`RandInt(0,99) < 50` → `ChangeSkill(skill, id*10)`

- `UserSkill` (a damage roll, then the flag checks). The 114 "new ultimates" `skill_aoyi_<id*10>.js`
  (skill.ini: probability 0, same row otherwise) deal the same damage unconditionally and show their
  own id. 2215-2220 and 22150-22200 have skill.ini rows but no script in the backup, so the original
  server fell back to the normal attack (JsRunFun returns null → 3).

Recast skills (`AvatarAddSkill.ini` `RecastSkillID1/2`, e.g. 2003 / 2004) and the fourth outfit
skill are type 3 passives without scripts: their `skilladd.ini` rows (`SkillAdd0Skill`,
`VampiricHP`, `CounterMul`, ...) are stat bonuses applied outside the fight engine.

## Randomness

One unseeded `java.util.Random` (`RandInt(a,b) = a + nextInt(b-a+1)`), shared by Java and scripts.
Original replays cannot be re-simulated. Order per action: buff scripts, priority roll, q3 roll,
q2 roll, skill pick, damage roll (if Max > Min), hit roll, crit roll (if c > 0), script rolls,
q4 / counter rolls.

## Replay (`FightSave.SaveFile` 91-250)

`{ reason, fightscene, role: { "0": {...} }, value: { "0": {...} } }`.

- role: initial stats, Name, Level, Sex, Nation, HP/MaxHP, MP/MaxMP, Clothing, AvatarType, rates,
  Min/MaxAtk, Defense, AtkTime, ResourceID, Offense (1 attacker side), Pierce, Tough, ParryMul,
  Weapon, `Skill: { "0": id, ... }`.
- value: RoleIndex, Event, and when non-zero Damage, SkillId (secondid), IsHit (absent = miss),
  IsParry, IsCrit, shields, IncHP, IncMP, DecMP, TargetDecMP, BackDamage, SelfLastDamage,
  TargetLastDamage, addbuff / delbuff with role indexes.
- Events: 1 begin action, 2 end action, 3 cannot move, 5 priority strike, 6 script special,
  7 counter, 9 buff tick/change, 14 skill, 20 death, 21 next fighter.
- Samples: `apache/source/dazhao/*.fight`.

## Known original bugs (decide per case)

Timeout tie kills the target; `selfhp` drains the target's shield and every absorbed hit decrements the
target's ShieldCount twice; vampiric MP uncapped; parry applies before defence; 474 skill + 172
buff scripts need per-script ports (port only what the slice uses).
