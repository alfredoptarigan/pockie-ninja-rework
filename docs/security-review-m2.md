# M2 security review

Reviewed on 2026-10-12 against `ee15f65343ac739820958f650550c94e6d70e8e5` on
`chore/codex-batch`. The review covers every explicit route in `server/src/modules/game/*`
and `server/src/modules/auth/*`, the Socket.IO handlers in `server/src/modules/realtime/*`,
and the database/progression helpers those handlers call. No server or game-core code was changed.

This is a source review with the existing tests, not a load test or an exploit reproduction.
The interleavings below are inferred from the actual reads and writes. The private test database
(`pockie_codex_test`) reports `read committed`; `createDb` does not select a stronger isolation
level. The complete test suite passed before this review. Existing concurrency coverage proves
that two simultaneous explore requests do not both succeed; equivalent fight, item and quest
race coverage is absent.

| Severity | Count | Findings                                                                                 |
| -------- | ----: | ---------------------------------------------------------------------------------------- |
| Critical |     0 | None identified                                                                          |
| High     |     1 | Concurrent game writes can duplicate rewards and overwrite state                         |
| Medium   |     2 | Live socket authorization outlasts sessions; socket admission is unbounded               |
| Low      |     3 | Registration email enumeration; login budget alias/in-flight gaps; retained chat buckets |

## Findings

### 1. High — game transactions do not serialize character actions

**Locations:** `server/src/modules/game/world.ts:34`, `server/src/modules/game/world.ts:62`,
`server/src/modules/game/actions.ts:66`, `server/src/modules/game/actions.ts:74`,
`server/src/modules/game/actions.ts:196`, `server/src/game/progress.ts:59`,
`server/src/game/progress.ts:136`, `server/src/game/combat.ts:188`.

Fight and action handlers read character, inventory and quest state without row locks, then
perform absolute updates from those snapshots. `consumeOne` does not check affected rows,
`completeQuest` does not atomically claim a ready quest before paying, and `saveQuests` can write
an old state over a newer one. A transaction alone does not make these operations serial.
PostgreSQL documents that ordinary reads at Read Committed use snapshots while later updates
can wait for another writer; constants already computed by the application remain stale.
[PostgreSQL isolation documentation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED).

Concrete schedules to test:

| Action                                        | Interleaving and impact                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a box twice                              | Two requests read the same count-1 box before either deletes it. Both roll and grant contents at `actions.ts:218`. The second delete at `progress.ts:66` can affect zero rows without failure, so both payouts can commit for one box.                                                                                            |
| Complete a quest twice                        | Two NPC-talk requests observe a ready quest. Both enter `completeQuest`, grant items, and finally set the same quest to completed without a state predicate at `progress.ts:185`. Item payouts can duplicate, and currencies/EXP can instead suffer lost updates. Concurrent stale quest saves can also restore an earlier state. |
| Fight twice, or fight while healing/exploring | Both fights can simulate from the same HP/MP/EXP. The final update at `combat.ts:188` overwrites those values and Stone from an old snapshot. Item grants may both survive while damage or progression updates are lost. A heal or quest payout can overwrite another action's HP/progression similarly.                          |
| Explore versus another action                 | Explore takes a character lock at `explore.ts:108`, protecting explore-versus-explore. Other handlers can still make ordinary reads of the earlier committed character or inventory while explore holds that lock, then apply stale writes after it commits.                                                                      |
| Equip/travel versus another action            | Both use the unlocked character helper. The equipped-slot unique index prevents two committed items in one slot, but does not protect item consumption or a fight's equipment snapshot. Scene/NPC eligibility can be checked before a concurrent travel changes the scene.                                                        |

**Suggested fix:** lock the actor's character row with `FOR UPDATE` at the beginning of every
mutating game transaction, before eligibility checks or dependent reads. Use one lock order
across fight, explore, talk/quest, item, equip and travel. Make item consumption conditional and
require an affected row; make quest completion an atomic ready-to-completed claim before rewards,
with an idempotent payout receipt if appropriate. Keep reward changes in the same transaction.
Add barrier-controlled concurrent tests for count-1 boxes, ready quest submissions, fight/fight,
fight/heal, explore/item and travel/talk, including inventory and total reward assertions.

Quest acceptance is better protected: its `(character_id, task_id)` primary key and
`ON CONFLICT DO NOTHING` at `progress.ts:132` prevent duplicate accepted rows. That constraint
does not make later quest rewards idempotent. Character creation likewise has unique account
and case-insensitive name constraints.

### 2. Medium — live sockets keep authorization after expiry or login rotation

**Locations:** `server/src/modules/realtime/realtime.ts:89`,
`server/src/modules/realtime/realtime.ts:101`, `server/src/modules/realtime/realtime.ts:171`,
`server/src/modules/auth/routes.ts:129`, `server/src/modules/auth/sessions.ts:54`.

The handshake checks the real session and its expiry, but stores only the session ID and a
character snapshot. Chat sends and broadcasts never revalidate the session. Expiring or deleting
that database session therefore does not close an already connected socket. Login rotation
deletes the old session without calling `realtime.endSession`; logout does call it at
`routes.ts:142`. An expired/revoked socket can continue receiving chat/presence and sending chat,
even though an HTTP request with the same token is rejected. This does not bypass HTTP game
route authentication. Socket.IO namespace middleware runs at connection time, rather than on
all later events. [Socket.IO middleware documentation](https://socket.io/docs/v4/middlewares/).

**Suggested fix:** include expiry in the authenticated socket context and disconnect at expiry;
revalidate revocation periodically or before allowed application events. Publish revocations for
every deletion/rotation path, including login, and disconnect the matching session room. Test
expiry and revocation after connection, not only an expired initial handshake; test login rotation
with an existing socket. If multiple processes are introduced, propagate revocation across them.

### 3. Medium — connections and presence broadcasts have no admission budget

**Locations:** `server/src/modules/realtime/realtime.ts:74`,
`server/src/modules/realtime/realtime.ts:99`, `server/src/modules/realtime/realtime.ts:109`,
`server/src/modules/realtime/realtime.ts:163`, `server/src/modules/realtime/realtime.ts:168`,
`server/src/app.ts:43`.

The 16 KB packet limit and five-chat-messages-per-five-seconds limit do not cap connections.
There is no per-IP handshake budget, per-session/character socket cap, or admission limiter in
this module. One authenticated character can open many sockets, cause repeated session/character
queries, and trigger a scene player-list broadcast on every connection and final departure.
Fanout to that character's growing socket set amplifies the work. Engine.IO transport requests
are handled by the attached Socket.IO server; Fastify's per-game-route limits do not supply a
socket handshake policy. This is an availability risk, not evidence of an unauthenticated client
receiving protected broadcasts.

**Suggested fix:** enforce handshake/upgrade admission budgets at the proxy and/or Engine.IO
boundary, and cap authenticated sockets per character/session. Reject foreign origins before
expensive work, preserve a deliberate policy for nonbrowser clients, and debounce presence
updates. Socket.IO provides an admission callback for handshake/upgrade decisions.
[Socket.IO server options](https://socket.io/docs/v4/server-options/#allowrequest).
Add bounded admission and connection-churn tests. No saturation test was run against a live service.

### 4. Low — registration confirms private email addresses

**Locations:** `server/src/modules/auth/routes.ts:80`, `server/src/modules/auth/routes.ts:95`.

Registration explicitly reports whether an email exists, both in the precheck and in the unique
constraint handler. A caller with a CSRF token can distinguish registered email addresses from
unregistered ones. The ten-registrations-per-hour per-IP limit reduces throughput but does not
remove the disclosure. Public username availability is a separate product decision.

**Suggested fix:** return an indistinguishable email-registration response, with recovery or
verification messaging delivered to the address when that flow exists. If retaining the current
UX, document the privacy tradeoff and supplement per-IP abuse controls. Keep login's current
uniform invalid-credentials response.

### 5. Low — the account login budget is split by alias and checks in-flight attempts too late

**Locations:** `server/src/modules/auth/routes.ts:108`, `server/src/modules/auth/routes.ts:117`,
`server/src/modules/auth/routes.ts:123`, `server/src/modules/auth/login-limiter.ts:23`.

The limiter keys on the submitted lowercase login, but a user can authenticate with either
username or email. Those identifiers get different failure buckets for the same account.
Furthermore, the lock check happens before awaited lookup/password verification, and a failure
is counted afterward. Distributed concurrent attempts can all pass the initial budget check.
This weakens the claimed per-account ceiling; it does not remove the separate ten-per-fifteen-
minutes per-IP route limit or allow an incorrect password to authenticate.

**Suggested fix:** key existing accounts by canonical user ID and use an atomic attempt reservation
before password verification, with a bounded normalized-identifier bucket for unknown users.
Keep response/timing behavior uniform. Test username/email aliases together and simultaneous
failures from separate IPs. Use shared counters if running multiple server processes.

### 6. Low — recent chat buckets survive their final disconnect indefinitely

**Locations:** `server/src/modules/realtime/realtime.ts:119`,
`server/src/modules/realtime/realtime.ts:146`, `server/src/modules/realtime/realtime.ts:154`.

If a character sends a message and disconnects within five seconds, `leave` retains its bucket.
There is no later sweep/timer; unless that character returns, the expired timestamps remain for
the process lifetime. Churn across distinct characters grows the map. The online presence map
is removed correctly, and reconnecting within the active window does not reset the chat budget.

**Suggested fix:** expire offline buckets after their last timestamp plus the rate window, or
sweep them with a bounded TTL store. Guard against deleting a refreshed/active bucket. Do not
simply delete on disconnect, which would enable reconnect-based rate-limit bypass. Test cleanup
for a message followed by immediate disconnect and preservation of the active reconnect budget.

## Route-by-route authorization, validation and limits

Paths below include their `/api` prefixes. All state-changing HTTP routes run the shared CSRF
hook (`auth/csrf.ts:32`); session resolution checks expiry on every Fastify request
(`auth/routes.ts:50`). Game routes resolve the actor from the authenticated user, not from a
client-supplied character ID. Limits are per route and IP; `app.ts:44` disables a global fallback.

| Route                                  | Authorization / validation                                                                      | Configured rate limit                              | Location                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| GET `/api/auth/csrf`                   | Intentionally public token bootstrap; reuses or creates own CSRF cookie                         | None                                               | `server/src/modules/auth/csrf.ts:23`       |
| POST `/api/auth/register`              | Intentionally public; shared register schema, unique username/email; role defaults server-side  | 10/hour/IP                                         | `server/src/modules/auth/routes.ts:68`     |
| POST `/api/auth/login`                 | Intentionally public; login schema and password verification; fresh session token               | 10/15 minutes/IP, plus failure buckets (finding 5) | `server/src/modules/auth/routes.ts:106`    |
| POST `/api/auth/logout`                | Idempotent for guests; deletes only the presented authenticated session; CSRF required          | None                                               | `server/src/modules/auth/routes.ts:139`    |
| GET `/api/auth/me`                     | Requires valid session; returns only that user's public projection                              | None                                               | `server/src/modules/auth/routes.ts:148`    |
| GET `/api/game/creation`               | Session required; server-owned creation options                                                 | 120/minute/IP                                      | `server/src/modules/game/characters.ts:74` |
| POST `/api/game/characters`            | Session required; shared schema, starting outfit/gender consistency; one character/account      | 10/minute/IP                                       | `server/src/modules/game/characters.ts:95` |
| GET `/api/game/character`              | Session required; character filtered by authenticated `userId`                                  | 120/minute/IP                                      | `server/src/modules/game/characters.ts:88` |
| GET `/api/game/scene`                  | Own character required; server selects its scene and listed entities                            | 120/minute/IP                                      | `server/src/modules/game/world.ts:39`      |
| POST `/api/game/fight`                 | Own character; monster ID schema, current listed monster, HP gate; server simulation/rewards    | 60/minute/IP                                       | `server/src/modules/game/world.ts:57`      |
| GET `/api/game/quests`                 | Own character; quest rows filtered by actor                                                     | 120/minute/IP                                      | `server/src/modules/game/actions.ts:82`    |
| POST `/api/game/quests/:taskId/accept` | Positive integer ID; own character, existing task, prerequisites, country, level, giver scene   | 30/minute/IP                                       | `server/src/modules/game/actions.ts:118`   |
| POST `/api/game/npcs/:npcId/talk`      | NPC ID schema; own character; NPC must be spawned in actor's scene                              | 60/minute/IP                                       | `server/src/modules/game/actions.ts:152`   |
| GET `/api/game/inventory`              | Own character; inventory filtered by character ID                                               | 120/minute/IP                                      | `server/src/modules/game/actions.ts:100`   |
| POST `/api/game/items/:id/use`         | UUID; item must belong to actor; server item definition, use flag and level checked             | 60/minute/IP                                       | `server/src/modules/game/actions.ts:193`   |
| POST `/api/game/items/:id/equip`       | UUID; actor ownership, equipment type, level and weapon class checked                           | 60/minute/IP                                       | `server/src/modules/game/actions.ts:241`   |
| POST `/api/game/travel`                | Positive integer scene; route, start flag, nation and level checked; socket move after commit   | 30/minute/IP                                       | `server/src/modules/game/actions.ts:284`   |
| GET `/api/game/explore`                | Own character; only its scene's spots and its own star rows                                     | 120/minute/IP                                      | `server/src/modules/game/explore.ts:74`    |
| POST `/api/game/explore/:spotId`       | 1–6-digit ID; own locked character, scene, level, daily quota, cooldown, Stone and keys checked | 20/minute/IP                                       | `server/src/modules/game/explore.ts:100`   |

Implicit HEAD requests use the GET route's authentication hooks. No route in this review accepts
a supplied owner ID as authority. No cross-account item/character access or reward/stat fields
controlled by the client were found. The unbounded CSRF/logout/me routes are noted explicitly;
add suitable edge/default request budgets before a public deployment. Per-character action
budgets would also strengthen the existing per-IP game limits.

## Realtime, cookies, input safety and information exposure

- Handshake: cookie name comes from the same production-aware configuration as HTTP. The
  database session must be valid and the authenticated user must have a character. Client-provided
  identity or room IDs are not used (`realtime.ts:96`). A supplied foreign Origin is rejected;
  missing Origin is allowed for nonbrowser clients. This is not, by itself, a demonstrated browser
  CSRF bypass. It does not replace connection throttling or ongoing session validation.
- Presence and scene chat: rooms come from server-owned character state; travel moves sockets
  after commit (`actions.ts:311`). Scene messages use the stored presence scene; world messages
  are intentionally broadcast to every authenticated socket. No client room-join event exists.
- Chat: channel/text are checked with Zod, control and bidirectional override characters are
  stripped, text is limited to 200 characters, packet size to 16 KB, and the character-wide
  five-message/five-second counter spans tabs. Invalid attempts also consume that budget. Sender
  identity is server-selected. HTML is retained as plain text, which the current React renderer
  escapes (`client/src/game/Chat.tsx:170`); do not render it with HTML insertion later.
- Cookies: production uses `__Host-pn_session` and `__Host-pn_csrf`, Secure, HttpOnly,
  SameSite=Lax, Path=/ and no Domain (`auth/cookies.ts:7`). Nonproduction cookies intentionally
  omit Secure. Tokens are 32 random bytes and only SHA-256 token hashes are stored
  (`auth/sessions.ts:36`). HTTP checks expiry, with 24-hour browser sessions and 30-day remembered
  sessions. CSRF uses a random token echoed through a header and constant-time comparison.
- Passwords: Argon2 hashing and a dummy hash for unknown-user verification are present
  (`auth/password.ts:5`, `auth/routes.ts:121`). Login failures have a common message. Password
  hashes and raw session tokens are excluded from public user projections.
- Information leaks: scene players expose only character ID/name/level/clothing/gender/nation
  (`realtime.ts:46`), and chat exposes sender character ID/name. Own-account `/me` email is
  intentional. Framework/internal failures return generic responses (`server/src/http.ts:48`),
  while full errors stay in server logs. Registration email availability is finding 4. No internal
  stack, SQL error, other user's email, password hash or session token was found in game/socket
  responses. Personal game GET responses lack the auth routes' explicit `no-store` header
  (`server/src/app.ts:40`); apply a private/no-store policy when configuring caches.
- Deployment scope: presence, chat quotas and account login buckets are process-local, as the
  source comments acknowledge. The reviewed M2 design is single-process. Multiple instances
  need shared admission/rate state, a Socket.IO adapter, and propagated session revocation;
  deployment proxy trust must match the actual exposed network path.

## Verification limits and next checks

Existing tests exercise ownership, malformed input, wrong-scene/nation actions, production cookie
flags, HTTP/initial-handshake expiry, foreign origins, chat limits across tabs, logout disconnects,
and simultaneous explore rejection (`server/src/modules/game/explore.api.test.ts:124`). These
passing checks do not resolve finding 1 or prove live-session expiry/rotation behavior safe.
Add targeted concurrency and live-socket lifecycle regressions with the fixes. No security fix,
load probe, new server test, push, merge or deployment was performed in this review.
