# Coordinator wiring

All changes below are intentionally outside Task 12 ownership. No job or migration is needed.

## Registration and exports

`server/src/app.ts`:

```ts
app.register(import('./modules/events/routes.js'), { db, prefix: '/api/game/events' })
```

`shared/src/index.ts`:

```ts
export * from './schemas/events.js'
```

The pure dice module is consumed directly; a game-core barrel export is optional:

```ts
export * from './events/dice.js'
```

## Non-fight buffs (required for Reborn stat values)

`server/src/game/nonfight-buffs.ts`: add `rebornNonfightBuffs` to the existing data import, then after the original `data` load:

```ts
import { item, itemNameKey, rebornNonfightBuffs } from './data.js'
Object.assign(data.buffs, rebornNonfightBuffs().buffs)
Object.assign(data.properties, rebornNonfightBuffs().properties)
```

Dice uses `useBuffItem` with a synthetic food definition, preserving replacement group 3, expiry, bonus conversion, and the existing `food` source constraint. Neutral rolls retain the active effect. The API tests simulate this exact loader merge with an FS fixture. Original definitions exist but carry the old stat values; production requires the property merge above.

## Windows and HUD

`client/src/game/windows.tsx`:

```tsx
import { NinjaDiaryWindow, DiceOfFateWindow } from './events'
```

Add `'ninjaDiary' | 'diceOfFate'` to `WindowName`; add these map entries:

```tsx
ninjaDiary: NinjaDiaryWindow, diceOfFate: DiceOfFateWindow,
```

`client/src/game/Hud.tsx`:

```tsx
import { TwentyMinuteRewardButton } from './events'
<TwentyMinuteRewardButton className="absolute top-[36px] left-[230px]" />
<GameButton onClick={() => openFeature('ninjaDiary')}>Ninja Diary</GameButton>
<GameButton onClick={() => openFeature('diceOfFate')}>Dice of Fate</GameButton>
```

Mount inside the component that has `openFeature`; choose final positions alongside existing HUD controls.

## Weekly activity call sites

Import `recordWeeklyActivity` from `modules/events/weekly-activity.js` using each caller's relative path. Insert each line inside the existing successful action transaction, with the character row locked first. Count completed actions, not requests; floor/toll counters count successful clears. Do not create a second transaction around existing transactional actions.

| Call site                                                                                                               | Exact action line                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `modules/arena/fights.ts`: `arenaFight` and `bossFight` (includes revenge via arenaFight), after accepted fight         | `await recordWeeklyActivity(tx, character.id, 'arenaDuel')`  |
| `modules/arena/duels.ts`: completed friendly duel                                                                       | `await recordWeeklyActivity(tx, character.id, 'duelFriend')` |
| `modules/gates/pub-fights.ts` and `modules/teams/runs.ts`: completed pub fight, once per participant                    | `await recordWeeklyActivity(tx, character.id, 'pubFight')`   |
| `modules/gates/las-noches.ts`: manual win and successful auto-floor, beside Reborn quest command                        | `await recordWeeklyActivity(tx, character.id, 'lasNoches')`  |
| `modules/gates/toll-gates.ts` and `modules/teams/runs.ts`: final successful gate clear, once per participant            | `await recordWeeklyActivity(tx, character.id, 'tollGate')`   |
| `modules/realtime/realtime.ts`: accepted global chat; use a DB transaction and locked sender character before recording | `await recordWeeklyActivity(tx, character.id, 'globalChat')` |
| `modules/daily/routes.ts`: successful hand-in after reward validation                                                   | `await recordWeeklyActivity(tx, character.id, 'mission')`    |

Twenty-minute activity recording is already included in its claim transaction.

## Clarifications

- Daily bonus is independent and available once per UTC day, as captured.
- Weekly points use the captured sum of per-activity floored proportional progress.
- Replenish limit is one purchase per UTC day; captured data has no value, so `DICE_BUY_LIMIT` centralizes this choice.
- Fresh characters may claim the first twenty-minute reward immediately; subsequent cooldown persists across UTC reset.
- All event item rewards are bound. Neutral dice retain an existing effect; non-neutral rolls replace it.
