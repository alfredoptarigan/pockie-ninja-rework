# Pockie Ninja Remastered

Fully English reborn of the 2011 browser game Pockie Ninja (Ninja Kita).
Roadmap and decisions: `.claude/plans/roadmap.md`. Current milestone: `.claude/plans/m4-social-competition.plan.md`.

## Layout

pnpm workspaces (no Turborepo):

- `shared/` — Zod schemas and types used by both sides (`@pockie/shared`, consumed as TS source).
- `server/` — Fastify + Drizzle (PostgreSQL). `src/app.ts` builds the app (tests use it with
  `app.inject`), `src/index.ts` starts it. Feature code lives in `src/modules/<feature>/`.
- `client/` — Vite + React + Tailwind v4 + Motion. Routes in `src/routes/`, UI in `src/components/`.
- `tools/` — reproducible asset export from the original game backup.
- `e2e/` — Playwright journeys.

## Commands

```bash
pnpm dev          # client (5173) + server (3000)
pnpm typecheck && pnpm lint && pnpm test
pnpm db:reset && pnpm db:seed
pnpm e2e
```

## Conventions

- Every user-facing string is English. No emojis in UI or copy.
- Small conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`); commit and push after
  every change. Run typecheck, lint and tests before each commit.
- Auth and anything security-sensitive is written test-first.
- Config comes from env only (`server/src/env.ts` validates it); see `.env.example`.
- Memphis design (cream base, coral/mustard/teal/blue/pink, thick charcoal outlines) is for the
  landing site only.
- Only exported, optimized assets live here (PNG/WebP). Raw SWFs stay in
  `~/Privates/game-pockieninja`; regenerate with `tools/export-assets.sh`.
