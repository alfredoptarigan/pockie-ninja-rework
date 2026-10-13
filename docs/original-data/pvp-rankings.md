# Original data: PvP and rankings

Reference for milestone 4 (Social & Competition): the arena with its ranking, player duels, the
Challenge Zone, the World Tournament, the National League, the weekly toll gate ranking and the
Rankings window. G = `~/Privates/game-pockieninja`, J = decompiled game server
(`service/com/d2/serv/game`), P = decompiled domain server (`service/com/d2/serv/pubdata`),
RES = `app/code/props/serv/game/Resource`, C = decompiled client scripts
(`local-run/.runtime/swf/LittleNinjasClient/scripts`), DT = `apache/source/binary/datatable`.
English text comes from `tools/i18n/en.json` (keys carry an `lg_` prefix there). Battle rules
are in `battle.md`; the toll gate run itself is in `toll-gates.md`.

Raw scores are integers; the client shows them divided by 100 (`ArenaInfoPanel.as:237-239`), so
the starting score 93500 reads "935.00". Capital type 0 = Stone, 2 = Gold, 5 = Honor
(`Common_Money5`; `ScorePrize_SI_*` calls it "medals").

## 1. Overview

| Mode (client name)                             | Server                                                 | Opponent                                     | Live or snapshot                 | Defender online? | Reward                                      |
| ---------------------------------------------- | ------------------------------------------------------ | -------------------------------------------- | -------------------------------- | ---------------- | ------------------------------------------- |
| Arena (`UI_ArenaTop`, NPC menu "Enter Arena")  | J/CompeteModule/CompeteSystem, P/Compete/CompeteServer | 18 listed NPCs or players, boss, Fortune Cat | attacker live, defender snapshot | no               | score (Elo), Honor per fight, chests, tiers |
| Ninjutsu Duel (`UI_PlayerPK`, profile "PK")    | CompeteSystem `OnCustomFriendFight`                    | any rank 2+ player by list, friend or name   | attacker live, defender snapshot | no               | none (log only)                             |
| Challenge Zone (`UI_LeiTai`, NPC menu "Enter") | J/CompeteModule/ArenaSystem, P/Compete/Arena           | the current host of a level platform         | challenger live, host snapshot   | no               | Stone/Gold pot, 50% refunds, random item    |
| World Tournament (`WorldRace`, arena button)   | J/WorldCupModule, P/WorldCup                           | bracket of 128 (daily, automatic)            | both snapshots at signup         | no               | Honor, tournament points, Honor bets        |
| National League (`NationRace`, arena button)   | J/CompeteModule/NationMatchSystem, CompeteServer NM*   | same-village league (weekly, automatic)      | both snapshots                   | no               | Honor, trophies; GM-started                 |
| Weekly toll gate ranking (`TollGateRankFrame`) | P/TollGate/TollGateServer                              | none (progress race)                         | -                                | -                | EXP + Stone for the top 50 per gate         |

**There is no free PvP in scenes.** `logicscene.ini` `CanEnemy` is loaded into `SceneInfo`
(J/SceneModule/SceneSystem.java:399-411) and never read; no handler starts a fight between two
live players (the only live-vs-live entry, `FightSystem.Fight(FIXEDNESSID[], FIXEDNESSID[])`, is
used by `AttackSystem` for NPCs). No PK flag, protection or penalty exists. The "Enemies" list
(J/InteractionModule/FriendSystem.java:418-500, `GotoEnemyScene`) is social only. Other
snapshot fights against players belong to Home (M6): training robbery (reason 50, `TrainSystem`),
garden/slave fights (`GardenSystem`, `SlaveSystem`, slave room needs level 18 and uses the
arena list ±15 places, CompeteServer.java:3207-3364) and incubation robbery (reasons 55/56).

## 2. Arena (Compete)

### 2.1 Entry and tiers

- Arena Master n16002 in Angel City 161 (`arenaNpc.js` menu 10 → `CompeteSystem.OpenCompete`,
  J/CompeteModule/CompeteSystem.java:183-237). Refused while busy (`State != 0`,
  `FeedBack_Common_136`). No server level check: `competelevel=15` is only read by
  `OnCommandLevelUp` (1997-2002), which is never registered. The practical gate is Angel City
  (level 11).
- First login sets `CompeteScore = initscore` (93500), `CompeteIndex = -1` (136-141).
- 22 tiers (`competerank.ini`, client names `TipRank_{tier+1}`, badge `Font_S_PosCall{tier+1}`).
  Tiers never go down; the score can.

| Tier | Name         | Score band (raw) | Honor per fight | Promotion Honor | Normal NPC Lv | Fortune Cat (Lv, shown Honor) | Boss (Lv)     | Chest libs (row 1/2/3/bonus) | Honor → EXP |
| ---- | ------------ | ---------------- | --------------- | --------------- | ------------- | ----------------------------- | ------------- | ---------------------------- | ----------- |
| 0    | Beginner I   | 93500-94900      | 9               | -               | 1-6           | n320319 (1, 1100)             | n310019 (1)   | 61/31/1/91                   | 90 → 70     |
| 1    | Beginner II  | 95000-99900      | 9               | 1100            | 5-10          | n320329 (5, 1200)             | n310029 (10)  | 62/32/2/92                   | 90 → 250    |
| 2    | Beginner III | 100000-109900    | 10              | 1200            | 18-27         | n320339 (10, 1300)            | n310039 (14)  | 63/33/3/93                   | 100 → 550   |
| 3    | Beginner IV  | 110000-119900    | 11              | 1300            | 21-28         | n320349 (14, 1400)            | n310049 (19)  | 64/34/4/94                   | 110 → 840   |
| 4    | Beginner V   | 120000-130900    | 12              | 1400            | 29-36         | n320359 (19, 1500)            | n310059 (23)  | 65/35/5/95                   | 120 → 1200  |
| 5    | Transition   | 131000-141900    | 13              | 1500            | 32-39         | n320369 (23, 1600)            | n310069 (28)  | 66/36/6/96                   | 130 → 1600  |
| 6    | Academy I    | 142000-152900    | 14              | 1600            | 41-50         | n320379 (28, 1700)            | n310079 (32)  | 67/37/7/97                   | 140 → 2100  |
| 7    | Academy II   | 153000-163900    | 15              | 1700            | 45-50         | n320389 (32, 1800)            | n310089 (37)  | 68/38/8/98                   | 150 → 2600  |
| 8    | Academy III  | 164000-175900    | 16              | 1800            | 48-57         | n320399 (37, 1900)            | n310099 (41)  | 69/39/9/99                   | 160 → 3300  |
| 9    | Genin I      | 176000-187900    | 17              | 1900            | 54-59         | n320409 (41, 2000)            | n310109 (46)  | 70/40/10/100                 | 170 → 3900  |
| 10   | Genin II     | 188000-199900    | 18              | 2000            | 58-66         | n320419 (46, 2100)            | n310119 (50)  | 71/41/11/101                 | 180 → 4800  |
| 11   | Genin III    | 200000-212900    | 20              | 2100            | 63-69         | n320429 (50, 2200)            | n310129 (55)  | 72/42/12/102                 | 200 → 5500  |
| 12   | Chunin I     | 213000-225900    | 21              | 2200            | 68-77         | n320439 (55, 2300)            | n310139 (59)  | 73/43/13/103                 | 210 → 6500  |
| 13   | Chunin II    | 226000-238900    | 22              | 2300            | 73-80         | n320449 (59, 2400)            | n310149 (64)  | 74/44/14/104                 | 220 → 7300  |
| 14   | Chunin III   | 239000-251900    | 23              | 2400            | 80-88         | n320459 (64, 2500)            | n310159 (68)  | 75/45/15/105                 | 230 → 8500  |
| 15   | Chunin IV    | 252000-265900    | 25              | 2500            | 84-90         | n320469 (68, 2600)            | n310169 (73)  | 76/46/16/106                 | 250 → 9500  |
| 16   | Jounin I     | 266000-279900    | 26              | 2600            | 90-96         | n320479 (73, 2700)            | n310179 (77)  | 77/47/17/107                 | 260 → 11000 |
| 17   | Jounin II    | 280000-293900    | 28              | 2700            | 92-98         | n320489 (77, 2800)            | n310189 (82)  | 78/48/18/108                 | 280 → 12000 |
| 18   | Jounin III   | 294000-308900    | 29              | 2800            | 95-100        | n320499 (82, 2900)            | n310199 (86)  | 79/49/19/109                 | 290 → 13500 |
| 19   | ANBU         | 309000-323900    | 30              | 2900            | 95-100        | n320509 (86, 3000)            | n310209 (91)  | 80/50/20/110                 | 300 → 14500 |
| 20   | Sannin       | 324000-338900    | 32              | 3000            | 95-100        | n320519 (91, 3100)            | n310219 (95)  | 81/51/21/111                 | 320 → 16500 |
| 21   | Kage         | 339000-(none)    | 33              | 3100            | 95-100        | n320529 (95, 3200)            | n310229 (100) | 82/52/22/112                 | 330 → 18000 |

Sources: `competerank.ini` (`beginscore`, `endscore`, `honor`, `ranknpchonor`, `item0-3`),
`competenpc.ini` (`r=` 20 NPCs per tier: 18 normal, then the Fortune Cat, then the boss; the
boss's `UpCompeteRank` is the next tier), `HonorExp.ini`. "Promotion Honor" is the `ranknpchonor`
of the tier you are promoted **to** (paid on the boss win). Boss and Fortune Cat both use
`name_n31017` = "Fortune Cat" (text bug; the client tooltip `Tip_ArenaBossName` adds "(BOSS)").

### 2.2 Opponent list (18 slots, 3 rows of 6)

`SendRivalData` (1200-1301), refreshed by `LookFightRole`:

- **Tier 0-1 (NPC phase):** the 18 normal NPCs of your tier, starting at a random offset
  (`RandInt(0, count-3)`), wrapping around.
- **Tier 2+ (player phase):** from the server-wide arena list (2.5) around your list index `i`:
  window A = `[i-30, i-18]`, B = the next 13 places, C = the next 13 (about `[i-4, i+8]`); each
  window gives 6 random places (all of them if the window has fewer than 7), never yourself
  (`RollToCompeteClient` 1303-1356). Negative places (near the top, down to -10) become the
  **Referee** (`name_referee`, your own live stats × `1 + 0.05·|place|`, so up to 1.5×;
  `FightUmpire` 879-960). Empty slots are filled with tier NPCs. Most opponents rank above you.
- Each slot can be beaten once (`CompeteClient` column 12); a beaten slot cannot be attacked again.
- Refresh (button, custom 402, `OnCustomLookFightRole` 622-640): one free refresh is stored when
  3600 s (`refurbishtime`) have passed since the last free one (never more than 1;
  `H_RefreshLookTime` 166-173), otherwise 20 Gold (`refurbishmoney`). A refresh clears the
  beaten flags and chest state.

### 2.3 Fights, tries and costs

| Rule             | Value                                                                                                                                                                     | Source                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Daily tries      | `competemaxcount=20` (VIP 30), reset at server-local midnight with friend tries and the revenge list                                                                      | `TestCompeteTime` 1152-1166                                      |
| Extra tries      | 8 Gold each (`onemoney`), at most 15 bought per day (`competemaxcountGold`, counter reset on the first login of a new day)                                                | `CanCompeteFight` 414-443; J/RoleModule/AdultSystem.java:182-189 |
| Cooldown         | `competecd=0` (only the same second is blocked); client custom 87 clears it for free                                                                                      | 419-423, 1011-1021                                               |
| Busy             | not waiting for a reply, `State == 0`                                                                                                                                     | 414-427                                                          |
| Fight            | 1 duel, both at full HP/MP; your HP is not changed afterwards                                                                                                             | J/FightModule/FightSystem.java:626-682, 856-882                  |
| Fight reasons    | 2 = player (snapshot), 3 = NPC/boss/cat/referee, 27 = duel, 57 = Challenge Zone                                                                                           | CompeteSystem 975-1001; ArenaSystem 502                          |
| Revenge          | from your log, against someone who beat you: free the first time per target per day, then `backmoney` 10 Gold × (times already used); also costs a normal try (or 8 Gold) | `CanBackAtk` 445-492, 985-1003                                   |
| Boss (promotion) | button when `score ≥ endscore(tier)`; free, no try used, unlimited retries                                                                                                | `OnCustomFightBoss` 494-509                                      |
| Fortune Cat      | after any arena fight, 100 in 10001 (≈1%, `fortunecatmul`) unlocks one cat fight (no try used)                                                                            | 1836-1840, 511-522                                               |

### 2.4 Score, Honor and streaks

Score change, Elo with K = 2000 and a 100000-point scale (= K 20, scale 1000 in displayed units):

```
E = 1 / (1 + 10^((S_defender - S_attacker) / 100000))
W = 1 win, 0 loss, 0.5 draw (result 2; timeouts are decided by HP %, so draws are rare)
delta = (int)(2000 * (W - E))        // Java intValue, truncates toward zero
attacker += delta; defender -= delta (players only, zero-sum)
```

P/Compete/CompeteServer.java:1464-1469, 1497-1498 (players); J CompeteSystem 1586-1593 and
1745-1752 (NPCs: `S_defender` = NPC `CompeteScore` from `npc.ini`, e.g. n401001 93700; NPCs with
score 0 give no change). Referee: `S_defender = (int)(S_self × (1 + 0.1·|place|))` (1779-1787).
Equal scores: win +1000 raw (+10.00), loss -1000.

| Event                            | Honor                                                                                       | Other                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Any arena fight, win **or** loss | `honor` of the attacker's tier (9-33)                                                       | revenge +1 Honor (CompeteServer 1531-1537)                                                                               |
| Boss win                         | `ranknpchonor` of the new tier                                                              | tier +1; score capped at `endscore(old) × 1.1` locally (1662-1664), at `beginscore(new) × 1.1` on the domain (1373-1377) |
| Fortune Cat win                  | tier `honor` (1720); the log and drop log show the cat's `CompeteScore` (1100-3200) instead | -                                                                                                                        |
| Defending                        | none                                                                                        | score changes by `-delta`                                                                                                |

- Streak `m_LastWin` (+1 for the winner, attacker or defender; 0 for the loser) and win rate
  `wins / fights × 100` (defences count) live on the domain (1472-1496). World broadcasts at
  streaks 15/25/35/45, 55-95 every 10, 105, and **every** win from 106 (`BroadcastLastWin`
  1264-1286); breaking a streak of 15+ (`FeedBack_Arena_0011-0015`); a player outside the top 10
  beating #1 (`_0016`); a new #1 (`_0017`, `BroadcastNewFirst` 1330-1341).
- Achievements read streaks, losses and Challenge Zone counts
  (J/EffortModule/EffortRule/CompeteEffortRule.java). Daily goals and the monthly sign-in count
  arena fights (`CompeteCurrCount`, DayGoalSystem, ReachSystem).
- **No seasons, no resets, no position payouts.** Score and tier are permanent; arena rewards
  are only per fight, per promotion, chests and the Honor shops below.

### 2.5 The arena list (storage, order, ties)

- Tiers 0-1 are local only (player property `CompeteScore`). Reaching tier 2 sends the player to
  the domain (`SendPropertyToDomain` 1363-1512), which keeps one row per player in
  `compete.CompeteRecord` (max 999999 rows; columns name, nation, sex, clothing, level,
  popsinger, tier, score, win rate, roll streak, streak, self text; CompeteServer 141-146) and a
  52-column **fight snapshot** row (stats, skills, pet, weapon, total fights col 24, wins col 25;
  653-866). The player's place is `CompeteIndex` (0-based; shown +1).
- Order: tier descending, then score descending (`AddPlayerToRecord` 919-1012). Ties are not
  symmetric: a player moving **up** into a tie is placed below the existing equal rows, a player
  moving **down** into a tie is placed above them.
- Persistence: domain table `webgamedb.compete (FIELD_NAME varchar(100) PK, FIELD_DATA
longblob)` (G/backupdb dumps; `top`, `worldcup`, `tollgate` have the same shape).
- Top 10 changes are pushed to everyone with the arena window open (channel 0, custom 25).
  Chat lines carry the sender's arena place when tier ≥ 2 (J/ChatModule/ChatSystem.java:178-182).

### 2.6 Snapshot

The defender is always the domain snapshot. It is refreshed when the player opens the arena
(`OpenCompete` → `SendPropertyToDomain`), when they reach tier 2, and when they answer "yes" to
"your attributes may have been updated, update your arena attributes?" after closing the bag or
the skill tree inside the arena scene (`Common_OpenPackageAblityChange`, C
`UI_Package.as:258-270`, `UI_SkillTreeFrame.as:92-105`, custom 405). Level-ups do not refresh it
(handler unregistered). The defender does not need to be online and loses score offline; there
is no mail (the `FeedBack_Common_148/149` mail code in CompeteSystem 1537-1552 is never
triggered); the defence shows up in their fight log (type 4) next time.

### 2.7 Fight log

`CompeteFight` per player, last 15 (`savaselffightcount`): opponent, replay file, result, time,
type (1 attack, 2 revenge, 3 boss, 4 was attacked, 5 roll, 6 cat), score change, Honor, streak,
bonus. Duel log `CompeteFriendFight`, last 10. Domain copies are drained into the player on
login/open (CompeteServer 317-356). Replays can be watched from the log.

### 2.8 Chests and cards

Beating all 6 opponents of a row unlocks that row's chest; after 3 rows a bonus chest (tier
`item3`) (`OnCustomOpenFightPrize` 642-676, `OnCustomGetFightPrize` 721-789, J
CompetePrize.java). A chest shows face-down cards from card lib `item0/1/2/3` of your tier
(`competeprize.ini`, 88 libs, lines `weight,item,count,identified props 0-3,bound`). You may peek
at up to 2 cards (first 20 Gold `lookone`, second 35 Gold `looktwo`), then take one (a peeked
card gives that item, otherwise a fresh roll). Needs one free bag slot. Example lib 1: weights
10000 Level 1 Point Bag, 18000 Level 1 Medal Bag, then Beastlord Warchest pieces i292101-4 with 1,
2 or 3 identified properties (42/15/3 each).

### 2.9 Honor sinks

| Sink                                    | Rule                                                                                                                                                     | Source                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Honor shop (`UI_ArenaShopEquip`)        | 36 armours i292101-i295124; Honor 180/520/1360/200, tier ≥ 0/5/9/12; identified property count 1/2/3/4 with weights 79/20/1/0                            | `scoreprize.ini`; `OnCustomScorePrize` 791-834                                                   |
| Honor → EXP                             | n units: pay `honor × n`, gain `exp × n` (× adult income factor) at your tier (table 2.1)                                                                | `HonorExp.ini`; 835-857                                                                          |
| Jar smash ("pots", `UI_ArenaBoxActive`) | machines 1-8: 200 Honor, tier ≥ 0/5/9/12/16/19/20/21; 9 and 10: 18 / 58 Gold; drop lib `itemno` 2000001-2000010; free-smash item i161006 gives machine 9 | `prizemachine.ini`, DT/compete.s25938.tab; CompetePrize `BeginPrize`; `item/competeprizeitem.js` |

Smash count feeds the "Jar smashes" ranking (index 11). While the rookie task is unfinished every
smash gives a fixed bound Level 1 Exp Bag (i150168).

## 3. Ninjutsu Duel (friend fight)

`OnCustomFriendFight` (577-620), client `UI_PlayerPK` (tabs Random / Friends / History) and the
"PK" button of another player's profile (`UI_LookRoleInfo.as:695-742`).

- Both players must be tier ≥ 2 (Beginner III; `Common_PKSelfRankLock`, `Common_PKTarRankLock`),
  not in a team (client), not inside a toll gate (server `IsInTollGateScene`; client blocks
  100000-100006 only).
- Targets: type 0 = 6 random players within ±30 places of you (`OnCustomOpenFriendFight`
  524-575), type 1 = a friend, type 2 = any name.
- 10 free per day (`competefriendfightcount`), then 2 Gold each (`friendonemoney`), unlimited.
- Snapshot defender, reason 27; no score, Honor, streak or loot. Both sides get a log row;
  achievement type 6.

## 4. Challenge Zone (LeiTai)

Arena Master menu 11 → `UI_LeiTai_Xml` (J/CompeteModule/ArenaSystem.java, P/Compete/Arena.java).
One platform per type × level stage; a player can host only one platform at a time.

| Type                  | Days (1 = Mon) | Hours (server time) | Ends when                                                      | Pot growth per challenge |
| --------------------- | -------------- | ------------------- | -------------------------------------------------------------- | ------------------------ |
| 0 Death Challenge     | 2, 4, 6        | 18:00-23:00         | the host survives 30 min (`DIE_LEITAI_LASTTIME=1800`) or 23:00 | +0.8 × cost              |
| 1 Endurance Challenge | 1, 3, 5, 7     | 09:00-23:50         | 23:50                                                          | +0.3 × cost              |

| Stage | Levels | Death cost / creator refund | Endurance cost / creator refund |
| ----- | ------ | --------------------------- | ------------------------------- |
| 2     | 11-20  | 150 / 75 Stone              | 100 / 50 Stone                  |
| 3     | 21-30  | 10 / 5 Gold                 | 10 / 5 Gold                     |
| 4     | 31-40  | 30 / 15 Gold                | 20 / 10 Gold                    |
| 5     | 41-50  | 50 / 25 Gold                | 30 / 15 Gold                    |
| 6     | 51-60  | 70 / 35 Gold                | 40 / 20 Gold                    |
| 7     | 61-70  | 90 / 45 Gold                | 50 / 25 Gold                    |
| 8     | 71-80  | 110 / 55 Gold               | 100 / 50 Gold                   |

`leiTaiConfig.ini` (`CostQuantity`, `BaseCost`, `CapitalType`, `weektime`, `starttime0/endtime0`;
`starttime1/endtime1` are 0:00 = unused). Client tabs: `levelTab.ini` tab 1 = stages 2-5, tab 2 =
6-8. Client DT/leitai_cost.s26005.tab has `BaseCost=0` (server wins).

- **Create** (custom 659): level inside the stage (`lg_LT_LevelLack/LevelSurpass`), inside the
  hours, platform empty. Pay the cost, get `BaseCost` back at once; the pot starts at 0.8 × cost
  (ArenaSystem 120-166, 430-469; Arena 571-598, 710-722).
- **Challenge** (custom 660): same level/time rules, not already a host, no fight running on that
  platform (60 s lock, `lg_LT_Fight`). Pay the cost; one duel against the host's snapshot
  (reason 57).
- **Challenger wins:** becomes host (snapshot = challenger's live stats at that moment), streak 0,
  30-min timer restarts; Endurance also pays the challenger 0.5 × cost at once. The old host gets
  a mail and nothing else (Arena 266-321, 424-453).
- **Host wins:** streak +1; Endurance pays the host 0.5 × cost into the claimable prize record
  (480-515). Broadcasts at streaks 10, 25, 40 and pot ≥ 1000/2000 Stone or ≥ 600/1000 Gold.
- **Close** (5 s heartbeat `H_LeiTaiTimer` 106-149, `closeLeiTai` 155-196): the host's pot goes to
  the prize record, mail "claim your reward". Claim with the "get bonus" button (custom 662 →
  command 316), online or not.
- **Random event:** each type has one random level stage at a time; the first challenger who wins
  on that stage gets one bound item from `leitaiDrop.ini` (weighted per stage, e.g. stage 8:
  Gold Equipment Chest 7, Level 6 Enhancement/Refining Talismans, rare Shippuden / S-Rank Outfit
  Wishing Pots) (`setRandomEvent` 698-708, `getRandomReward` ArenaSystem 598-638).

## 5. World Tournament (WorldCup)

Daily automatic knockout; all fights between signup snapshots
(J/WorldCupModule/WorldCupSystem.java, P/WorldCup/WorldCupServer.java, `compete/worldcup.ini`).

| Time (server)              | Step                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| 08:00-23:00                | sign up: level ≥ 15, 2000 Stone, once per day (`OnCustomSignUp` 471-499); snapshot stored  |
| 04:05 next day             | signups dealt round-robin into 128 groups (`m_GroupTime=14700`)                            |
| 04:30-06:30                | qualifiers inside each group, one group per 5 s heartbeat (`H_FringeFightTimer` 1120-1180) |
| 06:40/06:45/06:50          | rounds of 128, 64, 32 → 16 left (`m_FightTime128=24000`)                                   |
| 10:00, 11:00, 14:00, 20:00 | round of 16, quarter-finals, semi-finals, final                                            |

- Every fight pays both players Honor: qualifiers 50 (`fringeprize`), last 16/8/4/2: 100/200/400/700.
- Tournament points by elimination round: 1/2/4/8/16/32/64, champion 128 (`128score`..`1score`);
  points accumulate forever in `WorldCupScore` (ranking 13).
- Bets on the last 16: one per round, paid in Honor (`gamingtype=3`), 1-50/100/150/300 per round,
  windows 09:05-09:55, 10:05-10:55, 12:05-13:55, 14:05-19:55; a winning bet pays 2×.
- Results by mail (`Mail_WorldCup_01-10`); rewards are collected on login or when the window opens.
  Odd counts give a bye.

## 6. National League (Nation Match)

GM-started (`StartNationMatch(type)`, property `NatMatchIsStart` 1 or 2). Weekly, per village:
from the arena list order, the top 8 form league S, the next 40 five A leagues, the next 160
twenty B leagues; with type 2 up to 640 more fill 80 C leagues (CompeteServer `OnNMInitData`
1897-2031). Daily automatic snapshot fights at 07:00 by the pairings of `NationMatchOrder.ini`
and the slots of `NationMatchTime.ini` (11:00 … 16:00); league score becomes Honor and trophies
i150102-i150106 at 500/250/150/100/50 points (`NationMatchPrize.ini`). Menus: `UI_SceneGuide`
`callNationRace`. Recommend not porting (needs 208 ranked players per village, see 9).

## 7. Weekly toll gate ranking

Details in `toll-gates.md` 3.1; additions:

- Only the 8 hard gates 100001-100008 have `IsExistsRank=1`; the reward tables also list
  100021-100028. Top 50 per gate, ordered by progress %, ties keep the earlier time; the client
  shows 10 rows plus your own (`Common_TollGateRankMsg`: "You are not in the top 50").
- Rewards per place r: EXP and Stone = rank-1 value / √r (`RankExpReward.ini`,
  `RankMoneyReward.ini`; `RankItemReward` all 0). Rank 1: 100001 6000 EXP / 16908 Stone … 100008
  92000 EXP / 28986 Stone; rank 50: 848 / 2391 … 13009 / 4098. Claimed once from the ranking
  window ("last week", button flashes when claimable).
- The week flips lazily on the first ranking message of a new `Calendar.WEEK_OF_YEAR` (server
  locale; TollGateServer `IsRefreshRank`/`RefreshRank` 242-281). The rule text says "Sunday 24:00";
  with a US locale the week actually starts Sunday 00:00.
- Not recorded if a team member is more than 10 levels above the gate (`RequirMaxLevel`;
  `Common_TollGateRankInfo`).
- Opened from the gate challenge window and the instance (`ChallengeFrame.as:148-151`,
  `TollClone.as:296-297`).

## 8. Rankings window (`UI_GameTop`, HUD bottom button "Rank")

`UI_BottomMenu.as:87,112-130` toggles `UI_GameTopFrame`. The tree comes from
DT/gametop.s53463.tab (literal Indonesian labels, no language keys; client adds the five
village lists). Query: custom 390 (index, page) → 10 rows per page, `FindMe` (391) returns your
place. Lists 0-25 and 27-35 live on the Top domain (P/Top/TopServer.java), 14-18 and 26 are read
from the arena list (CompeteServer `OnQueryTop` 2666-2744).

| Index  | Group (tab label)     | List                                                           | Sorts on (desc)                                                                      | Size                 | Updated when                                 |
| ------ | --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------- | -------------------------------------------- |
| 0      | Role Rank             | Level                                                          | `Level`                                                                              | 100                  | level-up, login                              |
| 1-7    | Role Rank             | Attack, Speed, Defense, Dodge, Accuracy, Critical, Armor Break | `MaxAtk`, `-AtkTime`, `Defense`, `DodgeMul`, `HitMul`, `CritMul`, `NeglectDefAttach` | 100                  | equip on/off, level-up, outfit change, login |
| 8, 9   | "Arena Ranking" (sic) | Stone, Gold                                                    | current `CapitalType0/2`                                                             | 100                  | every capital change                         |
| 10     | Las Noches            | best floor                                                     | `SGateMaxFloor`                                                                      | 100                  | new best floor                               |
| 11     | Jar Smash             | smashes                                                        | `CompeteLotCount`                                                                    | 100                  | each smash                                   |
| 26     | Arena Rank            | World Rank                                                     | arena order (tier, score)                                                            | all, 50 pages shown  | live                                         |
| 14-18  | Arena Rank            | Fire … Lightning                                               | arena order, own village only                                                        | first 200 arena rows | live                                         |
| 12     | Arena Rank            | Win streak                                                     | `CompeteNewLastWin` (tier ≥ 2)                                                       | 100                  | property change                              |
| 19     | Arena Rank            | Win rate                                                       | `CompeteWinMul` (tier ≥ 2)                                                           | 100                  | property change                              |
| 13     | World Tournament      | points                                                         | `WorldCupScore`                                                                      | 100                  | reward claim                                 |
| 20, 21 | Wealth Rank           | total top-up, total spent                                      | `TotalRecharge`, `TotalConsume` (real money)                                         | 100                  | payment / spend                              |
| 23     | Achievements          | achievement points                                             | `TotalEffortScore`                                                                   | 100                  | achievement                                  |
| 27-30  | "Rank Pencapaian"     | S/A/B/C chest openings                                         | `Open{S,A,B,C}BOxCount`                                                              | 100                  | chest opened (`OpenBoxSystem`)               |

- Not shown: 22 (`TCMaxScore`, turn-card best, sent by TurnCardSystem) and 31-35 (pierce, block,
  tenacity, max HP, max MP; titles exist in the client, rows are sent on login, no tree entry).
- Top domain storage: `TopRoleRec{0..35}` (name, value), trimmed to 100; `MinValue{i}` = the
  100th value, so lower values are not even sent (`SortRec` 270-334). Ties: a new or changed
  entry goes **after** existing equal values (earlier holder keeps the place). Lists are live,
  event-driven; there is no scheduled snapshot and no reward for any list.
- Titles: none from rankings. Stone and Gold top 10 get a "rich" badge in chat
  (`RichPlayerRec0/2`, `FilterTopRec` 335-371, ChatSystem 172-176); chat shows the arena place.
  Achievement/item titles (`RoleTitleSystem`, DT/title.tab) are a separate feature.

## 9. Original bugs and exploits

| #   | Issue                                                                                                                                                                                                                            | Source                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | **Challenge Zone mints money**: create = pay C, refund 0.5 C, pot starts 0.8 C. An unchallenged host nets +0.3 C per platform; Death platforms close after 30 min, so one player can farm every 30 min (stage 8: +33 Gold each). | ArenaSystem 444-461; Arena 710-722, 141-142                  |
| 2   | Challenge Zone pots and hosts are wiped on a domain restart (`Init` clears `FightData` and the platform records) without payout.                                                                                                 | Arena 63-70, 95-100                                          |
| 3   | Costs are checked on the game server and taken after the domain replies (Challenge Zone create/challenge, Stone/Gold could be spent in between).                                                                                 | ArenaSystem 156, 204, 444, 485                               |
| 4   | Snapshot gaming: the defence copy is whatever the player had when they opened the arena or confirmed the update prompt (temporary buffs/gear stay baked in; weakening later does not lower it).                                  | CompeteSystem 202, 1358-1361                                 |
| 5   | Gold is taken before validation: an invalid or already-beaten slot (`OnCustomCompeteFight`) or a revenge on a won entry (`OnCustomCompeteBack` checks column 2 after charging) costs a try/Gold and starts no fight.             | 861-877, 985-1003                                            |
| 6   | Fortune Cat: log shows 1100-3200 Honor, only tier Honor (9-33) is paid.                                                                                                                                                          | 1705-1722                                                    |
| 7   | Card rolls use `RandInt(0, total)` with 1-wide gaps between entries; a gap roll returns nothing and the chest is still consumed.                                                                                                 | CompetePrize `RollItem`, `LoadResource`                      |
| 8   | Arena ties are ordered differently when moving up vs down; promotion score cap differs between game server and domain.                                                                                                           | CompeteServer 938, 976, 988; 1373-1377 vs CompeteSystem 1662 |
| 9   | Streaks ≥ 106 broadcast to the whole world on every win.                                                                                                                                                                         | CompeteServer 1280-1284                                      |
| 10  | Dead code: roll fights (`OnCustomRollFight`, `CompeteSelect` handler), `OnCommandLevelUp` (so `competelevel` is unused), defender mails, `CompeteLastWinRec` streak bonus ("bonus reward of points" text).                       | CompeteSystem 266, 1023, 1997; CompeteServer 279-286         |
| 11  | `competenpc.ini` is read with section indexes looked up in `competerank.ini`; works only because both files list sections in the same order.                                                                                     | CompeteSystem 2206                                           |
| 12  | Armor Break ranking sorts `NeglectDefAttach`, not `NeglectDefMul`; Stone/Gold sit under an "Arena Ranking" label.                                                                                                                | TopSystem 211, 275; gametop.tab                              |
| 13  | Toll gate ranking menu: entries 4 and 5 both request 100005 (100004 cannot be viewed) and 100008 has no entry.                                                                                                                   | C/GameUI/TollGate/TollGateRankFrame.as:145-170               |
| 14  | National League throws (`remove(0)` on an empty list) unless every village has ≥ 208 ranked players.                                                                                                                             | CompeteServer 1940-1985                                      |
| 15  | Daily counters reset at server-local midnight, the bought-try counter only on login, the toll gate week lazily on the first message.                                                                                             | 1152-1166; AdultSystem 182-189; TollGateServer 242-251       |
| 16  | Unknown item id in the Honor shop dereferences `null` (server exception).                                                                                                                                                        | CompeteConfig `GetPrizeNeedRank`; CompeteSystem 798          |

## 10. Client windows and flows

| Window                                    | Files (C)                                                                                                                 | Flow                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arena (`UI_ArenaTop`, scene type "Arena") | `GameUI/Arena/ArenaInfoPanel.as`, `ArenaTopPanel.as`, `ArenaFighterPanel.as`, `AsUILogic/UI_ArenaTop/UI_ArenaTopFrame.as` | left: your place, tier badge, score/100, Honor, streak, buttons Bag, Duel, World Tournament, National League, Slave room (Lv 18), Skills; centre: 18 opponents in 3 rows with chests, Refresh, Honor shop, Exchange; top: top 10, streak feed (`CompeteLastWinRec`, never written, so empty), boss/cat prompts (`Arena_PKBossToRank`, `Arena_PKCat`) |
| Challenge confirm (`UI_ArenaPKReady`)     | `AsUILogic/UI_ArenaPKReady/UI_ArenaPKReady.as`                                                                            | opponent card; out of tries asks to pay Gold (`ArenePK_NoCount`)                                                                                                                                                                                                                                                                                     |
| Chest cards (`UI_ArenaCard`)              | `AsUILogic/ArenaUI/UI_ArenaCardPanel.as`                                                                                  | open row chest, peek (Gold), take                                                                                                                                                                                                                                                                                                                    |
| Honor shop, jars, Honor → EXP             | `AsUILogic/BoxShop/UI_ArenaShopEquip.as`, `UI_ArenaBoxActive.as`, `UI_ModelExchange`                                      | buy armour, smash jars, trade Honor for EXP                                                                                                                                                                                                                                                                                                          |
| Ninjutsu Duel (`UI_PlayerPK`)             | `AsUILogic/UI_PK/UI_PlayerPK.as`, `UI_PKListCell.as`; profile `UI_RoleInfo/UI_LookRoleInfo.as`                            | tabs Random (±30 places), Friends, History; free count shown (`Common_PKLeftFreeAmout`)                                                                                                                                                                                                                                                              |
| Challenge Zone (`UI_LeiTai`)              | `AsUILogic/LeiTai/UI_LeiTaiFrame.as`, `BonusIcon.as`                                                                      | type tabs Death/Endurance, level tabs 11-50 / 51-80; per stage: host, streak, outfit, pot, fight lock timer, end time; Create, Challenge, Watch replay, Claim; rules `LT_Rule`                                                                                                                                                                       |
| World Tournament                          | `GameUI/WorldRace/*.as`, `WorldMatch/*.as`                                                                                | sign up, bracket of 16, bets, own results                                                                                                                                                                                                                                                                                                            |
| Rankings (`UI_GameTop`)                   | `AsUILogic/UI_GameTop/*.as`                                                                                               | tree of lists, 10 rows per page, first/prev/next/last/go to page                                                                                                                                                                                                                                                                                     |
| Toll gate ranking                         | `GameUI/TollGate/TollGateRankFrame.as`                                                                                    | gate menu, top 10 + own row, claim last week's reward                                                                                                                                                                                                                                                                                                |

## 11. Data files and config values

| File                                                                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RES/compete/compete.ini                                                     | `initscore=93500`, `competecd=0`, `competemaxcount=20`, `competevipmaxcount=30`, `savaselffightcount=15`, `competelevel=15` (unused), `competerank=2` (player phase), `topcount=10`, `onemoney=8`, `backmoney=10`, `fortunecatmul=100` (of 10000), `expprizescore=200` (unused), `competefriendfightcount=10`, `friendonemoney=2`, `savefightfriendcount=10`, `lookone=20`, `looktwo=35`, `refurbishtime=3600`, `refurbishmoney=20`, `competemaxcountGold=15` |
| RES/compete/competerank.ini                                                 | 22 tiers (2.1); `minsorce` read by the domain, absent                                                                                                                                                                                                                                                                                                                                                                                                         |
| RES/compete/competenpc.ini                                                  | 22 × 20 NPC ids (374 distinct, all in `npcs.json` with `CompeteScore`/`UpCompeteRank`)                                                                                                                                                                                                                                                                                                                                                                        |
| RES/compete/competeprize.ini                                                | 88 card libs (1-22, 31-52, 61-82, 91-112)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| RES/compete/scoreprize.ini, HonorExp.ini, prizemachine.ini                  | Honor shop, Honor → EXP, jar machines (2.9)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| RES/compete/leiTaiConfig.ini, levelTab.ini, leitaiDrop.ini                  | Challenge Zone (4); 43 drop rows                                                                                                                                                                                                                                                                                                                                                                                                                              |
| RES/compete/worldcup.ini                                                    | 5; `group=128`, `signupmoney=2000`, `minlevel=15`                                                                                                                                                                                                                                                                                                                                                                                                             |
| RES/compete/NationMatch{Order,Prize,Time}.ini                               | 6                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| RES/scene/clonescene/Rank{Exp,Money,Item}Reward.ini                         | 50 places × 16 gates                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| DT/gametop.s53463.tab                                                       | Rankings tree (8)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| DT/compete.s25938.tab, competebonus.s25585.tab                              | jar machines with names `Compete_BonusMachine{n}` and item previews                                                                                                                                                                                                                                                                                                                                                                                           |
| DT/leitai_cost, leitai_level, leitai_tab_main                               | Challenge Zone client tables (refund shown as 0)                                                                                                                                                                                                                                                                                                                                                                                                              |
| DT/honorexchangeexp.s4673.tab, competerank.s14197.tab, competenpc.s4673.tab | client copies (server wins)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Constants in code                                                           | Challenge Zone fight lock 60 s, Death hold 1800 s, pot +0.8/+0.3 × cost, Endurance 0.5 × cost payouts; World Tournament times 14700/16200/24000/27000 s, view window 06:00-01:00; arena Elo K 2000, scale 100000; referee ×0.05 stats, ×0.1 score; ranking size 100, pages of 10                                                                                                                                                                              |

## 12. Existing data and code in the port

| Item                                             | State                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Arena NPCs (n401xxx-n414xxx, n3101xx9, n3202xx9) | in `server/data/game/npcs.json` with `CompeteScore` and `UpCompeteRank`                                        |
| Honor, Stone, Gold                               | character columns exist (`server/src/db/schema.ts:143-146`); Honor is already paid by daily tasks              |
| Player fighter                                   | `playerFighterFrom` (`server/src/game/combat.ts:96`) uses current HP; arena needs max HP and a stored snapshot |
| Toll gate progress                               | last passed point stored (`schema.ts:486`), ranking not built                                                  |
| Everything else in this document                 | not imported, not modelled                                                                                     |

Suggested imports (`server/data/game/`): `arena-tiers.json` (competerank + competenpc +
HonorExp), `arena-config.json` (compete.ini), `arena-cards.json` (competeprize.ini),
`arena-honor-shop.json` (scoreprize.ini), `arena-jars.json` (prizemachine.ini + DT compete),
`challenge-zone.json` (leiTaiConfig, levelTab, leitaiDrop), `world-tournament.json`,
`toll-gate-rank-rewards.json`, `rankings.json` (gametop.tab with our English labels).

State to keep: per character tier, score, Honor, streak, fights, wins, tries + day, bought tries,
duel tries, free refresh + time, 18 opponent slots with beaten flags, chest/card state, revenge
counts, fight log (15), duel log (10), defence snapshot (JSON + updated at); server-wide arena
order (derive with an index on tier, score, tie key), ranking lists (or SQL views), weekly toll
gate table + last week's claims.

## 13. Recommended scope for M4

**Port 1:1**

- Arena: tiers, NPC phase, opponent windows, Elo formula, Honor per fight, boss promotion,
  tries and Gold costs, revenge, Fortune Cat, streaks, win rate, fight log with replays,
  broadcasts, snapshot defence, Honor → EXP and the Honor shop.
- Ninjutsu Duel (list, friends, by name from the profile), 10 free + 2 Gold.
- Rankings window: lists 0-10, 12, 14-19, 26 (and 11 once jars exist, 23 once achievements
  exist). Top 100, 10 per page, "find me".
- Weekly toll gate ranking with the √r reward tables, 8 gates, claim once.

**Simplify**

- Arena list as a SQL query (order by tier, score, then a stable tie key) instead of the domain
  list; one tie rule both ways.
- Snapshot refreshed automatically on equip/skill/level change (no prompt), stored as JSON.
- Server time zone for all daily/weekly resets (same choice as M3), scheduled reset job instead
  of lazy flips.
- Chests and cards, jars: port the data, decide UI later (open question).

**Defer or skip**: World Tournament and National League (time-table events that need a large
population), Challenge Zone (keep data, needs exploit 1 fixed), top-up/spending and chest-opening
lists, VIP tries.

### Open questions

1. Snapshot policy: auto-refresh on every gear/skill/level change, or keep the original
   "update arena attributes?" prompt (and its baked-in buffs)?
2. Keep 20 free tries + 15 Gold tries at 8 Gold, 20 Gold refresh and 2 Gold duels as is?
3. Fix the asymmetric tie order and the two promotion score caps, or port them 1:1?
4. Pay the Fortune Cat as coded (tier Honor) or as shown (1100-3200 Honor)?
5. Arena chests with card peeks (Gold) and jar smashing: in M4 or later?
6. Challenge Zone in M4? If yes, remove the minting (pot starts at 0 or no creator refund)?
7. World Tournament and National League: skip for now?
8. Which ranking lists to show; drop top-up/spending lists for good; add a "power" list
   (none existed)?
9. Weekly toll gate reset moment: Monday 00:00 server time (port) vs the original locale week?
10. Duels: keep the tier 2 (Beginner III) requirement on both sides and the "no rewards" rule?
11. Notify defenders (the original only shows the log) — add an in-game mail after M4 mail lands?
12. English name for Honor: "Honor" (currency label) everywhere, replacing "medals"?
