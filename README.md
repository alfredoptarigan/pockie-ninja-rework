# Pockie Ninja Remastered

A fully English remaster of Pockie Ninja (Ninja Kita), the 2011 chibi ninja browser RPG.
Milestone 1 is the public website: a Memphis-style landing page with news, lore, FAQ and live
server status, plus accounts (register, log in, account panel) and a protected `/play` page.
The game client and game server come in later milestones.

## Stack

- `client/`: Vite, React, TypeScript, Tailwind CSS v4, Motion, TanStack Query, React Hook Form
- `server/`: Fastify, Zod, Drizzle ORM, PostgreSQL 18, argon2id
- `shared/`: Zod schemas and types used by both

## Requirements

- Node 24 and pnpm 12
- PostgreSQL 18 running locally (`brew services start postgresql@18`)
- Only for re-exporting art: the original game backup at `~/Privates/game-pockieninja`

## Setup

```bash
pnpm install
cp .env.example .env
pnpm db:setup     # creates pockie_remastered and pockie_remastered_test
pnpm db:migrate
pnpm db:seed      # news, lore and FAQ
pnpm dev          # http://localhost:5173 (API on 3000, proxied under /api)
```

Create the first admin (prints a generated password once, or set `ADMIN_PASSWORD`):

```bash
pnpm create-admin <username> <email>
```

## Checks

```bash
pnpm typecheck && pnpm lint
pnpm test                 # Vitest; server tests use pockie_remastered_test
pnpm test:coverage
pnpm exec playwright install chromium   # once
pnpm e2e                  # starts pnpm dev if it is not running
```

## Database scripts

| Script             | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `pnpm db:generate` | Generate a migration from `server/src/db/schema.ts`             |
| `pnpm db:migrate`  | Apply migrations                                                |
| `pnpm db:reset`    | Drop everything and re-apply migrations (refused in production) |
| `pnpm db:seed`     | Replace site content with `server/scripts/seed-data.ts`         |

## Assets

`pnpm assets:export` rebuilds `client/public/assets` from the original game backup with JPEXS
FFDec: standing-pose sprite strips for the hero characters and the Naruto/Kyuubi login art.
Set `GAME_BACKUP_DIR` if the backup lives elsewhere.

## API

| Method | Path                              | Notes                                                                |
| ------ | --------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/auth/csrf`                  | CSRF token; send it as `x-csrf-token` on every POST                  |
| POST   | `/api/auth/register`              | `{ username, email, password }`                                      |
| POST   | `/api/auth/login`                 | `{ login, password, rememberMe }`; `login` is username or email      |
| POST   | `/api/auth/logout`                |                                                                      |
| GET    | `/api/auth/me`                    | Current user or 401                                                  |
| GET    | `/api/posts?kind=&cursor=&limit=` | News, updates and events, newest first                               |
| GET    | `/api/lore`                       | Lore chapters in order                                               |
| GET    | `/api/faq`                        | FAQ in order                                                         |
| GET    | `/api/status`                     | `{ online, playersActiveNow }` (sessions seen in the last 5 minutes) |

Errors always look like `{ "error": { "code", "message", "fields"? } }`.

## Production notes

Set `NODE_ENV=production`, an `https` `APP_ORIGIN`, and `TRUST_PROXY` to the number of proxies
in front of the API. Cookies then use the `__Host-` prefix and `Secure`. Rate limits are kept in
memory, so run a single API instance or move them to a shared store first.
