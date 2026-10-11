# Plan: Landing Page + Registration/Login (Milestone 1)

**Project**: Pockie Ninja Remastered (`~/Privates/pockie-ninja-reborn`, remote `github.com/alfredoptarigan/pockie-ninja-rework`, private)
**Selected Milestone**: 1 — public landing site with accounts
**Complexity**: Medium
**Status**: approved by the user on 2026-10-11 (after a grilling session)

## Summary

A fully **English** browser-game website: a Memphis-style landing page (hero, news/updates/events,
lore, FAQ, server status) with account registration, login, an account panel and a protected
`/play` placeholder. Game client (Phaser) and game server come in later milestones.

## Ground rules

- **English only** for every user-facing string (site, content, errors, emails later).
- **Commit and push after every change** (small conventional commits: `feat:`, `fix:`, `chore:`…).
- Memphis style is for the **landing site only**; in-game UI style is decided in a later milestone.
- Reference material (read, don't copy blindly):
  - Original game backup: `~/Privates/game-pockieninja` — assets in `apache/` (art in
    `apache/html/`, sprites in `apache/source/movieclip/`), data in
    `app/code/props/serv/game/Resource/`, decoded client tables in `apache/source/binary/`.
  - `~/Privates/game-pockieninja/local-run/README.md` runs the original game locally.
  - `~/Privates/game-pockieninja/docs/reborn-comparison.md` compares the original with Pockie Ninja Reborn.
- Original 2011 game assets may be used.
- Only exported/optimized assets go in this repo (PNG/WebP + JSON); raw SWFs stay in the backup
  repo. Keep the export script in `tools/` so exports are reproducible.

## Patterns to mirror

New repository: no existing code. Conventions are set in Task 1 and recorded in `CLAUDE.md`.

## Decisions (from the grilling session)

| Topic | Decision |
|---|---|
| Name | Pockie Ninja Remastered |
| Monorepo | pnpm workspaces: `client/`, `server/`, `shared/` (no Turborepo) |
| Client | Vite + React + TypeScript (strict), React Router, TanStack Query, React Hook Form |
| Styling | Tailwind CSS v4 (Vite plugin) + Motion (`motion` package) |
| Server | Fastify + TypeScript, Zod validation (schemas shared from `shared/`) |
| Database | PostgreSQL 18 (Homebrew, already installed) + Drizzle ORM + migrations |
| Passwords | argon2id |
| Sessions | random token in DB, cookie `httpOnly`, `SameSite=Lax`, `Secure` in production |
| "Remember me" | checked: 30-day cookie; unchecked: browser-session cookie |
| Register fields | username (3–16, `[A-Za-z0-9_]`, unique case-insensitive, display as typed), email (valid, unique), password (min 8, no composition rules) |
| Email verification | not yet (email stored for later reset/verification) |
| Roles | `role` column: `player` (default) / `admin`; first admin created by a CLI script |
| Content | news/updates/events, lore chapters, FAQ in Postgres, seeded; admin panel later |
| Content copy | Claude drafts English text from the original game (quests, systems); user reviews |
| Server status | API health + "players active now" = sessions active in the last 5 minutes |
| Environment | local only for now; all config via env, production-ready defaults |
| Toolchain | Node v24, pnpm 12 (already installed) |

### Visual direction (landing site)

- Memphis design: cream base, 4–5 bright colors (coral, mustard, teal, blue, pink), thick
  charcoal outlines, geometric shapes, squiggles, dot grids, offset "sticker" shadows.
- Light theme only (dark mode later, if ever).
- Fonts: chunky display font for headings (e.g. Bricolage Grotesque or Archivo Black) + clean
  body font (e.g. Outfit). No Inter. No emojis in UI or copy.
- Hero: asymmetric — copy and CTAs left, composition of original chibi character sprites
  floating among Memphis shapes right. Original Naruto/Kyuubi login art for the login/register pages.
- Motion: staggered reveals, gentle float on shapes/characters, "breathing" status dot,
  tactile button press. Respect `prefers-reduced-motion`.
- Mobile: single column below `md`, no horizontal scroll, `min-h-[100dvh]` instead of `h-screen`.
- Every data view has loading (skeleton), empty and error states.

## Files to create (high level)

| Path | Why |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, ESLint/Prettier config | Monorepo tooling |
| `shared/src/schemas/*.ts` | Zod schemas + types for auth, posts, lore, FAQ, status |
| `server/src/app.ts`, `server/src/index.ts` | Fastify app factory (testable) + entry |
| `server/src/env.ts` | Env validation at startup |
| `server/src/db/schema.ts`, `server/drizzle/*` | Tables + migrations |
| `server/src/modules/auth/*` | Register/login/logout/me, sessions, rate limit, CSRF |
| `server/src/modules/content/*` | Posts, lore, FAQ endpoints |
| `server/src/modules/status/*` | Status endpoint |
| `server/scripts/seed.ts`, `server/scripts/create-admin.ts` | Seed content, first admin |
| `client/src/routes/*` | `/`, `/register`, `/login`, `/play` |
| `client/src/components/*` | Hero, MemphisShapes, NewsTabs, LoreList, FaqAccordion, ServerStatus, AccountPanel, forms |
| `client/public/assets/*` | Exported original sprites/art used by the site |
| `tools/export-assets.*` | Reproducible export from the backup repo |
| `e2e/*.spec.ts` | Playwright journeys |
| `README.md`, `CLAUDE.md`, `.env.example` | Setup and conventions |

## Tasks

### Task 1: Monorepo skeleton
- **Action**: pnpm workspaces, strict TS, ESLint + Prettier, Vitest in each package, Playwright at
  root, scripts `dev` (client + server), `build`, `test`, `lint`, `typecheck`. `CLAUDE.md` with
  conventions (English-only copy, commit+push per change, no Reborn assets).
- **Validate**: `pnpm install && pnpm typecheck && pnpm lint && pnpm test` pass on the empty skeleton.

### Task 2: Database
- **Action**: Postgres DB `pockie_remastered` (+ `_test`), Drizzle schema: `users` (id, username,
  username_lower unique, email unique, password_hash, role, created_at, last_login_at),
  `sessions` (id, token_hash, user_id, expires_at, last_seen_at, created_at), `posts` (id, kind
  news|update|event, slug, title, summary, body, published_at), `lore_chapters` (id, order, title,
  body), `faq_items` (id, order, question, answer). Scripts `db:migrate`, `db:seed`, `db:reset`.
- **Validate**: migrate + seed on a fresh DB; schema tests against `_test` DB.

### Task 3: Auth API (TDD, security-sensitive)
- **Action**: tests first, then `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/logout`, `GET /api/auth/me`. argon2id, session token hashed in DB, cookie flags,
  remember-me, generic login errors, rate limit on register/login, CSRF protection for
  state-changing requests, `last_seen_at` touch on authenticated requests.
- **Validate**: tests cover success, duplicate username (case-insensitive) and email, weak
  password, bad credentials, expired session, logout invalidation, rate limit, missing CSRF.

### Task 4: Content + status API
- **Action**: `GET /api/posts?kind=&cursor=`, `GET /api/lore`, `GET /api/faq`, `GET /api/status`
  (`{ online, playersActiveNow }`). English seed content drafted from the original game.
- **Validate**: endpoint tests incl. pagination and empty results.

### Task 5: Asset export
- **Action**: export the chibi sprites for the hero (e.g. Naruto, Ichigo, Sasuke, Rukia, Gaara…)
  and the Naruto/Kyuubi login art for the auth pages; optimize to WebP/PNG. The old NINJAKITA logo
  is not reused: the "Pockie Ninja Remastered" wordmark is typographic.
- **Validate**: script re-runs cleanly; assets load in the client.

### Task 6: Landing site UI
- **Action**: routes, Memphis design system (Tailwind theme tokens), Hero, News tabs
  (All/News/Updates/Events), Lore, FAQ accordion, ServerStatus (poll 30 s), AccountPanel,
  register/login forms (labels above inputs, inline errors), `/play` protected placeholder.
- **Validate**: component tests for forms/states; manual check at 375 px and 1440 px.

### Task 7: Verification
- **Action**: Playwright journey register → login → account panel → `/play` → logout;
  coverage ≥ 80%; `security-reviewer` pass over auth.
- **Validate**: `pnpm test && pnpm e2e` green; review findings fixed.

## Validation

```bash
pnpm install
pnpm typecheck && pnpm lint
pnpm test
pnpm db:reset && pnpm db:seed
pnpm e2e
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Auth vulnerabilities (brute force, session theft, CSRF) | Medium | argon2id, hashed session tokens, httpOnly cookies, rate limit, CSRF, negative tests, security review |
| Copyright: Dream2 assets, Naruto/Bleach characters, "Pockie Ninja" name | Medium | Repo private, local only; revisit before any public release |
| Memphis style turning noisy | Medium | Limit palette to 5 colors, keep body text on calm cream panels |
| Postgres via Homebrew not running | Low | `db:setup` script + README steps |

## Acceptance

- [ ] All tasks complete, every change committed and pushed
- [ ] Validation commands pass
- [ ] All user-facing text in English
