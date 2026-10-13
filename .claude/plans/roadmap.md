# Pockie Ninja Remastered: Roadmap

Agreed with the user on 2026-10-11 (grilling session after milestone 1). Only the current
milestone gets a detailed plan; later ones are outlines and will be re-planned when we get there.

| # | Milestone | Status | Plan |
|---|---|---|---|
| 1 | Landing site + accounts | Done | `landing-auth.plan.md` |
| 2 | First Playable | Done (2026-10-12) | `m2-first-playable.plan.md` |
| 3 | World & Economy | Done (2026-10-13) | `m3-world-economy.plan.md` |
| 4 | Social & Competition | In progress (planned 2026-10-13) | `m4-social-competition.plan.md` |
| 5 | Reborn Update | Outline | |
| 6 | Home, Collection & Launch | Outline | |

## Cross-milestone decisions

- **Fidelity:** data and formulas are ported 1:1 from the original 2011 server (`Resource/`,
  decompiled Java, Rhino skill scripts) through reproducible import scripts. Rebalancing is a
  separate, measured step later. Level cap is 90 (original `LevelExp.ini maxlevel`).
- **World model:** faithful to the original. Each scene is a static picture with clickable
  buildings and explore spots plus a monster list; travel uses the world map; other players show
  in a per-scene player list (not walking avatars).
- **Battle:** simulated entirely on the server (sequential 1v1 duels, `AtkTime` timeline, max 60
  actions), sent to the client as a typed replay and played back in Phaser.
- **Architecture:** game logic lives in the existing Fastify server (`server/src/modules/game/*`)
  with a deterministic, testable `game-core` package; realtime via Socket.IO (scene rooms,
  cookie-session auth) in the same process. Phaser renders world and battle; React renders menus,
  HUD, dialogs and forms.
- **Characters:** one character per account; the ninja name is separate from the username
  (3-12 `[A-Za-z0-9_]`, unique case-insensitive). Creation mirrors the original: name, gender,
  starting outfit (from `creatrole.tab`), village (Fire, Water, Earth, Wind, Light/Lightning).
- **Language:** the whole game is English. Source text is the original Indonesian language table
  (`keyvaluetable/language.s53464.kv`, about 51k keys), Chinese as a fallback reference.
  Translation is AI-assisted with a fixed glossary; strings shown in the current milestone are
  reviewed by hand, the rest are marked unreviewed. Original keys are preserved.
- **Names:** Pockie Ninja Reborn names are the glossary default where they exist
  (`pnpm reborn:fetch` → `data/reborn-raw/`, gitignored; only names are committed to
  `tools/i18n/glossary.json`). Canon Naruto/Bleach names win for characters. Everything else is
  our own translation. Reborn sentences (quest text, tooltips) are not copied.
- **In-game UI style:** a redrawn skin that mirrors the 2011 UI (panels, colors, buttons) without
  baked-in text. Memphis stays the website's identity.

## Milestone outlines

### 2. First Playable
Character creation, five villages with their tutorial chains, the first field zone with explore
spots and monsters, auto-battle with replay, talk/kill/collect quests, EXP and level up, copper,
inventory with the class weapon, HP items, outfit skills, per-scene player list and chat
(world + scene), full English translation pipeline and Reborn name glossary, animation export for
all 92 original outfits.

### 3. World & Economy
All field zones 21xx-28xx and the world map, shops and merchants, blacksmith (enhance, identify,
inscribe), equipment sets, Angel City and Demon City, toll gates.

### 4. Social & Competition
Party, PvP arena with ranking, trade, friends, mail.

### 5. Reborn Update
Systems that exist only in Reborn, designed by us with Reborn names and tooltips as reference:
talents (8), named bloodlines (44 `limit__N`), scroll and secret-technique (ultimate) skills,
additional outfits (new art), additional quests and events.

### 6. Home, Collection & Launch
Home and garden, pets, cards, outfit collection and recast, tailed beasts, admin panel, email
verification and password reset, deployment.
