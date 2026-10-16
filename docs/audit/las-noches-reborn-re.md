# Las Noches: Reborn reference investigation

Follow-up: [monster names and battle skill verification](las-noches-monsters-re.md)
records the subsequent live run through floor 20; the no-battle scope below
describes this initial inspection only.

Inspected 2026-10-16 at https://pockieninjareborn.com/ using the owner's
`genshinhoyo` session (character Nagatoro, level 21). No fight, paid route,
Claim, inventory change, or daily attempt was executed in this investigation.
The browser remains at the tower's ready screen.

## Evidence and limits

- Live DOM, React component state and the Info/VIP confirmation panels were
  inspected through the T3 collaborative browser. These are observations of the
  client and its received state, not access to the production server source.
- Public bundle: `/static/js/main.cfd1c9d9.js`; stylesheet:
  `/static/css/main.8d223085.css`.
- REA MCP `analyze_javascript_application` analyzed seven exact extracted
  declarations (lobby, tower, scene, SVG frame/lives/progress and transition
  effects). All seven parsed successfully. Application coverage is complete
  **within the extracted input**, while semantic coverage remains unknown/
  partial because minified external dependencies are unresolved (1,326 semantic
  unknowns). This is not a complete server or full-application reconstruction.
- REA application Evidence:
  `ev_4ce67e58a0daadabb4bdfc434537000b16c43ddbc3d59607fd204e8c607bf0da`.
  Summary receipt:
  `ev_3733a13ce1d63556652da96778c70be1253501ee6f58d7efd8aee854f4eb6379`.
- A bounded semantic trace of the daily-entry property read returned one seed
  and no downstream relations under the selected relation filter. It establishes
  no further gameplay behavior. Trace Evidence:
  `ev_b250c96f13a00eda3cd87fb74ab7e18f36b179483b5eedf82ae620be38d1cef1`.
- Raw evidence, source offsets/hashes, readable excerpts, DOM snapshots, CSS
  and downloaded originals are local, gitignored under
  `data/reborn-raw/re/las-noches-2026-10-16/`. Source offsets in
  `provenance.json` count UTF-16 code units. Excerpts add only a `const` prefix
  and semicolon so REA can parse them separately; they were never executed.
- `rea-evidence.json` exports the canonical REA records. Existing historical
  `data/reborn-raw/re/rpc/lasNochesInfo.json` independently has the same idle
  state as this observation; it is historical corroboration, not a fresh RPC.

## Entry and state transitions

| User action               | Frontend command / transition                                   | Evidence                                     |
| ------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Click Storming Las Noches | Opens Kisuke Urahara (NPC 17003)                                | Live UI, bundle                              |
| Enter Las Noches (3/3)    | `switchScene(3101)`                                             | Live UI, bundle                              |
| Lobby loads               | `lasNochesInfo` obtains route eligibility and floor state       | Bundle; live component state                 |
| Start                     | `lasNochesEnter({})`, then scene 61 on a valid success response | Bundle; live navigation                      |
| Begin Challenge           | `lasNochesStart(null)` when `current === -1`                    | Static callback                              |
| Next Floor / Bonus        | `lasNochesAttempt(null)` for an active run                      | Static callback                              |
| Claim                     | `lasNochesClaim(null)`                                          | Static callback; Info explains its outcome   |
| Leave Tower               | `switchScene(171)`                                              | Static callback; observed earlier navigation |
| Server update             | `updateLasNoches` replaces the tower state                      | Static subscription                          |

Opening the lobby and selecting Start did not change the visible Stones or
3/3 daily tries. This does not prove whether Begin Challenge has another cost.
Do not conflate entering scene 61 with starting or fighting a run.

The server supplies `current`, `attemptsLeft`, `exp`, `nextExp`,
`highestFloor`, `currentMonster`, `nextMonster`, `checkpoints`,
`expressStartFloor`, `vipStartFloor` and `bonusEncounterName`.

The frontend treats `current === -1` as inactive. In an active run it displays
the cleared/current floor as `max(0, current)` and the next challenge as
`current + 1`; it does not itself generate the enemy or its reward.

Observed idle state: `current: -1`, `attemptsLeft: 2`, `exp: 0`,
`nextExp: 355`, `highestFloor: 24`, `checkpoints: []`,
`expressStartFloor: null`, `vipStartFloor: 59`, `bonusEncounterName: null`.

## Run rules

These rules are explicitly stated by the live Info panel. Losses, Claim and
mail delivery were not exercised, so their server implementation remains
unverified.

1. Clearing a floor adds EXP to a bank; item drops go to the bag, with mail
   overflow when the bag is full.
2. Each run has two lives. A loss costs one life and keeps the same floor.
3. A loss halves banked EXP; losing the last life wipes it completely.
4. EXP is paid only on Claim. Claim ends a run and uses one of three daily
   tries. The panel says they reset at midnight; the reset timezone is unknown.
5. Highest floor persists as the personal record.

There is an important end-state ambiguity: the rules say the final loss ends
the climb, while a separate frontend warning says "Claim to end the run" when
an active run has no lives. The UI permits Claim whenever a run is active,
including when EXP is zero. Verify this final-loss acknowledgement and daily
try accounting before implementing it; do not invent automatic payment.

The UI disables the main challenge button at zero lives, during start loading,
or when inactive with no daily tries. Auto Battle is disabled before a run
starts and at zero lives. Claim is disabled while inactive.

## Express and VIP

- Express costs a fixed 50,000 Stones. The reference translation says it
  requires clearing floor 50 and begins at an unlocked checkpoint. The account
  has best floor 24, `expressStartFloor: null`, and a disabled Express button.
  The server selects the checkpoint; the complete mapping is unknown.
- VIP is gated by `character.vip.isVip`. This account can open its confirmation,
  which says floor 59 and skipped-floor rewards sent to mail. Confirmation was
  cancelled. The command is `lasNochesVipRoute({})`.
- Express confirmation uses `lasNochesExpressRoute({})`. Both successful
  responses lead to scene 61. Neither frontend sends a client-chosen floor.
- There is no evidence for the local half-highest-floor formula, variable
  Express price, paid revival, or Gold auto-run packages in this inspected UI.
  That is a bounded UI finding, not proof those features exist nowhere else.

## Auto Battle

The tower toggles a client auto flag shared with the fight-result component.
If enabled, a run is active, lives remain and the fight state is finished, it
requests `lasNochesAttempt`. The result component clears the previous fight
with `clearFight({})` and requests another attempt after a three-second
countdown. The tower stops auto on no lives, an inactive run, or unmount.

This is client-driven consecutive combat in the inspected frontend. It is
different from our paid, offline, 30-second simulated progression. Background
tab timing, network failures and exact stop behavior after a real loss were
not exercised.

## Enemies, rewards and bonus encounters

The next enemy preview uses `nextMonster` from server state. Its portrait is
`icons/monsters/<avatar>.png` for avatar IDs >= 10000, otherwise
`icons/people/<avatar>.png`.

Observed floor 1 enemy: avatar 32051, level 1, HP/maxHP 124, Chakra/maxChakra
124, attack 20–25, speed 1257, and defense/hit/pierce/defenseBreak/con/dodge 0.
The next reward shown is 355 EXP. This matches our imported first-floor EXP,
but does not establish the complete current Reborn floor table.

The UI labels `dodge` as **Block**. HP and Chakra show current/max only when
they differ. The frontend also supports a named `bonusEncounterName`, replacing
the next-floor label, heading and main action with Bonus; its trigger, enemy
pool, drop probabilities and effect on floor progression are server unknowns.

## Visual system and acquired assets

The tower is a full scene with an enemy panel on the left, progress and actions
in the center, and EXP/lives/daily tries/record on the right. Base canvas is
1120×580; scale is clamped to 0.5–1 and horizontal spread to 0–150px. It retains
the normal HUD, chat and quest navigation.

Progress markers use current/next/record values. The displayed ruler maximum
is rounded up to a multiple of ten based on next floor and record. A displayed
30 is therefore **not** evidence of a 30-floor tower cap. Decorative progress,
mask frame, life masks, crown and divider are inline SVG. Plates and action
buttons include CSS-embedded SVG borders, with original/dark-theme overrides.
Use the full saved stylesheet when reconstructing; isolated SVG snapshots do
not carry the CSS classes, dynamic marker positions or animation state.

Optimized exports are in `client/public/assets/reborn/las-noches/`:

| Asset              | Export                            | Dimensions / provenance                                               |
| ------------------ | --------------------------------- | --------------------------------------------------------------------- |
| Tower background   | `background.webp`                 | 1920×1080; downloaded and hash-matched to live browser fetch          |
| Fight background   | `fight-background.webp`           | 1000×600; existing public reference asset, not a newly observed fight |
| Demon City         | `demon-city.webp`                 | 1921×1081; hash-matched live                                          |
| Entrance           | `entrance.webp`                   | 360×298; hash-matched live                                            |
| First enemy        | `enemy-32051.webp`                | 82×82; hash-matched live                                              |
| Lobby button       | `lobby-button.webp`               | 70×19; hash-matched live                                              |
| Lobby panel        | `lobby-panel.webp`                | 100×53; hash-matched live                                             |
| Enemy frame        | `enemy-frame.svg`                 | Live DOM SVG, CSS-dependent                                           |
| Lives              | `life-mask.svg`                   | Live DOM SVG, CSS-dependent                                           |
| Progress           | `progress-rift.svg`               | Idle DOM snapshot, CSS/state-dependent                                |
| Record and divider | `record-crown.svg`, `divider.svg` | Live DOM SVG, CSS-dependent                                           |

The existing `/assets/reborn/audio/lasNoches.mp3` is reused; no duplicate audio
was added. `las-noches-assets.json` records source URLs, SHA-256 identities,
export dimensions and sizes. WebP dimensions were checked against originals;
SVG exports were checked for active script/event attributes.

The bundle references lobby `scenes/backgrounds/3101.png`, but an exact browser
fetch returned the site's HTML fallback, not an image. A cache-busted request
returned bytes identical to tower 61.png. Those ambiguous bytes were segregated
as `3101-cache-busted-unverified.png`; no lobby background was exported or
claimed as verified.

## Differences from our implementation

| Area          | Local behavior                                     | Required Reborn alignment                                         |
| ------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| UI            | Small lobby dialog also holds active-run controls  | Separate lobby and full tower scene                               |
| State         | `floor` means next opponent; no idle enemy preview | Explicit idle/current/next fields and server enemy/reward preview |
| Lives         | One reserve life, then a terminal loss             | Two displayed lives; halve on first loss, wipe on last            |
| Terminal EXP  | Automatically pays half after final loss           | No half-pot payment; verify final Claim/try accounting            |
| Start         | Charges 1,000 Stones                               | Opening tower observed unchanged; Begin Challenge cost unresolved |
| Express       | Half highest floor; formula price                  | Server checkpoint, floor-50 unlock, fixed 50k price               |
| VIP           | Not exposed by Las Noches schema/UI                | Eligibility and floor 59 route from server                        |
| Auto          | 28/58/91 Gold, 30-second/offline simulated runs    | Client repeats real fights, three-second result countdown         |
| Loot overflow | Unstored drops lost                                | Bag then mail, according to Info                                  |
| Bonus         | No tower UI branch                                 | Named bonus encounter branch                                      |

Changes would reach game-core run rules/tests; shared request/view schemas and
fixtures; server route/state/reward/mail handling and API tests; and client
lobby, tower scene, preview data, auto replay integration and UI tests. Existing
active runs and paid auto queues need an explicit migration decision before
changing their semantics. No gameplay implementation was modified here.

## Remaining verification

- Server-side checkpoint mapping, max floor, enemy scaling and complete EXP table.
- Final-loss Claim state, rounding, daily-try consumption and reset timezone.
- Paid/free eligibility, skipped-floor item tables and full-bag mail delivery.
- Bonus encounter triggers and rewards, HP/Chakra carry-over and recovery.
- Behavior on reload/reconnect, failed requests and background auto timing.

These need controlled gameplay observations or owner-provided server data;
static frontend analysis cannot establish them.
