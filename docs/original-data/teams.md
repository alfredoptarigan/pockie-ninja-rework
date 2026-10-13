# Original data: teams (party system)

Reference for milestone 4 (Social & Competition): the original `TeamModule` and every system that
reads it. J = decompiled server (`service/com/d2/serv/game`), RES = `Resource/`, C = decompiled
client scripts, DT = `apache/source/binary/datatable`. English text is `tools/i18n/en.json`
(keys are `lg_<key>`; quoted here without the prefix). Toll gate and pub fight rules themselves are
in `toll-gates.md`, the duel engine in `battle.md`; this file adds only what teams change.

## 1. Summary

- A team ("party" in some English strings) has **2 or 3 members**, one captain. There is no team
  object on the server: every member holds a copy of the record `TeamRec` and every change is
  written into each copy (J/TeamModule/TeamSystem.java, whole file).
- Teams exist only for **two activities**: toll gates (formed in the Valhalla lobby 3102) and pub
  fights (formed in the neutral fields 26xx-28xx). A team cannot fight field monsters, explore,
  trade, travel or go home. There is no level restriction on who may team up.
- A team never travels: the "members follow the captain" code exists but no scene in the data
  allows it, so a team only moves when the captain enters a toll gate (see 3.6).
- In a team fight the members fight **in fight order as sequential 1v1 duels** against the NPC
  line-up (the same engine as solo, with more attackers). Rewards are **not split**: every member
  gets the full reward; in toll gates the captain also gets a bonus (+100% EXP, +50% Stone with 3
  online members).
- Logging out, losing or clearing a toll gate run ends the membership; a 2-member team that
  loses a member is disbanded.

## 2. Data and constants

| Value                                 | Data                                                      | Source                                                             |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Max members                           | 3 (`TEAM_PLAYERMAX`, `IsTeamFull` = rows ≥ 3)             | J/TeamModule/TeamDefine/TeamDefine.java:7; TeamSystem.java:1552    |
| Min members                           | 2 (`TEAM_MINCOUNT`); a team falling to 1 is disbanded     | TeamDefine.java:8; `CanAutoDisbandTeam` 512-522                    |
| Corrupt team guard                    | > 3 rows: trace log and refuse every team action          | `CheckTeamException` 1697-1709                                     |
| Fight order slots                     | 0, 1, 2 (`TEAM_FIGHTFIRST..THIRD`)                        | TeamDefine.java:11-13                                              |
| Member types                          | 0 player, 1 servant ("slave", see 3.8)                    | TeamDefine.java:14-15                                              |
| Scene "ready team" board (team stone) | join refused at ≥ 100 rows, list sent capped at 200       | 971-974, 894-897 (constants 43-44 unused)                          |
| Scene "request" board                 | join refused at ≥ 100 rows, list sent capped at 100       | 1030-1033, 927-930                                                 |
| Team chat cooldown                    | 5 s (`Chat.ini [4] TimeSpace=5`; `VIPTimeSpace=2` unused) | RES/role/Chat.ini; ChatSystem.java:292                             |
| Captain bonus (toll gates)            | `CaptianMul.ini`: 2 → 0% EXP / 0% Stone; 3 → 100% / 50%   | RES/scene/clonescene/CaptianMul.ini; TollGateSystem.java:1383-1419 |
| Servant restore after a toll gate win | +20% max HP and +20% max MP (hard-coded)                  | TollGateSystem.java:645-646                                        |
| Toll gate team rule                   | `RequirTeam`: 0 solo only (100000), 2 either (20 gates)   | RES/scene/clonescene/TollGate.ini; `CheckTeam` 292-297             |

No team-specific datatable exists in DT. Task.ini has `RequireTeam=-1` on all 2469 quests (loaded,
never checked: TaskSystem.java:801-806).

### Where a team may exist (`RES/scene/logicscene.ini`)

`CanTeam`: 0 no teams, 1 players, 2 servants only, 3 players and servants
(`CheckSceneTeamPlayer` 1603-1610, `CheckSceneTeamSlave` 1612-1619). `CanTeamSwitchTo=1` marks a
scene a whole team may be moved to (`CheckSceneTeam` 1621-1630).

| Scenes                                                   | CanTeam | CanTeamSwitchTo | ini lines |
| -------------------------------------------------------- | ------- | --------------- | --------- |
| 2601-2605, 2701-2704, 2801-2804                          | 1       | 0               | 356 … 512 |
| 3102 Valhalla (toll gate lobby)                          | 3       | 0               | 551       |
| 5001 toll gate instance                                  | 0       | 1               | 577-578   |
| everything else (villages, xx01-xx03, 161, 171, 3101, …) | 0       | 0               | -         |

The 13 neutral fields are exactly the pub fight scenes (`PubSceneFightInfo.ini`).

### Team record `TeamRec` (13 columns, one row per member, in every member's copy)

| Col | Meaning                                  | Kept in sync?                                                |
| --- | ---------------------------------------- | ------------------------------------------------------------ |
| c0  | name                                     | -                                                            |
| c1  | 1 captain, 2 member                      | on captain change (`CatpainChange` 289-300)                  |
| c2  | fight order 0-2                          | on swap / removal (`RefreshFightSeq` 302-332, 790-799)       |
| c3  | HP                                       | yes, on every HP change (`LiveModule/LiftSystem.java:60-66`) |
| c4  | MaxHP                                    | no (snapshot at join)                                        |
| c5  | MP                                       | yes (LiftSystem.java:68-75)                                  |
| c6  | MaxMP                                    | no                                                           |
| c7  | Energy (shown as the "SP" bar)           | no                                                           |
| c8  | MaxEnergy                                | no                                                           |
| c9  | Level                                    | yes, on level up (`OnCommandPlayerLevelUp` 1725-1738)        |
| c10 | PlayerAvatarID (outfit for the portrait) | no                                                           |
| c11 | 0 player, 1 servant                      | -                                                            |
| c12 | servant's owner name ("" for players)    | -                                                            |

Built by `CreateTeam` 1749-1759, `SelfJoinTeam` 1823-1838, `NotfiyMemberJoinTeam` 1785-1799,
`SlaveJoinTeam` 1860-1888, `AppendTeamMemberInfo` 1890-1912.

The public player property `InTeam` (seen by everyone in the scene) is 0 = solo, 1 = captain of a
team with room, 2 = member or captain of a full team (`SetPlayerInTeamFlag` 127-141). Clients use
1 to list "teams looking for members".

## 3. Lifecycle

Client → server messages (C/Common/MessageID/CustomClientMessageID.as:418-444, handlers registered
in TeamSystem.java:59-75):

| Id  | Client name               | Server handler                                       |
| --- | ------------------------- | ---------------------------------------------------- |
| 260 | `TEAM_REQUEST`            | `OnCustomTeamRequst` 485-510 (invite or apply)       |
| 261 | `TEAM_JOIN`               | **none** (unused)                                    |
| 262 | `TEAM_KICK`               | `OnCustomTeamKickMember` 645-667                     |
| 263 | `TEAM_HANDOVERCATPAIN`    | `OnCustomHandOverCatpain` 729-739                    |
| 264 | `TEAM_SETFIGHTORDER`      | `OnCustomSetFightOrder` 801-812                      |
| 265 | `TEAMSTONE_REQUEST`       | `OnCustomTeamStoneRequest` 455-483                   |
| 266 | `TEAMSTONE_JOIN`          | `OnCustomTeamStoneJoin` 402-435                      |
| 270 | `TEAM_QUITTEAM`           | `OnCustomQuitTeam` 818-830                           |
| 271 | `TEAM_DISBAND`            | **none** (no explicit disband exists)                |
| 272 | `TEAM_ADDSLAVE`           | `OnCustomAddSlave` 832-846                           |
| 273 | `GETSCENEREADYTEAMINFO`   | `OnCustomGetSenenReadyTeamInfo` 914-920 → custom 180 |
| 274 | `GETSCENEREQUESTTEAMINFO` | `OnCustomGetSceneRequestTeamInfo` 947-953 → 181      |
| 275 | `JOINSCENEREADYTEAM`      | `OnCustomJoinSceneReadyTeam` 1010-1016               |
| 276 | `JOINSCENEREQUESTTEAM`    | `OnCustomJoinSceneRequestTeam` 1052-1058             |

"State ok" below means `State == 0` (not fighting, not in an auto action, `CheckState` 1632-1635).

### 3.1 Invite (one message, two meanings)

`260 <name>`: if the target is in a team and I am not, this is an **application** (3.2); otherwise
an **invitation**:

1. `CanRequest(me, target)` 1437-1488, in order: not myself (`Team_Err_CantRequestSelf`); if I am
   in a team I must be captain (`Team_Err_NotCaptain`); my state ok
   (`Team_Err_SelfStateNotRequest`); my scene allows players (`Team_Err_SelfSceneNotTeam`); my
   team not full (`Team_Err_TeamFull`); **same scene** (`Team_Err_OtherNotIntSameScene`); target
   state ok (`Team_Err_TargetStateNotRequest`); target not in a team
   (`Team_Err_SelfStateNotRequest`); not already my member (`Team_Err_OtherInTemNotAccept`).
2. `TeamBeRequest` 334-349 re-checks with `CanBeRequest` (1490-1525, from the target's side) and
   shows the target a yes/no box `MSGBOX_REQUEST_TEAM` (3) with `Team_Msg_RequestJoin` (name,
   level).
3. Refuse → inviter gets `Team_Msg_RefuseTeam` (104-118). Accept → `CanBeRequest` again, then
   `RequestJoinTeamSuccess` 366-376: if the inviter is solo, **the team is created now** with the
   inviter as captain (fight order 0); the target is appended (`ReqestTargetJoinedTeam` 1761-1783):
   joiner gets `Team_Msg_SelfJoinSuccess`, existing members `Team_Msg_RequestSuccess`.

The box has no server timeout; the decision is taken whenever the target clicks. The client clears
the other pending invite boxes when one is accepted (C/GameUI/FeedBack/FeedBackMessageMsg.as:154-166).

### 3.2 Apply to join

`260 <member or captain name>` while solo and the target is in a team:

1. `CanJoinTeam(me, target)` 1217-1251: I am solo, my scene allows players, my state ok, team not
   full, not already in it. **No same-scene check.**
2. `TeamBeJoin` 1406-1418: `CanAnswerJoinTeam` 1253-1279, then the captain gets
   `MSGBOX_ASKJOIN_TEAM` (4) with `Team_Msg_BeJointTeam` (name, level).
3. Refuse → applicant gets `Team_Msg_RefuseAskJoin` (92-95). Accept → `TeamJoinAnswer` 1420-1435 →
   `CanJoinTeam` again → `JoinTeamSuccess` 1801-1821 (same messages as 3.1).

### 3.3 Team boards (team stone, only in pub fight fields)

Each neutral field has a "team stone" NPC (`npc/TeamStoneNpc.js`, RES/npc/npc.ini:801-946; placed by
`RefresNpc.ini`: n26100 2601, n26200 2602, n26300 2603, n26400 2604, n26500 2605, n27100-n27400
2701-2704, n28100 2801, n28200 2802, n27500 2803, n27600 2804). Menu: "Enter Stone Organization"
(`NpcMenu_EntryTeamStone`, members other than the captain get `TeamStone_ForbidEntry`) opens
`UI_TeamFrame_Xml`; "Enter Lounge" is the paid rest already ported in M3.

The board holds two per-scene lists (scene records `ReadyTeamRec`, `RequestTeamRec`); every handler
first requires the player's scene to be a pub fight scene:

| Action                                   | Rule                                                                                                                                                 | Lines                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Publish my team (275)                    | captain of exactly **2** members, not listed yet; row = captain, captain level, member, average arena score of both                                  | 955-1008                                                   |
| Publish myself (276)                     | solo, not listed yet; row = name, level, arena score, arena win rate                                                                                 | 1018-1050                                                  |
| Join a listed team (266 captain, member) | row must still exist and still name that member (else `TeamStoneInfoOverTime` + fresh list); then apply (3.2) or, if the captain is now solo, invite | 378-435                                                    |
| Invite a listed player (265 name)        | row must exist; then invite (3.1)                                                                                                                    | 437-483                                                    |
| Remove from "ready" list                 | team disbanded, captain change to a non-captain, or team becomes full (record op 5 with 3 rows)                                                      | `TeamRecordChange` 143-171, `QuitSceneReadyTeam` 1060-1098 |
| Remove from "request" list               | player joins a team, leaves the scene (`OnLeaveSceneBefer`, SceneSystem.java:327-330) or logs out                                                    | 1100-1136, 183                                             |

### 3.4 Kick, leave, disband

| Action                   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                             | Lines   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Kick (262, captain only) | not self (`Team_Err_NotKickSelf`), I am in a team, I am captain (`Team_Err_Kick_Captain`), target is a member (`Team_Err_NotMember`). If the team has 2 rows → disband. Else remove: captain `Team_Msg_CatpainKickMember`, others `Team_Msg_KickMember`, target `Team_Msg_SelfBeKickedTeam`. The kicked player's servants are kicked too; inside a toll gate the kicked player is sent home and their rank progress is submitted | 582-667 |
| Leave (270, anyone)      | progress rank submitted, then `QuitTeam` 229-258: 2-member team → disband (`Team_Msg_Disband` to both); captain of 3 → captaincy passes automatically (3.5); others get `Team_Msg_OtherMemeberQuitTeam`; own servants removed; inside a toll gate the leaver goes home; leaver gets `Team_Msg_SelfQuitTeam`                                                                                                                      | 818-830 |
| Disband                  | no command. Happens when a 2-member team loses one (leave, kick, logout) and when a toll gate run ends (captain `ForceDisbandTeam` 553-566, TollGateSystem.java:199-235)                                                                                                                                                                                                                                                         | 537-566 |

### 3.5 Captain transfer

- Manual (263): captain only, target is a player member (not a servant), online, not myself
  (case-insensitive). Every member's record changes; new captain gets `Team_Msg_SelfBecomeCatpain`
  (box), others `Team_Msg_CatpainChange` (669-739). No same-scene check.
- Automatic when the captain of a 3-member team leaves or logs out: the remaining player member
  with the **lowest fight order** becomes captain (`GetExceptSelfHighSeq` 1678-1694,
  `HandOverCatpain` 686-710).

### 3.6 Fight order

Captain only (264 src, dest): both are members, both orders valid (0..rows-1), team has ≥ 2 rows;
swaps their `c2` values in every copy (749-812). The client sends it from up/down arrows (swap with
the neighbour). Joiners get the next free slot; on removal the higher slots move down
(`ReCalculate` 312-332). New teams: captain 0, first joiner 1, second joiner 2.

### 3.7 Logout, disconnect and scene travel

- **Logout** (`OnPlayerOffLine` 178-227; ignored when the offline type is 2, meaning unknown): leave
  the request board; `InTeam = 0`; 2-member team → disband (and an active toll gate run ends with a
  forced go-home); captain of 3 → auto handover; others get `Team_Msg_OtherMemeberQuitTeam`; own
  servants removed; the record is cleared; a toll gate run is closed (`OfflineFroceGoHome`,
  TollGateSystem.java:1476-1491). There is no reconnect grace: a team never survives a logout.
- **Travel with a team.** `TeamSwitchScene` 1300-1331 would check every member
  (`CheckSceneTeam` + `CanSwitchScene`, else `Team_Err_OtherCantSwtichScene` to the others) and move
  everyone. It is called for the captain from scene exits (SceneSystem.java:250-256) and the world
  map (SceneSwitchRuleSystem.java:54-71, paying `cost × members`). **No scene has both
  `CanTeam` 1/3 and `CanTeamSwitchTo=1`** (only 5001 has the latter, with `CanTeam=0`), so it always
  fails: a team cannot leave its scene. Members other than the captain are refused silently.
- Other travel is refused in a team: go home / go out (`Team_Err_ForceEntryTollGateScene`,
  SceneSystem.java:156-162), scripted switches (98-108), quest teleports (TaskSystem.java:143,
  client `Common_OperateFailInTeam`, CustomMessageCenter.as:56-62), go to an enemy's scene
  (FriendSystem.java:846-848). The world map handler also shows `Team_Err_ForceEntryTollGateScene`
  after any team attempt (SceneSwitchRuleSystem.java:117-122); the client blocks the map in a team
  (WorldMapFrame.as:133-137).
- The only team move is **toll gate entry**: the captain enters and every member is switched
  into 5001 with their own entry checks (TollGateSystem.java:418-492).

### 3.8 Servants (home "slaves")

A master (`SlaveType == 2`, Home module) may add one of their captured players (`SlaveHaveRec`) as a
team member (272) where `CanTeam` is 2 or 3, i.e. **only in the toll gate lobby 3102**. The server
fetches the servant's fight data from the arena domain server, stores it in `SlaveFightRec` and
appends a row with `c11 = 1`, `c12 = owner` (832-882, 1170-1215, 1860-1888). Servants fight in toll
gates (keeping HP/MP between points, +20% after each win), are never captain, are not counted for
the captain bonus, exclude the team from the weekly ranking (TollGateSystem.java:1075-1078) and
from pub fights (PubMonsterFightSystem.java:510-512). `OnCommandSlaveLeave` 1138-1168 (remove a
released servant) is never registered. Servants depend on the Home system (M6).

### 3.9 Things a team member cannot do

| Action                        | Message                                           | Source                                           |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Fight field monsters / bosses | none (silent)                                     | FightModule/AttackSystem.java:72-74              |
| Explore                       | `Common_OperateFailInTeam`, `FeedBack_Common_090` | RoleModule/OutSearchSystem.java:124-127, 572-575 |
| Train / work (auto action)    | `FeedBack_Common_079`                             | RoleModule/AutoActionSystem.java:87-90           |
| Auto attack (combo)           | `FeedBack_Common_081`                             | RoleModule/AutoAttackSystem.java:148-151         |
| Trade (either side)           | `FeedBack_Common_080`, `_078`, `_025`             | CommerceModule/ExchangeSystem.java:218-225, 250  |
| Dice                          | none                                              | RoleModule/DiceSystem.java:80-82                 |
| Enter a home                  | `Garden_Sysinfo_038`                              | HomeModule/GardenSystem.java:1689-1692           |
| Enter the toll gate lobby     | none (must be solo)                               | TollGateSystem.java:266                          |
| Travel (see 3.7)              | various                                           | -                                                |

Las Noches (single gate) has no team code: a team can never reach Demon City, so it is solo by
construction.

## 4. Team battles

### 4.1 The fight itself

- Fighters: the members in fight order (`GetMemberBySeq` 1334-1404; servants are built from
  `SlaveFightRec` with their stored HP/MP). Offline members are skipped. Defenders: the 3 NPCs of
  the point or pub line-up.
- Engine: the same sequential 1v1 duels as solo (battle.md): attacker 0 fights NPC 0; the survivor
  keeps HP/MP and meets the next opponent; the team wins when all NPCs die, loses when all members
  die (J/FightModule/FightSystem.java:423-534). Each player's HP/MP is read before and written back
  after (536-572, with servants 574-624). A member who died in a won fight stays at 0 HP until the
  activity restores it.
- Every member's client gets the same replay (`FightSave` with all player names, 551, 603).
- On a win the **last** NPC's kill reward (`Command 12` → `OnPlayerKillVirtualNpc`: NpcExp, Stone,
  coupons, drop roll) is sent to **every** member independently (561-570, 613-622). Nothing is
  divided.

Fit with our model: `simulateFight({ attackers, defenders })` in game-core already takes several
attackers; `server/src/modules/gates/common.ts` `duel()` passes one. A team fight is the same call
with the members' `playerFighter`s in fight order, then each member's HP/MP written back from
`replay.fighters[i]`. Everything else (rewards, restore) is a per-member loop.

### 4.2 Toll gates (`J/CloneSceneModule/TollGateSystem.java`)

| Step           | Team rule                                                                                                                                                                                                                                           | Lines                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Form           | enter the lobby 3102 solo, then team up there (players and servants)                                                                                                                                                                                | 266; ini 551         |
| Who acts       | only a solo player or the captain may enter, fight or act (`CanOperateInTollGate`)                                                                                                                                                                  | 997-1011             |
| Entry checks   | every player member passes the solo checks (min level, item, weapon, HP > 90%, entries left; `RequirTeam` 2); any failure shows `TollGate_TeamPlayerNEC*` to all and nobody enters. Servants: level must be within `RequirMinLevel..RequirMaxLevel` | 418-447, 357-416     |
| Entry cost     | **each** member spends one daily entry and one required item (if any)                                                                                                                                                                               | 449-492              |
| Point fight    | every player member must be on the same point and not lost; one fight for the team                                                                                                                                                                  | 559-575, 577-689     |
| Win            | for every member in the instance: restore `RestoreHP`/`RestoreMP` (20%/40%), advance, and receive the full sub-gate and gate rewards; servants +20%/+20%                                                                                            | 711-762, 645-676     |
| Captain bonus  | captain only: `EXP + EXP × ExpMul/100` and `Stone + Stone × MoneyMul/100` by the number of **online player** members (servants not counted): 2 → +0, 3 → +100% EXP, +50% Stone. Chat lines `TollGate_Exern*Reward*` show the bonus                  | 1345-1434, 1229-1343 |
| Loss           | every member: point state 0, HP 1                                                                                                                                                                                                                   | 788-811              |
| End of run     | when each client finishes the replay (317) / clicks the clear box: captain disbands the team, members leave it; everyone goes home (loss) or to their **own** card flip (clear)                                                                     | 192-236, 892-932     |
| Leave mid-run  | a member who leaves (270 or exit 314) or is kicked goes home; the rest continue                                                                                                                                                                     | 818-830, 1459-1465   |
| Weekly ranking | sent only if every member (team record level) is within the gate's level band and there is no servant                                                                                                                                               | 1058-1090            |

There is no team-only reward besides the captain bonus.

### 4.3 Pub fights (`J/CloneSceneModule/PubMonsterFightSystem.java`)

| Step     | Team rule                                                                                                                                                  | Lines            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Who acts | solo or captain (client: `Common_OutTeamFightNoCaption`)                                                                                                   | 502-504          |
| Checks   | no servant in the team; every member: own scene is a pub scene, energy ≥ `UseEnergy`, fights today ≤ 999, **full HP** (`PubMonsterFightErr_Other*` to all) | 506-557, 472-500 |
| Line-up  | the **captain's** 3 NPCs for the scene                                                                                                                     | 559-581          |
| Cost     | every member pays the energy (decision 1 of M3 removed energy)                                                                                             | 599-604          |
| Fight    | team duels, reason 45; result (Command 252) to every member                                                                                                | 583-662          |
| Win      | every member: +1 fight today, HP 0 → 1, pouches used, last-NPC reward; **captain only**: automatic pull (new line-up + combo reward)                       | 664-688          |
| Loss     | every member: HP 1, +1 fight today, pouches used                                                                                                           | 690-708          |

### 4.4 Field monsters and Las Noches

Not possible in a team (3.9). No team fights exist outside toll gates and pub fights.

## 5. Chat and notifications

### 5.1 Team chat (channel 4)

`ChatSystem.SendTeam` (J/ChatModule/ChatSystem.java:279-322): not in a team → `Common_NoTeam`;
muted → `FeedBack_Common_162`; less than 5 s since the last team message → `FeedBack_Common_075`.
The message (arena rank icon, VIP flag, rich-list badge, channel 4, sender, text) is sent to every
name in the sender's `TeamRec`, sender included (custom 6). Client tab index 2
(`GameDefine.Chat_Team = 4`, C/GameUI/AsUILogic/SceneUI/UI_Chat.as:380, 425); inside a toll gate
instance the chat starts on the team channel (C/Common/UICenter.as:619-625). Channel 104
(`Chat_TeamSystem`) shows `SYSINFO_TEAM` (8) lines, used only by the dice item to tell teammates a
roll (`OtherUseDiceItemResult`, RES/javascript/item/DiceItem.js:72-90).

### 5.2 Messages

Boxes need a click; chat lines go to the system chat (`SysInfo` type 1).

| Key                             | Kind     | To whom                   | English (en.json, abridged)                            |
| ------------------------------- | -------- | ------------------------- | ------------------------------------------------------ |
| `Team_Msg_RequestJoin`          | yes/no 3 | invited player            | {0} (Level {1}) has invited you to join the team…      |
| `Team_Msg_BeJointTeam`          | yes/no 4 | captain                   | {0} (Level {1}) has applied to join your team, accept? |
| `Team_Msg_RefuseTeam`           | box      | inviter                   | {0} has declined your team invitation.                 |
| `Team_Msg_RefuseAskJoin`        | box      | applicant                 | Your application was rejected                          |
| `Team_Msg_SelfJoinSuccess`      | chat     | joiner                    | You accepted {0}'s invitation and joined the team.     |
| `Team_Msg_RequestSuccess`       | chat     | existing members          | {0} has joined your team.                              |
| `Team_Msg_SelfQuitTeam`         | chat     | leaver                    | You have left the team.                                |
| `Team_Msg_OtherMemeberQuitTeam` | box      | others (leave and logout) | {0} has left the team.                                 |
| `Team_Msg_CatpainKickMember`    | chat     | captain                   | You have kicked {0} out of the team.                   |
| `Team_Msg_KickMember`           | chat     | others                    | {0} has been kicked by the team leader.                |
| `Team_Msg_SelfBeKickedTeam`     | chat     | kicked player             | You have been kicked from the team by {0}.             |
| `Team_Msg_SelfBecomeCatpain`    | box      | new captain               | You have been promoted to team leader!                 |
| `Team_Msg_CatpainChange`        | chat     | others                    | {0} has been promoted to team leader.                  |
| `Team_Msg_Disband`              | chat     | everyone                  | The team has been disbanded.                           |
| `Team_Err_*` (17 keys)          | box      | actor                     | see `TeamErrDefine.java:7-43`                          |
| `TeamStoneInfoOverTime`         | box      | board user                | Invalid information, cannot add.                       |

### 5.3 What the client listens to (realtime)

| Event                                                | Purpose                                    |
| ---------------------------------------------------- | ------------------------------------------ |
| `<RoleID>_TeamRec` record add / delete / set / clear | party frame, all client-side team checks   |
| `InTeam` property of players in the scene            | lobby list of open teams, player list icon |
| custom 180 / 181                                     | team board lists (ready teams, requests)   |
| message boxes 3 / 4                                  | invite and application prompts             |
| custom 6 channel 4, SysInfo 1 and 8                  | team chat, team notices                    |
| Command 252                                          | pub fight result for every member          |

## 6. Client UI

| Window / element                                                 | File                                                                                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Party frame `UI_TeamRoleIcon` (top-left, under the own portrait) | C/GameUI/AsUILogic/UI_Team/UI_TeamRoleIcon.as; C/GameUI/listcell/TeamRoleIconCell.as:60-324 | one cell per member sorted by fight order: outfit portrait (click = view info), level, name, HP / MP / "SP" (energy) bars with tooltips (`Common_RoleHP/MP/SP`), captain crown. Captain view: on each member a "make leader" button (`Tip_TeamChangeCaption`, servants excluded), up / down arrows (`Tip_TeamUp/Down`, 264), a kick button (`Tip_TeamKick`, confirm `Common_TeamKickPlayer`, 262); on self the leave button (`Tip_TeamLeaveCaption` "Disband Team", confirm `Common_TeamSelfQuit`, sends 270). Member view: only own leave button (`Tip_TeamLeave`). Shown in the neutral fields (`OutCity`), the lobby and the instance (UICenter.as:522, 609, 622) |
| Lobby list `UI_TeamWait_Xml` (3102 only)                         | C/GameUI/AsUILogic/UI_SearchTeam/UI_SearchTeam.as, UI_SeaechTeamCell.as                     | players in the scene with `InTeam == 1`; level filter (All, 1-14, 15-24, 25-34, 35-44, 45-54, 55-60); row: name, level, member count (hard-coded "2"), Team button → 260 (apply)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Team board `UI_TeamFrame_Xml` (team stone)                       | UI_SearchTeam/UI_TeamFrame.as; listcell/TeamExistCell.as, TeamRequestCell.as                | tabs "Team List" / "Team Join Requests", 10 rows per page, level filter (All, 16-25 … 66-Max), Refresh. Team rows: captain (link), level, member (link), average arena points, Join (266). Request rows: name, level, arena points, arena win %, Invite (265). Buttons "Request team members" (captain of 2, confirm `Common_AddTeamInfo`, 275) and "Team Request" (solo, `Common_AddRequestInfo`, 276)                                                                                                                                                                                                                                                              |
| Player list row (fields, lobby)                                  | C/GameUI/listcell/OutCityPlayerCell.as:43-112                                               | team button visible only in 3102 and in pub fight fields; on a servant row it sends 272, else the same as the menu entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Player context menu entry "Team" (`Common_addTeam`)              | C/Common/PlayerMenuManager.as:31, 54, 251-281                                               | in the player list menu (Look, Whisper, Add friend, Add enemy, **Team**, Mail); in chat line menus only for the scene channel in 3102 or a pub fight field (ChatListCell.as:90-104, WhisterMsgCell.as:99-112). Client pre-checks: captain if in a team, team below 3, target not already a teammate (`Common_TargetInTeam`), then 260                                                                                                                                                                                                                                                                                                                                |
| Team chat tab                                                    | UI_Chat.as                                                                                  | tab 2; filter view "team" shows channels 4, 104 and GM                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Toll gate instance                                               | C/ViewObjectFacory/TollClone.as:207-213                                                     | only the captain (or solo player) can click a point                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Pub fight window                                                 | C/GameUI/AsUILogic/UI_PubFightMonster/UI_PubFightMonster.as:480-551                         | non-captains get `Common_OutTeamFightNoCaption`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Assets needed: `UI_TeamWait_Xml`, `UI_TeamFrame_Xml` (+ `UI_TeamExistListCell_Xml`, request row),
the `TeamRoleIcon` cell clip (bars, crown, arrows, buttons), the player list team button, the team
stone NPC sprites (N26100, N27002, N28005 resource ids).

### Translation notes (fix in the M4 review)

- `NpcMenu_EntryTeamStone` "Enter Stone Organization": the Chinese comment is 组队集结石, "team
  gathering stone"; the menu opens the team board. The NPC name key `name_n26100` has no entry in
  `en.json`.
- "Team" and "party" are mixed (`Common_OperateFailInTeam`, `PubMonsterFightErr_Other*`); pick one.
- `Common_TeamKickPlayer` says "Confirm leaving the Party?" but confirms a kick.
- `Team_Err_NotMember` says "is not the team leader" but means "is not in your team".
- `Team_Err_SelfStateNotRequest` says "The player is in another team" but is also shown for the
  actor's own busy state.
- `Tip_TeamLeaveCaption` "Disband Team": the button hands the lead over when 3 members remain.
- `Common_TeamMateLevelHigh` is an unrelated appraisal sentence.

## 7. Original bugs and exploits

1. **Cross-scene teams.** Applying (3.2), the board join (266), captain transfer and the answer
   to an application never check that both players are in the same scene; only the invite does.
   A player in 2601 can apply by name to a team in 2804. Pub fights then use each member's own
   scene for the energy check, so a member can join the captain's fight from another field.
2. **Power levelling in toll gates.** `RequirMaxLevel` is not checked for player members (only for
   servants and the ranking): a level 90 can enter Valhalla Camp (16-25) with two level 16
   players and clear it for them; with 3 online members the captain also earns +100% EXP / +50%
   Stone.
3. **Hijacked invitation.** Accepting an invitation re-checks only that the inviter's team is not
   full (`CanBeRequest`). If the inviter has since joined another team as a member, the target is
   added to **that** team without its captain's consent (`RequestJoinTeamSuccess` uses
   `GetCatpain(inviter)`, 366-376).
4. `IsLostInTollGate` reads the **captain's** HP for every member instead of each member's
   (TollGateSystem.java:1021).
5. On a team loss `SendTollGateFightRank(self)` is called once per member instead of for each
   member (803): members' weekly rank progress for a lost run is never submitted.
6. `CanAnswerJoinTeam` shows `Team_Err_TeamFull` but does not return (1267-1269); the later
   `CanJoinTeam` still refuses, so the captain just sees a prompt for a full team.
7. Team travel is dead code: no scene has `CanTeam` 1/3 and `CanTeamSwitchTo=1` (3.7), and the
   world map handler shows a "leave the team first" box after every team attempt.
8. `OnCommandSlaveLeave` is never registered: a released servant stays in the team until it ends.
9. `TeamRec` copies drift: MaxHP, MaxMP, energy and outfit are snapshots from join time; each
   player owns a copy, so a failed write leaves members disagreeing about the team.
10. Board limits do not match their constants (`MaxSceneReadyTeamCount = 100`, `…Request… = 200`
    are unused; the code uses 100/200 for the ready list and 100/100 for requests).
11. Lobby list shows "2" members for every open team (UI_SeaechTeamCell.as:33); its level filter
    labels (1-14 … 55-60) do not match its thresholds (<15 … >54) nor the level cap.
12. Client `FeedBackMessageMsg` clears every other pending application once the team has 2
    members, although a third could still join (154-166).
13. No invite or application expiry: a stale box can be accepted much later (state is re-checked,
    but see 3).

## 8. Existing port and state

| Item                                                 | State                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `scenes.json`                                        | has `CanTeam` / `CanTeamSwitchTo` per scene (imported from logicscene.ini)                           |
| `npcs.json`, `scene-npcs.json`                       | include the 13 team stone NPCs; M3 wired only their rest menu (`world.ts:226`)                       |
| `toll-gates.json`                                    | has `RequirTeam`; `toll-gate-config.json` already has `captainMul` (unused by the solo code)         |
| Toll gates, pub fights (`server/src/modules/gates/`) | solo only; `duel()` passes one attacker                                                              |
| Realtime (`server/src/modules/realtime/realtime.ts`) | Socket.IO scene rooms and session rooms; chat channels `world` and `scene`; limiter 5 messages / 5 s |
| Energy                                               | removed (M3 decision 1)                                                                              |

State the server must keep (in memory is enough because teams never outlive a session):

| State           | Fields                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| Team            | id, scene (or activity), captain id, members `[{characterId, fightOrder}]`   |
| Pending prompts | invite / application: from, to, team id, created at                          |
| Team boards     | per scene: published teams (captain, member, level, score) and solo requests |
| Character       | nothing persistent; `InTeam` is derived for the scene player list            |

## 9. Recommended scope for M4

Port 1:1:

- Size 2-3, captain, the invite and the apply flows with their checks and messages, kick, leave,
  manual and automatic captain transfer, auto-disband below 2 members, fight order swap.
- Team only in `CanTeam` scenes (13 neutral fields and the lobby 3102); everything in 3.9 refused
  in a team, with the original messages.
- Team toll gates: captain enters and acts, each member's entry checks and costs, team duels in
  fight order, full rewards per member, restore per member, captain bonus from `CaptianMul.ini`,
  run end = team end, per-member card flip.
- Team pub fights: captain's line-up, every member must have full HP, last-NPC reward to all,
  combo pull to the captain only.
- Team chat channel (server-side room per team, 5 s cooldown) and the party frame.
- Team boards at the team stone (publish team, publish self, join, invite).

Simplify:

- One server-side team object (with a version for concurrency) instead of per-player record copies;
  live HP/MP/level in the party frame from the characters.
- Logout: keep the original "leave on disconnect", but with a short grace (for example 30 s) so a
  page reload does not break the team; inside a toll gate run treat it as the original logout.
- Drop team travel (dead in the original) and servants (need the M6 Home system).
- Prompts expire after 60 s and are re-validated on accept (fixes bugs 3 and 13).
- Fix bugs 1, 4, 5, 6 (same-scene check on every join path, per-member HP and rank).

Open questions for the product owner:

1. Keep the toll gate power-levelling hole (bug 2: no max level for players), or enforce
   `RequirMaxLevel` for every member?
2. Logout: strict original (leave at once) or a reconnect grace period, and how long?
3. Team boards show arena points and win rate; the arena is also M4. Ship the boards with the
   arena, or show level only until then?
4. Servants (home slaves) in toll gate teams: skip until M6, agreed?
5. Captain bonus counts "online" members; with the grace period of question 2, does a member who
   is reconnecting count?
6. Same-scene rule: require all members in the captain's scene for every join path (recommended),
   or keep the original loophole?
7. Should team members be allowed to explore or fight field monsters together (not in the original),
   or keep teams limited to toll gates and pub fights?
8. Use "team" everywhere in English (recommended; the original keys say Team), replacing "party"?
9. Invite/apply prompts: queue them like the original message boxes or show only the newest per
   sender with an expiry?
10. Weekly toll gate ranking (M4 per toll-gates.md): rank entries for a team run are per member;
    port the original "submit on clear, leave, kick or logout" or submit for all members at once
    when the run ends?
