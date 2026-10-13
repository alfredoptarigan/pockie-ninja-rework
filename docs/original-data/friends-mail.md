# Original data: friends, enemies (blacklist), whispers and mail

Reference for milestone 4 (Social & Competition). J = decompiled game server
(`InteractionModule/FriendSystem.java`, `ChatModule/ChatSystem.java`, `MailModule/MailSystem.java`),
P = decompiled domain servers (`service/com/d2/serv/pubdata/`, mainly `Mail/MailServer.java`),
RES = `Resource/`, C = client scripts (`GameUI/AsUILogic/...`), DT = `apache/source/binary/datatable`,
KV = `apache/source/binary/keyvaluetable`, DB = `backupdb/*.sql` (schemas only). English text comes
from `tools/i18n/en.json` (keys quoted without the `lg_` prefix).

## Overview

| Feature                           | Server                                            | Client                                 | Storage                                                    |
| --------------------------------- | ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Friend list                       | J `FriendSystem` (customs 23, 25, 26, 29, 634)    | `UI_Society/*` (Friends window, tab 0) | role record `FriendRecord` (saved with the character)      |
| Enemy list (the blacklist)        | J `FriendSystem` (customs 24, 27, 28, 30)         | `UI_Society/*` (tab 1 "Enemy List")    | role record `EnemyRecord` + mail domain field `EnemyField` |
| Whisper (private chat)            | J `ChatSystem.SendWhister` (custom 40, type 1)    | `SceneUI/UI_Chat.as`, `UI_Whister/*`   | none on the server; client-side Flash SharedObject history |
| Mail                              | J `MailSystem` (customs 137-147) + P `MailServer` | `UI_Mail/*` (minimap Mail button)      | DB table `mail` (domain blob), mirrored into role records  |
| Referral ("Referrer", FindFriend) | J `FindFriendSystem` + P `FindFriendServer`       | `UI_ExtendFriend/*`                    | DB table `findfriend`; out of scope (see end)              |

Headline facts:

- **Mail has no attachments.** No items, no currency, no postage, no cash-on-delivery, no claim
  step. Every mail is a text record of 9 fields. Market proceeds, arena prizes and rewards are
  only _announced_ by mail; the goods are collected elsewhere (Market window, bag, arena UI).
  So there is no attachment-dupe surface in the original.
- **Friends are one-sided** (no request needed), but the target must be **online**, and gets a
  notification mail plus a prompt to add back. Two players who both have each other become
  **home friends** (`FriendRecord` column 7 = 1), which unlocks visiting homes (milestone 6).
- **There is no separate blacklist.** The "Enemy List" doubles as one: an enemy entry can carry a
  "Block messages from this player" flag that silently drops that player's **player mail only**.
  Nothing blocks whispers, chat, friend requests, trade or team invites.
- **Whispers are online-only**, rate-limited to one per second, not stored on the server.

## Friends

### Record

`FriendRecord` (RES `Code/ClassInfo.dat`, Player class, max 200 rows, saved with the role).
Column names are the original Chinese names, translated.

| Col | Name (original)       | Filled with                          | Notes                                                 |
| --- | --------------------- | ------------------------------------ | ----------------------------------------------------- |
| 0   | name                  | friend's character name              | everything is keyed by name, not by id                |
| 1   | gender                | `Sex`                                |                                                       |
| 2   | level                 | `Level`                              | refreshed when the list is opened (see online status) |
| 3   | village               | `Nation`                             |                                                       |
| 4   | class ("profession")  | `Popsinger` (weapon class)           | shown as `Common_RolePopsinger1/2/4/7`                |
| 5   | status                | 1 online / 0 offline                 | written on dialog open only                           |
| 6   | standing ("identity") | `SlaveType` (master/disciple status) | home system (M6)                                      |
| 7   | intimacy              | **0 normal friend / 1 home friend**  | no intimacy points exist; it is a mutual-friend flag  |
| 8   | home level            | `HomeLevel`                          | M6                                                    |
| 9   | can help              | garden flag                          | M6 (`GardenSystem`)                                   |
| 10  | can steal             | garden flag                          | M6 (`GardenSystem`)                                   |

### Adding a friend (`FriendSystem.OnCustomAddFriend` 162-193)

Client: Friends window "Add Friend" (name field, max 12 chars, no spaces, not yourself:
`UI_AddFriend.addFriend`), the player context menu, or "Add Friend" in a read mail. If the name is
on your enemy list the client first asks `Common_EnemyToFriend`.

Server, on A adding B:

1. `CanAddFriend` (144-160): not yourself (case-insensitive), `rows < MaxFriend`
   (`Common_FriendIsMax`), **B is online** (`Friend_Err_NotOnline`), B not already listed.
2. A → B command 297 (`OnCommandHomeSrcIsDestF` 718-760). If B does not list A, B runs command 20
   (`OnCommandBeAddFriend` 223-263), which sends B's public info back to A (command 21).
3. A: `OnCommandBackAddFriend` (314-329) re-checks `CanAddFriend`, then `AddFriend` (265-312):
   - adds the row (col 7 = 0), removes B from A's home neighbour list (`NeighborRec`);
   - fires quest condition 2110 (command 71) and achievement event 10 (command 261);
   - sends B a system mail, type 4: `AddFriendMailTitle` / `AddFriendMailContent`
     ("{A} added you as a friend!");
   - A sees `Friend_Hint_AddSuccess`; B is removed from A's enemy list.
4. Back on B: if B already lists A, B sees `Friend_Hint_AddFrind`; otherwise, if B's list is not
   full, B gets a yes/no prompt `Common_AddFriendPrompt` ("{A} has added you as a friend. Do you
   want to add this player too? You will both be able to visit each other.").
5. B accepts (`OnMessageFriendAdd` 769-788): A's row for B becomes col 7 = 1 (command 294,
   `OnCommandHomeFriendAgree` 682-693) and B adds A through the same path with col 7 = 1. Result:
   both rows are home friends.

Upgrading an existing normal friend to a home friend: friend cell menu "Friend's Home"
(`Common_SocietyAddHomeFriend`) or adding again. A → B command 296 (`OnCommandHomeFriendAddOnly`
695-716): if B does not list A and is full, A gets `Common_FriendIsMax_1`; otherwise B is prompted
(`MSGBOX_HOME_FRIEND_ADD`); on accept (`OnMessageHomeFriendAdd` 790-840) both rows get col 7 = 1
and A sees `Lang_Friend_003`. Adding someone who is already your home friend: `Lang_Friend_005`.

### Removing a friend

- Normal friend (`OnCustomDelFriend` 344-364): one-sided delete of your row. The other player
  gets system mail type 4 `Mail_Title_001` / `Mail_Title_002` ("{A} removed you from their friend
  list"). Their row for you stays.
- Home friend: must first be downgraded (`OnCustomDelHomeFriend` 366-400, custom 634): your row's
  col 7 → 0, mail `Mail_Title_003` / `_004` to them, `Lang_Friend_004` to you; their col 7 → 0
  immediately if online (command 293), otherwise queued in the home domain (`<name>delFriends`)
  and applied on their next login (`RefreshHomeFriend` 118-142). Deleting a home friend directly
  answers `Lang_Friend_001`. The client hides this two-step: "Delete" on a home friend sends 634,
  so a second "Delete" is needed to really remove them.

### Limits and list expansion

| Value                                    | Source                            | Effect                                                                      |
| ---------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `InitFriendCount=20`                     | RES `interaction/interaction.ini` | `MaxFriend` on first login                                                  |
| `MaxFriendCount=100`                     | same                              | expansion cap                                                               |
| `InitEnemyCount=20`, `MaxEnemyCount=100` | same                              | **unused**: enemies share `MaxFriend` (server 406, client `UI_AddEnemy`)    |
| expansion price                          | `CanExtendFriend` 515-524         | **1 Gold per slot** (capital type 2, log reason 24), 1-80 slots per request |
| record hard cap                          | `ClassInfo.dat`                   | 200 rows for `FriendRecord` and `EnemyRecord`                               |

Expansion: Friends window "Add List" → `UI_ExtendSociety` (client refuses `MaxFriend + n > 100`,
`Common_InputError`; confirm `Common_ExtendAcount`), custom 29 → `OnCustomExtendFriend` 536-551,
success `Friend_Hint_ExtendSuccess`. One property `MaxFriend` caps both lists.

### Online status

Not pushed. Opening the Friends window (or switching tab) sends custom 23 with type 1 (friends) or
2 (enemies); `RefreshPlayerFriends` (931-945) sets col 5 from `FindPlayerGameWorld` and asks each
online friend to report level, slave type and home level (commands 14 → 15). There are no
login/logout notifications for friends.

### Rewards, quests, achievements

- Quests t50011, t52011, t54011, t56011, t58011 (one per village, subtask condition 2110
  "successfully add a player as your friend", `SubTaskDes_50011`, reward 446 EXP + 10 Gift Coupons) all
  have `RequireLevel=101` (RES `task/Task.ini`), above the level cap 90: **disabled** in 2011.
  The tutorial guide keys `FreshMainGuide_AddFriend*` exist for them.
- Achievement 5110742 `AccomplishmentName42` "Friends in the group": 20 rows in `FriendRecord`,
  10 achievement points (RES `role/Effort.ini`, `FriendEffortRule`).
- No friendship EXP, intimacy points, gifts or friend buffs exist. Friend-based features live in
  other systems: home visits, garden help/steal, disciples (M6), arena friend ranking and friend
  battle log (`CompeteSystem` 1105-1113, `Common_FriendWinCount`), card friends (`CardHome`).

## Enemy list (the original blacklist)

`EnemyRecord` (max 200 rows, saved): 0 name, 1 gender, 2 level, 3 village, 4 class, 5 online,
6 **block mail** (0/1). The mail domain keeps a mirror `EnemyField[player] = [target, block]`
(P `MailServer` 1015-1099) used to filter mail.

Flows:

- Add (custom 27, `OnCustomAddEnemy` 418-432): name (12 chars) + "Block messages from this player"
  checkbox. `CanAddEnemy`: not yourself, `rows < MaxFriend` (`Common_EnemyIsFull` on the client),
  **target online** (`Enemy_Err_NotOnline`), not already listed. The target's server answers with
  its info (commands 22 → 23); if the target listed you as a friend their col 7 is reset to 0 and
  they get mail `Mail_Title_003` / `_004`. You then add the row, the domain mirror is written
  (msg 16), and the target is deleted from **your** friend list. If the name is your friend the
  client asks `Common_FriendToEnemy` first.
- Block toggle (custom 30, `OnCustomSetCoverEnemyMail` 869-887): `Common_AddEnemyshield` /
  `Common_AddEnemyUnshield` confirmations from the "Block Info" link in the enemy row.
- "Block this person" in a read player mail: confirm `Common_MailShieldPlayer`, then adds the
  sender as an enemy with block = 1.
- Remove (custom 28): deletes the row and the mirror (msg 18). Adding an enemy as a friend also
  removes them from enemies.
- "Go to" (custom 24, `CanGotoEnemyScene` 842-853 → `OnCommandReturnEnemySceneID` 641-665):
  teleport into the enemy's current scene. Enemy must be online, you must not be in a team
  (`Common_OperateFailInTeam`), the scene must have `CanEnemy == 1` and pass `CanSwitchScene`
  (`SceneNotGoEnemy`), not the same scene (`EnemyAlreadyExistScene`). Costs **1 Gold**
  (reason 26). Client confirm `Common_SocietyKillEnemyInfo` reads `SocietykillEnemyCost` from KV
  `gamedataconfig`.

What an enemy entry does and does not affect:

| Interaction                       | Effect of being on someone's enemy list                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Player mail (type 2)              | dropped silently if the block flag is set (`filtrMail` 1131)                  |
| Arena message mail (type 3)       | **not** filtered (`CanAddUserMailRecord` 457 checks type 2 only)              |
| Whisper, world/scene/village chat | not filtered (server or client)                                               |
| Friend add / add-back prompt      | not filtered (`CanBeAddFriend` returns true)                                  |
| Trade, team invite, PK            | not filtered (no other server use of `EnemyRecord`)                           |
| Visibility                        | the target is never told, except the "removed you" mail when you were friends |

## Whispers (private chat)

Server `ChatSystem.OnCustomChat` (112-125): custom 40 `[type, text, target]`; type 1 with a
non-empty target goes to `SendWhister` (411-457).

- Addressing: by exact character name. Typed as `/Name message` in any chat box
  (`UI_Chat.SendChat` 919), from the context menu "Private Chat" (`SetWhister`), or in the
  Private Message window (`UI_WhisterFrame`). The client refuses yourself ("Can not private talk
  with yourself!", hard-coded English).
- Delivery: `CustomByName(target)`; if the target is offline or the name is unknown the sender
  gets `Common_PlayOutLine` "The player is offline!". **Nothing is queued** for offline players.
  On success the sender gets an echo (type 101, `Chat_WhisterBack`).
- Rate limit: `role/Chat.ini [1] TimeSpace=0`, compared with `<=` on whole game seconds, so one
  whisper per second. `VIPTimeSpace` is loaded but never read for any channel.
- Mute: `KillChat` (495-541, GM) pushes `WhisterTimeSpace` into the future; muted players get
  `FeedBack_Common_162`. Channel 100 mutes everything.
- Length: no server limit. Client caps: chat input 100 chars (`UI_Chat` 251), whisper window 50
  (`UI_WhisterFrame` 107).
- Filtering: none on the server. The **receiving client** replaces banned substrings with `***`
  (`PublicData.LanguageLimiteTrans` 1038, KV `languagelimit.s28379.kv`, 706 entries: `<`, `>`,
  `|`, `lg_`, ` GM`, operator brand names, Indonesian and Chinese profanity). That list is what
  keeps HTML out of chat: messages are inserted into HTML templates unescaped.
- Blocking: none (see the enemy table). No level gate (world chat needs level 10,
  `FeedBack_Common_076`; whispers do not).
- History: client-only, saved per own name in a Flash SharedObject (`UI_WhisterFrame` 148, 492).
  A new whisper makes the minimap Whisper button (and the battle UI one) blink.

## Mail

### Storage model

The game server forwards everything to the mail domain server (P `MailServer`), which persists in
DB table `mail` (`FIELD_NAME varchar(100)` primary key, `FIELD_DATA longblob`; same shape as the
other domain tables). Fields: `nation0mail`..`nation4mail` (one record per character name, by
village), `systemmail` (GM broadcasts + per-player read flags), `LastLoginTimeField`,
`EnemyField`. On every login the domain sends the full list (command 40) into the role records
`MailRecord` (max 128) and `SystemMailRecord` (max 20); those are not saved with the role.

Mail row (both records, 9 columns): `SendName`, `SendUid`, `Type`, `State` (0 unread / 1 read),
`content`, `SuperLink` (URL), `Data` (send time, game seconds), `title`, `totalCount` (broadcast
serial). There is **no mail id**: the client deletes and reads by row index.

### Types and categories

Client category order (`UI_MailFrame._mailTypeAry` = 0, 2, 8, 10, 5, 4, 7, 6, 9, 3, 1).

| Type | Category (key)                                           | Sender / content                                                                                            | Cap per player                    |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0    | Notification System (`Common_SystemNoticeMailTab`)       | GM broadcast, sender "GM", optional link button                                                             | 10, server-wide list              |
| 2    | Player Message (`Common_PlayerMailTab`)                  | players                                                                                                     | 10                                |
| 8    | Arena (`Common_MailArenaMailTab`)                        | arena results `FeedBack_Common_148/149` (`CompeteSystem` 1548), ring duels `lg_LT*` (`ArenaSystem` 728)     | shared pool of 25 (types 1, 4-10) |
| 10   | Market (`Common_MailMartMailTab`)                        | Market domain: `MarkerMail_0001`..`0010` (sold, expired, bought, withdrawn)                                 | shared pool                       |
| 5    | Master and Disciple (`Common_MailSlaveMailTab`)          | `SlaveSystem` 660, Home domain                                                                              | shared pool                       |
| 4    | Player Interaction (`Common_MailInterMailTab`)           | friend added/removed notices, referral warnings, Train domain                                               | shared pool                       |
| 7    | National League (`Common_MailMatchMailTab`)              | Compete domain `Mail_NatMatch_*`                                                                            | shared pool                       |
| 6    | World Martial Arts Tournament (`Common_MailRaceMailTab`) | `WorldCupSystem` `Mail_WorldCup_01..10`                                                                     | shared pool                       |
| 9    | Las Noches (`Common_MailSGateMailTab`)                   | `SingleGateSystem` 574 `SingleGate_210`                                                                     | shared pool                       |
| 3    | Battle Messages (`Common_ArenaMsgMailTab`)               | arena message board (player text after an arena challenge)                                                  | 5                                 |
| 1    | Others (`Common_MailOtherMailTab`)                       | combo attack and hall training summaries (`Mail_Attack`, `Mail_Hall`), weekly quest honor (`TaskMail_0001`) | shared pool                       |

System mails (all types except 0, 2, 3) are built by `MailSystem.SendSystemHintMail` (555-575):
sender "SystemHint", title is a language key, content is `<key>\b<kind>,<value>;...` where kind 1
= player name (clickable), 2 = item config id, 3 = arena result (`Common_ArenaFightResult_0..2`),
10 = other text. The client translates on display (`UI_MailFrame.onClick` 773-835). Domain servers
Home, Mart, Train and Compete send them through `OnDomainMessage` (644-669) with types 5, 10, 4, 7.

### Player mail

Client write panel (`UI_MailFrame.sendMail` 1057-1092, `WriteNewMail` 1169-1180): recipient combo
pre-filled with the friend list but editable (any name), subject max 20 chars single line, body
max 200 chars; all three required (`Common_MailToNull`, `Common_MailTitleNull`,
`Common_MailContentNull`); not yourself (`Common_SendMailError`). Opened from the minimap Mail
button, "Write Letter", "Reply", the player context menu "Send Mail", and friend/enemy rows.

Server (custom 145, `CanSendUserMail` 463-475, `SendUserMail` 477-497): 4 args; subject 1-20
chars, body 0-200 chars (`MailPropConfig.ini`), recipient name != own name (case-sensitive). No
level gate, no cost, no rate limit, no word filter. Domain `OnAddMailRecord` (532-563):

1. recipient has no mail record → sender gets `SendMailPlayerNameNotExist` ("The player does not
   exist or has not logged in for 15 days, cannot receive your mail!");
2. recipient's last login is 15+ days ago → their **whole mailbox is deleted** and the sender gets
   the same message;
3. otherwise the sender gets `SendMailSuccess` **before** the block check;
4. if the recipient blocked the sender (enemy row with block = 1), the mail is dropped silently;
5. `PushMail` evicts the oldest mails of that category until there is room, the row is stored,
   and an online recipient gets it live (command 41). The minimap Mail button starts blinking.

Offline recipients receive it at next login. There is no outbox or sent-mail copy.

### Arena messages (type 3)

After an arena challenge the board `UI_ArenaMessageBoard` (100 chars) sends custom 140
`[target, "", text, "", fightResult]`. Server `CanSendAreanMail` (390-401): body <= 200, no `\b`,
not yourself. Title = sender name + a Chinese suffix from RES `javascript/mail/InitProp.js`
("'s arena message to you"; English candidate `Common_ArenaMsg_MailTitle`). Content template
`Mail_AreanContent`. The server does not check that a fight happened; `fightResult` is
client-supplied.

### GM broadcast (type 0)

GM tool `SendSystemMailBroad` (RES `javascript/gm/gm.js` 863) → `SendBroadCastMail` (509-529):
title, content (< 200 chars), link. Stored once (`AddSystemRecord` 419-445, max 10 kept, oldest
dropped), pushed to all online players (custom 81), each player keeps only read flags by serial.
Type 0 mails cannot be deleted by players (the client hides Delete) and never expire.
`Resource/Mail/SystemInitMail.ini` holds a Chinese welcome mail, but `MailServer.LoadResource`
(1234) never reads it, so no welcome mail was ever sent. Other GM mail commands: `GetAllMail`,
`SendUserMail`, `SendAreanMail`, `RemoveMail`, `ClearMail` and debug `OnDebugMail` (1247-1303,
inspect or shift last-login and mail times).

### Read, delete, expiry

| Action                 | Custom  | Behaviour                                                            |
| ---------------------- | ------- | -------------------------------------------------------------------- |
| Open mail              | 146     | `[kind, index]`, sets `State = 1` locally and in the domain          |
| Mark category read     | 141     | all unread of one type (0-10)                                        |
| Mark all read          | 137     | player mails and broadcast flags                                     |
| Delete one             | 143     | by row index, confirm `Common_ISsure_Delete`                         |
| Delete category        | 142     | all mails of one type                                                |
| Delete all             | 144     | clears `MailRecord` (broadcasts stay), confirm `Common_ClearAllMail` |
| Remember last category | 138/139 | `LastOpenMailType` property, reopened next time                      |

Expiry is checked only when the owner logs in (`OnGetMailRecord` 603-674): every mail of type
1-10 **older than 48 hours** is deleted (`AutoDelOverTimeMail` 279-294,
`m_SystemHintMailMaxSaveTime = 172800`, hard-coded at 55; this includes player and arena mail).
Read or unread makes no difference. Inactive players: see the 15-day purge above
(`m_PlayerMailDestroyTime = 1296000`, line 56). The values in `MailPropConfig.ini`
(`PlayerMailMaxSaveTime=72`, `SystemHintMailMaxSaveTime=72`, `PlayerMailMaxCount=20`,
`SystemHintMailMaxCount=20`, `SystemBRMailCount=20`) are **not read** by any code; only the three
length keys are.

## Atomicity, exploits and bugs

Mail carries no value, so there is no dupe in mail itself. Issues worth knowing (numbers are
referenced from the recommendations):

1. **Inbox flush.** Ten player mails evict the victim's whole player inbox; five arena messages
   evict all battle messages. No cost, level gate or rate limit (`PushMail` 371-417).
2. **Block bypass.** The block flag filters type 2 only; a blocked player can still reach you by
   arena message (custom 140) at any time, with any fight result, and by whisper.
3. **Template spoofing.** Player mail content is not checked for `\b` (only arena mail is), so a
   body like `Mail_WorldCup_02\b10,x;` renders as any system text. The receiving client's word
   filter strips `lg_`, `<`, `>`, `|`, but not the template marker.
4. **HTML rendering.** Mail titles, bodies, chat and whispers are set with `setHtmlText` without
   escaping; only the client-side banned-word list stops tags. A modified sender cannot bypass it
   because the receiver filters, but our port must never rely on such a list.
5. **Name probing.** `SendMailPlayerNameNotExist` vs `SendMailSuccess` reveals whether a name
   exists and whether it has been inactive 15 days, and the probe itself wipes the inactive
   player's mailbox (`IsNeedDestoryMail` 296-307 inside the send path).
6. **Index-based delete.** Delete and read address mails by row index. A mail arriving (and
   evicting the oldest) between list and click shifts indexes and deletes the wrong mail.
   `CanRemvoeMail` (342-345) is `index >= 0 || index < Rows`, always true; negative indexes reach
   the domain unchecked (`OnDelMailRecord` 736-757 only checks the upper bound).
7. **Game-side eviction bug.** `MailSystem.PushMail` case 0 (127-131) looks up the index in
   `MailRecord` but deletes from `SystemMailRecord`.
8. **Friend expansion overpay.** The server charges the requested count even when the cap trims it
   (95 + 80 → pays 80 Gold for 5 slots, `ExtendFriend` 526-534); only the client prevents it.
9. **Free teleport race.** "Go to enemy" checks Gold before a cross-player round trip and ignores
   the result of `DecCapital` afterwards (662), so spending the Gold in between still teleports.
10. **Harassment loop.** Add → delete → add sends the target a mail and a modal prompt every time;
    no cooldown, and enemies cannot stop it.
11. **Re-add dead end.** If A deleted B one-sidedly while B still has A as a home friend, A can
    never re-add B (`OnCommandHomeSrcIsDestF` 718-760 has no branch for B's col 7 = 1).
12. **Stale enemy info.** `OnCommandReturnEnemyInfo` (613-619) requires 1 argument but receives 2,
    so enemy levels never refresh. `RefreshFrindInfo` and `RefreshEnemyInfo` test `row < -1`
    instead of `row < 0`.
13. **Dead config.** `MaxEnemyCount`/`InitEnemyCount` unused (first login sets `MaxFriend` twice,
    102-111); `MailSet`/`SystemSetField` never initialised; `SystemInitMail.ini` never loaded;
    `VIPTimeSpace` never read.
14. **Rename fragility.** Friend, enemy and mail data are keyed by character name strings.
15. **Wrong perspective text.** Deleting a normal friend mails the target the title
    `Mail_Title_001` "[Normal Friend] You have removed them." (should read from their side).

## Config values

| File                                    | Key                                                                                   | Value                                                          | Used                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| RES `interaction/interaction.ini` (GBK) | `InitFriendCount`                                                                     | 20                                                             | yes                                                                   |
|                                         | `MaxFriendCount`                                                                      | 100                                                            | yes                                                                   |
|                                         | `InitEnemyCount` / `MaxEnemyCount`                                                    | 20 / 100                                                       | no                                                                    |
|                                         | `AddFriendWord`                                                                       | Chinese                                                        | no (JS strings used instead, also unused)                             |
| RES `Mail/MailPropConfig.ini`           | `PlayerMailMaxTitleWord`                                                              | 20                                                             | yes                                                                   |
|                                         | `PlayerMailMaxTextWord`                                                               | 200                                                            | yes (player and arena mail)                                           |
|                                         | `SystemHintMailMaxTextWord`                                                           | 200                                                            | yes (GM broadcast, `<` 200)                                           |
|                                         | `PlayerMailMaxSaveTime`, `SystemHintMailMaxSaveTime`                                  | 72                                                             | no (code uses 48 h)                                                   |
|                                         | `PlayerMailMaxCount`, `SystemHintMailMaxCount`, `SystemBRMailCount`                   | 20                                                             | no (code uses 10 / 25 / 10)                                           |
| P `MailServer` (hard-coded)             | mail lifetime (types 1-10)                                                            | 172800 s                                                       | 48 h, checked at owner's login                                        |
|                                         | inactive-mailbox purge                                                                | 1296000 s                                                      | 15 days, checked when someone mails them                              |
|                                         | caps                                                                                  | type 2: 10, type 3: 5, types 1/4-10: 25 shared, broadcasts: 10 | evict oldest of the category                                          |
| J `FriendSystem` (hard-coded)           | slot price                                                                            | 1 Gold                                                         | max 80 per request                                                    |
|                                         | "Go to enemy" price                                                                   | 1 Gold                                                         | KV `SocietykillEnemyCost` for the client text                         |
| RES `role/Chat.ini`                     | `[1]` whisper / `[2]` village / `[3]` world / `[4]` team / `[5]` scene / `[10]` train | `TimeSpace` 0 / 10 / 30 / 5 / 5 / 5 s                          | whisper and train compare with `<=`                                   |
|                                         | `VIPTimeSpace`                                                                        | 0 / 5 / 5 / 2 / 2 / 2                                          | no                                                                    |
| J `ChatSystem.SendWorld`                | world chat level                                                                      | 10                                                             | yes                                                                   |
| KV `languagelimit.s28379.kv`            | banned substrings                                                                     | 706                                                            | client display filter (`***`)                                         |
| KV `chatlegalcharset.s16727.kv`         | allowed character set                                                                 | -                                                              | not referenced by the client scripts                                  |
| DT `chat.s4673.tab`                     | channel ids → labels and templates                                                    | -                                                              | 1 PM, 2 village ("Guild"), 3 world, 4 team, 5 scene, 101 whisper echo |

## Protocol reference

| Custom  | Handler                                                                                  | Args                                   |
| ------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| 23      | `OnCustomOpenFriendDlg`                                                                  | 1 friends / 2 enemies (refresh status) |
| 24      | `OnCustomGotoEnemyScene`                                                                 | name                                   |
| 25      | `OnCustomAddFriend`                                                                      | name                                   |
| 26      | `OnCustomDelFriend`                                                                      | name                                   |
| 27      | `OnCustomAddEnemy`                                                                       | name, block (0/1)                      |
| 28      | `OnCustomDelEnemy`                                                                       | name                                   |
| 29      | `OnCustomExtendFriend`                                                                   | slots (1-80)                           |
| 30      | `OnCustomSetCoverEnemyMail`                                                              | name, block                            |
| 634     | `OnCustomDelHomeFriend`                                                                  | name                                   |
| 40      | `ChatSystem.OnCustomChat`                                                                | type, text[, target]                   |
| 14      | `LookSystem.OnCustomQueryOnline`                                                         | name (whisper "find player")           |
| 137-147 | `MailSystem` (see table above; 140 arena message, 145 player mail, 147 fetch broadcasts) |                                        |

## Client windows and flows

- **HUD bottom menu "Friends"** (`SceneUI/UI_BottomMenu.as` 84, 194-210, control `Social`,
  tooltip `Tip_Social`): toggles the Friends window. No level gate. Mail and Whisper are **not**
  in the bottom menu; they are buttons on the minimap (`UI_SmallMap` 274-286, 430, 535-570), which
  blink on new mail, new broadcast and new whisper.
- **Friends window** (`UI_Society_Xml` "Friends", `UI_SocietyFrame`): tabs `Common_FriendList` and
  `Common_EnemyList`; counter "Current number of friends: n/max"; buttons Add Friend / Add Enemy
  (follows the tab), Find Player (`UI_FindPlayer`: type a name, opens that player's info),
  Add List (`UI_ExtendSociety`). Friend row: name link, gender icon, level, village, class,
  online icon, standing, home flag; click name → Look info, Private Chat, Write Letter, Delete,
  plus "Friend's Home" for normal friends (`UI_SocietyFriendCell` 141-208; a Trade label is built
  but not shown). Enemy row: same columns plus Block link and "Go to" button; menu Look info,
  Private Chat, Write Letter, Delete (`UI_SocietyEnemyCell`).
- **Player context menu** (`Common/PlayerMenuManager.as`, any clickable name): Look info,
  Whisper, Add Friend, Add Enemy, Trade, Send Mail, Team, PK.
- **Private Message window** (`UI_WhisterFrame`, "Private Message"): open conversations list with
  close buttons, friend picker combo, find-player button (custom 14 checks online), message list,
  50-char input, title `WhisterMsg_Title`.
- **Mail window** (`UI_Mail_Xml`, `UI_MailFrame`, 1431 lines): left accordion with a Mail section
  (11 categories with unread/total counts, mark-all-read and delete-all icons) and a Battle
  section (saved battle replays from `SaveFightRec`, max 999: All, Arena, Stage, Other). Right:
  list panel (per-category list, batch read and delete), read panel (type, sender, subject,
  time, body; Reply, Add Friend and Block for player/arena mail; Link for system mail; Delete,
  Return), write panel (described above). Saved battles belong to the arena/replay work, not mail.
- **Arena message board** (`UI_ArenaMessageBoard`): one text box after an arena challenge.

## Referral system (FindFriend), for completeness

Level 15+ players copy an invite link (`FindFriendUrl`, a 7k7k portal URL). Referrers earn EXP when
a referee reaches levels 20-70 (3,200 to 1,400,000), referees earn EXP plus pouch bags
(i150352-i150356, i150581) at their own milestones, and referrers get 10% of the referee's Gold
spending as Gift Coupons (`moneymul=10`); max 30 referrals a month, relationship dissolved after
15 days of referee inactivity with a warning mail at 10 (RES `interaction/findfriend.ini`,
DT `findfriend.s12528.tab`). It is a real-money growth feature tied to the portal: leave it out.

## Recommended scope for M4

Port 1:1 (behaviour players will recognise):

- Friends window with the two tabs, list cap 20 expandable to 100 at 1 Gold per slot, one-sided
  add with an add-back prompt, mutual = "home friend" flag (store it now, used in M6),
  one-sided remove with a notification mail, online status, context-menu actions.
- Enemy list with the per-entry "block mail" flag and "Go to" for 1 Gold.
- Whisper by name, online only, `Common_PlayOutLine` when offline, 1 per second.
- Mail: player mail (subject 1-20, body 1-200), 11 categories, read/unread, mark read and delete
  per mail / category / all, reply, add friend and block from a mail, caps 10 player / 5 battle
  messages / 25 system, 48-hour lifetime, GM broadcast with optional link.
- Typed system mails from our systems: friend added/removed, Market notices, arena results.

Simplify or fix:

- Key everything by `characterId`; names only for display and lookup.
- Mail rows get a UUID; read/delete by id, never by index (fixes 6, 7). Do the cap eviction and
  insert in one transaction.
- Store system mails as `{ templateKey, params }` JSON and player mails as plain text rendered as
  text, never HTML (fixes 3, 4). No `\b` encoding.
- Allow adding friends and enemies who are offline (we have the data in the DB), but keep a
  pending add-back prompt for the target's next login.
- Charge expansion only for slots actually added (8); debit Gold and teleport in one transaction
  (9).
- Lifetime: 48 h is harsh for a game people play daily but not hourly; suggest 7 days for player
  mail and 30 days for system mail, purged by a periodic job, not at login (see question 3).
- Drop the 15-day mailbox wipe and the "does not exist or inactive" message; answer the same
  "Mail sent" for unknown names to avoid name probing (5), or reject unknown names explicitly
  (question 5).
- Persist whisper history? The original kept it only in the browser; keep it client-side
  (localStorage) or not at all.
- Defer: referral system, saved battle replays in the mail window (arena milestone), home/garden
  friend features (M6), welcome mail (write our own English one if wanted).

Security, abuse and moderation:

- **Real blocking.** Make "block" stop whispers, player mail, arena messages, friend prompts,
  trade and team invites from that player (2, 10). Decide whether block stays inside the Enemy
  list or becomes its own list (question 1).
- Rate limits on the server: whispers (reuse `chat-limiter.ts`, e.g. 5 per 5 s like world chat),
  mail (e.g. 10 per hour per sender, 3 per hour to the same recipient), friend requests (e.g. one
  pending prompt per pair, 20 per hour).
- Server-side text rules: reuse `chatTextSchema` (control and bidi characters stripped, plain
  text); add an English profanity filter or none (question 6), never HTML.
- Level gate for sending player mail (the original had none; world chat needs level 10) to slow
  throwaway-account spam (question 4).
- Moderation hooks: GM mute per channel (the original `KillChat`), report button on whispers and
  mails, keep sent mail rows for N days after deletion for reports, admin view in M6.
- If attachments are ever added (question 2): escrow on send in the same transaction that
  debits the sender, claim with a single conditional update (`claimed_at IS NULL`), return to
  sender on expiry, bound items blocked, and audit-log every move.

Open questions for the product owner:

1. Keep the original "Enemy List" (block is a per-entry option, plus "Go to enemy" teleport) or
   split into a friendly "Blocked" list and drop or keep the teleport?
2. Mail attachments: keep the original text-only mail, or add item/Stone attachments (a new
   trade channel that needs escrow and anti-RMT rules)?
3. Mail lifetime: original 48 h for everything (checked at login), or longer (suggested 7 days
   player / 30 days system)?
4. Minimum level to send player mail and whispers (original: none; world chat level 10)?
5. Sending mail to an unknown name: explicit "player not found" (original, enables probing) or a
   neutral "mail sent"?
6. Profanity filter: port an English word list (the original list is mostly Indonesian and
   Chinese), use a library, or rely on block/report only?
7. Friend add: keep "target must be online" and the instant one-sided add, or require the target
   to accept before the row appears on either side?
8. Should whispers be stored and delivered to offline players (like mail), or stay online-only?
9. Keep paid list expansion (1 Gold per slot, 20 → 100), or give everyone 100 slots?
10. Show friends' login/logout live (needs push events), or keep the original refresh-on-open?

## Language keys

Friends: `Common_FriendList`, `Common_EnemyList`, `Common_CurFriendNum`, `Common_CurEnemyNum`,
`Common_AddFriend`, `Common_AddEnemy`, `Common_AddFriendPrompt`, `Common_EnemyToFriend`,
`Common_FriendToEnemy`, `Common_FriendIsMax`, `Common_FriendIsMax_1`, `Common_EnemyIsFull`,
`Common_CannotADDSelf`, `Common_CannotADDSelfEnemy`, `Common_PlayerIsAddedEnemy`,
`Common_NameEmpty`, `Common_SocietyDelFriendInfo`, `Common_SocietyDelFriendInfoAtHome`,
`Common_SocietyAddHomeFriend`, `Common_SocietyDelEnemyInfo`, `Common_SocietyKillEnemyInfo`,
`Common_SocietyKillEnemyLockGold`, `Common_AddEnemyshield`, `Common_AddEnemyUnshield`,
`Common_Shield`, `Common_UnShield`, `Common_HomeFriend`, `Common_ExtendAcount`,
`Common_ExtendSocietyListDes`, `Friend_Err_NotOnline`, `Enemy_Err_NotOnline`,
`Friend_Hint_AddFrind`, `Friend_Hint_AddSuccess`, `Friend_Hint_ExtendSuccess`,
`Lang_Friend_001..005`, `SceneNotGoEnemy`, `EnemyAlreadyExistScene`, `Society_*`,
`SocietyAddFriend_*`, `SocietyAddEnemy_*`, `SocietyExtend_*`, `UI_Society_Xml`, `Tip_Social`.
Whispers: `Channel_Whister`, `Chat_Whister`, `Chat_WhisterBack`, `Common_Whister`,
`Common_PlayOutLine`, `ChatHasNoTargetUser`, `Whister_*`, `WhisterMsg_Title`,
`UI_WhisterFrame_Xml`, `FeedBack_Common_075`, `_076`, `_077`, `_162`.
Mail: `UI_Mail_Xml`, `Common_*MailTab`, `Common_Mail*`, `Common_PlayerMail`,
`Common_SystemNoticeMail`, `Common_ClearAllMail`, `Common_ReadAllMail`, `Common_ISsure_Delete`,
`Common_SendMailError`, `SendMailSuccess`, `SendMailPlayerNameNotExist`, `MailRead_*`,
`Mail_Write`, `Mail_AreanContent`, `Common_ArenaMsg_MailTitle`, `Common_ArenaFightResult_0..2`,
`AddFriendMailTitle`, `AddFriendMailContent`, `Mail_Title_001..004`, `MarkerMail_0001..0010`.
