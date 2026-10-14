# Reborn quests

Run `node tools/quests/reborn-story.ts` from the repository root. The generator writes
127 Task.ini rows, their SubTask.ini objectives, quest-drop rows, and only the quest
text keys in `client/src/i18n/reborn.json`. `names.json` stores the normalized Reborn
names/ids; `story-text.ts` contains original prose. No raw sentence data is needed.
Run this generator after `pnpm game-data:reborn`, whose general overlay import writes empty quest placeholders.

The nine tutorial quests form a chain with omitted systems skipped. Story quests
30001–30118 form a separate branch chain, from level 1 to 70. The three seal
proposals are sequential investigations rather than mutually exclusive choices.
Unknown steps, NPC assignments and level gates are our design. Shared field bands
start at level 26. Canonical low-level Fire coordinates map to the character's home
village, including equivalent monsters where field rosters differ. The API sends
local objective-name arguments and navigation targets, including the submit NPC
once the quest is ready. This does not alter the 2011 quest or travel rules. Collection sources reuse existing quest-item definitions and
monster/scene drop probabilities, under independent quest IDs.

Rewards use half the smallest 2011 main-line EXP and Stone reward at the exact
level, rounded down. Levels without a main-line reward pay zero. No additional
items, coupons or honor are awarded. The user-approved exception is 830022:
level 21, 8 Banshees and 6 Scorching Demons in scene 2103, 3,060 EXP and 36,000 Stone.

## Coordinator hooks

Call `recordCommand(await loadQuests(tx, character.id), COMMAND, character.sceneId)`
and `saveQuests` inside the successful action's existing character transaction.
Only the constants are exported by this task; action modules are owned by their
feature tasks/coordinator.

| Export from `server/src/game/quests.ts` | ID    | Emit when                                               |
| --------------------------------------- | ----- | ------------------------------------------------------- |
| `REBORN_IDENTIFY_COMMAND`               | 82001 | Hidden equipment properties are successfully identified |
| `REBORN_ENHANCE_COMMAND`                | 82002 | Equipment enhancement succeeds                          |
| `REBORN_INSCRIBE_COMMAND`               | 82003 | Equipment inscription succeeds                          |
| `REBORN_ARENA_FIGHT_COMMAND`            | 82004 | An arena fight finishes, win or loss                    |
| `REBORN_LAS_NOCHES_FLOOR_COMMAND`       | 82005 | A Las Noches floor is cleared                           |
| `REBORN_BLOODLINE_UNLOCK_COMMAND`       | 82006 | A bloodline first becomes unlocked                      |

Do not emit on a rejected request, failed upgrade, activation toggle, or repeat
bloodline gift. Command objectives are scene-independent and count one successful
action while the quest is active. Weapon equipment uses existing command 8887.

## Checks

- `TEST_DATABASE_URL=postgres://localhost:5432/pockie_t11_test pnpm --filter @pockie/tools test -- quests`: generated data, reference integrity,
  reward caps, both chains in all five villages through actual server progress/travel rules, drop/command guards, API acceptance/hand-in and a concurrent calibration payout.
- `TEST_DATABASE_URL=postgres://localhost:5432/pockie_t11_test pnpm --filter @pockie/server test -- quests reborn-quests`
- `pnpm typecheck && pnpm lint`
