# M5 Reborn Update: Reference

Reference for milestone 5 ("Reborn Update"). Built from captured Pockie Ninja Reborn data on
2026-10-13 (`data/reborn-raw/`, gitignored). We had no network access and saw no server code. The
detailed data is in `data/reborn-raw/re/normalized/{talents,bloodlines,skills,quests,events}.json`.
The mechanics below are written in our own words. Names come from Reborn and act as glossary
defaults, per the roadmap.

Sources:
- `re/serverConfig.json`, the config the server sends at login.
- `re/live/loadData.json`, the full state of the test character "Nagatoro", level 21.
- `re/rpc/*`, read-only socket replies.
- `re/main.js`, the minified client. Client-side formulas were read from it.
- `locales_en_translation.json`.
- `json_items.json`.

Server limits worth knowing:
- `leveling.max` is **70**. Our port's cap is 90.
- Several Reborn systems are gated above 70: talents scale with level minus 50, and bloodlines go up to level 84.

## 1. Talents (8)

Every talent is a "Heart of X". It only works when the enemy beats you on one stat, and it narrows
that gap by `level %`. The talents come in four pairs:

| # | Name | Active when | Effect |
|---|---|---|---|
| 1 | Heart of Pierce | enemy pierce > your block | extra block chance = enemy pierce / your block x L% |
| 2 | Heart of Block | enemy block > your pierce | enemy block reduced by (enemy block - your pierce) x L% |
| 3 | Heart of Armor Break | enemy def break > your defense | enemy def break reduced by (diff) x L% |
| 4 | Heart of Defense | enemy defense > your def break | enemy defense reduced by (diff) x L% |
| 5 | Heart of Critical Strike | enemy crit > your constitution | enemy crit reduced by (diff) x L% |
| 6 | Heart of Constitution | enemy constitution > your crit | extra crit chance = enemy con / your crit x L% |
| 7 | Heart of Hit | enemy hit > your dodge | extra dodge chance = your dodge / enemy hit x L% |
| 8 | Heart of Dodge | enemy dodge > your hit | enemy dodge reduced by (diff) x L% |

The character stats carry the fields `talentPierce`, `talentParry`, `talentDefenseBreak`,
`talentDefense`, `talentCritical`, `talentCon`, `talentHit` and `talentDodge`.

**Level cap and EXP**
- A talent's level is capped at `max(0, characterLevel - 50)`. Talents start working at level 51, so with the server cap of 70 the highest talent level is 20.
- `expNeeded` is defined for levels 1 to 60. It runs 100, 240, 410, 540 and so on up to 9100 (`expNeeded[L]` is the bar size for reaching level L).
- How much EXP an upgrade gives is decided on the server. A "critical" upgrade gives 3x EXP.

**Upgrade cost**
- `costNeeded[n] = [gold, stones]`, where n is the n-th upgrade of the day (`n = 40 - attemptsLeft + 1`). The cost goes up with each attempt in a day, not with talent level.
- Normal Upgrade costs stones and Gold Upgrade costs gold:

| Attempt n | Gold | Stones |
|---|---|---|
| 1 | 2 | 10k |
| 2 | 3 | 20k |
| 3 | 4 | 40k |
| ... | doubling | doubling |
| 10 | 11 | 5.12M |
| 17 and later | 18 | 5.12M |

- Using all 40 attempts costs 584 gold or 163.83M stones in total.

**Attempts and activation**
- There are 40 attempts a day, shared by all talents. They reset at 00:00 server time (Europe/Lisbon).
- Up to **3** talents can be active at once, and a talent needs level 1 or more to be activated.
- Socket requests: `upgradeTalent {id, useGold}` and `activateTalent {id, active}`.

## 2. Bloodlines (44 limits plus souls)

**Unlocking a limit**
- The Ninja House lists one NPC per limit (npc id `81000 + limitId`, portrait from outfit `290000 + avatar`).
- A Turn In hands over 4 of the limit's item for +30 amity. The limit unlocks when amity reaches its target.
- Amity targets are 30, 210, 720, 2100 or 4500, which takes 1 to 150 turn-ins.
- `itemsPerDay` is 10, a daily hand-in cap. Exactly what it counts is enforced on the server.

**Limit items**
- The 18 limit items (148023-148040, for example Kebab Flavored Chips, ANBU Mask and Forbidden Scroll) drop from the Slot Machine.
- Each item has a level band: Lv16+, 26+, 31+, 41+, 61+ or 71+.

**Required levels**
- Required levels run from 16 to 84.
- 12 limits need a level above 70, which is unreachable on Reborn today: 22, 23 and 35-44.

**What a limit gives**
- Flat Str/Agi/Sta, for example 23/11/23 for limit 1 and 120/90/70 for limit 41.
- Three bonus stats `[statId, value]`:
  - The first is always an element "skill cast chance %" of 2 to 6.
  - The other two are combat stats, for example Constitution 43, Defense 177 or Max Health % 12.5.
  - Stats 9, 11, 12 and 14 are shown divided by 10.

**Active limits and presets**
- Up to **3** limits can be active (`bloodlines.active`, 3 slots).
- There are 5 presets. 2 are free and the rest cost 100 gold each, or come with VIP.

**Souls**
- There are 13 soul types. Each type maps to one stat:

| Soul | Stat |
|---|---|
| Firm | Defense |
| Ruin | Defense Break |
| Deft | Dodge |
| Aim | Hit |
| Savage | Critical |
| Flexible | Constitution |
| Life | Max HP |
| Energy | Max Chakra |
| Fatal | Pierce |
| Guard | Block |
| Sharp | Min Attack |
| Edge | Max Attack |
| Speedy | Speed |

- Soul levels run from 1 to 10. The character level needed for each soul level is 25, 25, 25, 36, 36, 51, 71, 71, 91, 91.
- Soul values grow with level. For example Firm goes from 13 at level 1 to 208 at level 10.
- Discover gives 10 souls a day, or 30 with VIP. The soul inventory holds 250.
- Each limit has 5 soul sockets and takes only one soul of each type.
- Synthesis turns 3 souls of the same level into 1 soul one level higher.
- Refine uses up same-level souls to reroll a target soul into a different type.

**Prayer**
- Prayer feeds souls to a limit to raise Str, Agi or Sta.
- Prayer levels go from 0 to 9. Reaching the next level takes `5000 x 2^level` points, and each soul gives `100 x 3^(soulLevel-1)` points.
- Switching the attribute resets prayer progress.
- The server computes `prayer.bonusStats`.

**Client formula** (the panel for one limit):
- `str/agi/sta = Limits[L].stats + prayer.bonusStats`
- `stat[soulKey[s.id]] += Souls[s.id].levels[s.level]` for each socketed soul.

How the server adds the active limits into the character's stats is not visible.

## 3. Skills

**Scroll skills (12, all new in Reborn)**
- 1831 Izanagi, 1833 Art of Rinne Rebirth, 1834 Izanami, 1835 Kirin and 1836 Sprenger.
- 18041 Water Colliding Wave, 18042 Sand Burial, 18043 Reverse Lotus, 18044 Black Coffin, 18045 Single Blade Cremation and 18046 Royal Hollow Flash.
- 18091 Amaterasu.
- They are learned by using a scroll item:
  - 540001-540012 give a temporary 7-day skill (the `skillsKnown` entry gets `expiresAt`).
  - 540101-540112 give the skill permanently.
- At most **2** scroll skills can be equipped (the client checks this in `setSkill`).
- The tooltips give damage and level scaling, cast chance ranges and chakra cost. They are in `skills.json`.
- The client shows no price or shop for skill scrolls.

**Correction to the brief:** "250 Gift Certificates per scroll" is the price of **Clan Garden scrolls**. These are bought with `clanGardenPurchaseScrolls` and capped at 18. They are not skill scrolls.

**Secret technique (skill 10000)**
- Every one of the 204 outfits has three innate skills: 10000, 7777 Block, and one innate element passive. That passive is 20x0, 20x1 or 20x2, worth 500/1000/1500 base and +50/100/150 per level.
- 10000 fires on attack when the target is below `secretTechniqueHealthThreshold`, which is 0.15. It has a 10% cast chance.
- Outfit stars (`avatarStars`, up to 5):
  - Each outfit starts with 6 skill slots, and the 2-star and 5-star ranks add 1 slot each.
  - A 5-star outfit raises the threshold to 20%.
- **Variants:** an outfit's animation data has `secretTechnique` plus an optional `secretTechniqueVariants[{variantId}]`.
  - With 2 or more variants, the client picks one deterministically: an FNV-1a hash of `name:role:event:time:targetRole:targetLastDamage`, modulo the number of variants.
  - As far as the client shows, variants are visual only.
- The "S/A/B/C-Rank Secret Technique Scroll" items (159000-159003) are unrelated. They are loot boxes opened with item 100004.

**Diff against our port**
- Our port has 40 ninjutsu: the 20 skills 1802-1839 and the 20 skills 3802-3827.
- New in Reborn:
  - 1809 Balsam. How it is learned is not visible.
  - The 12 scroll skills.
  - 2800 Fire Release, which belongs to the element cast-chance passives 2800-2809. The original used 2801-2810.
- Not in the Reborn locale: 2810 and 3809.

## 4. Quests

- There are 209 quest ids (`quest__*`):
  - 70 are 10xxx: the 2011 main line. 69 are original, and 10093 has a 2011 id but different text.
  - 21 are 20xxx: a new tutorial chain.
  - 118 are 30xxx: a new story chain.
- In total, 139 are new in Reborn. 35 of the 20xxx/30xxx ids reuse 2011 ids for unrelated content.
- Quest step types: COLLECT 1, KILL 2, TALK 3, GIVE_ITEM 6, EQUIP_PET 7, FEED_PET 8, ENHANCE_GEAR 9, REFINE_GEAR 10, SOCKET_GEM 11, SYNTHESIS 12, ARENA_FIGHT 13, LAS_NOCHES_FLOOR 14, BLOODLINE_UNLOCK 15, VALHALLA_COMPLETE 16, OPEN_BOX 17, DEFEND 18, ESCORT 19, INVESTIGATE 20, CHOICE 21, DISCOVER 22. Types 3 and 18-22 complete when you talk to the NPC.
- Only quest 30022 (level 21, chapter 4) has captured steps and NPC data.
- There are also 5 daily task-board tasks (900001-900041).

## 5. Events and side systems (36)

The details are in `events.json` (state shapes, socket events, item names). Most daily systems reset
at 00:00 Europe/Lisbon. The weekly ones reset on Monday.

**Seasonal events**
- Summer and Christmas events: a currency farmed from monsters (Seashells or Snowflakes, 250 a day), a prize tree at 15 per spin with 3 free spins, a boss with 10 attempts a day, a 24-day advent calendar, quests, and a Festival Token shop.

**Weekly and admin-started events**
- Tailed Beast event:
  - It runs weekly against beasts 1-9, two a day.
  - Fights come in Normal, Hard and Rampage difficulty and cost 1, 3 or 5 tickets.
  - Players earn village honor, pick Kage rewards, get fight-count boxes at 20, 10 and 5 fights, and can spend Essence in a shop.
- Akatsuki Hunt: admin-gated. Winning field fights can trigger an ambush by an Akatsuki pair, and bait doubles the chance for 1 hour. Beating them gives 8 red Akatsuki outfits.
- Hashirama vs Madara:
  - Admin-started. It lasts 48 hours, and you pick a side for good.
  - It pays Fortune Wheel spins to the winning side and to the top 3 of each side.
  - Spins can be used for 24 hours afterwards.
- Fortune Wheel: you pick 3 rewards for the wheel, which also holds a grand prize and mystery slices. Spins are free or cost gold.

**Daily minigames**
- Sannin Test: roll 6 dice a day; "ninja" faces give EXP and Growing Points; you can change your luck, make a six (100 gold) and rank up for HP and titles.
- Dice of Fate: net lucky dice give a blessing or a curse buff lasting 2 or 6 hours. There are 10 rolls a day, a replenish costs 10k stones, and clearing a curse costs 5k.
- Slot Machine: roll 3 ninjas and fight them for a prize. It is also the source of the bloodline items. A separate deluxe slot runs on a paytable.
- Pet Tracing: a 3x3 board of arrow cards with 10 attempts a day. 10 more attempts cost 10 gold or 100 GC.

**Daily and weekly rewards**
- Weekly Rewards:
  - 10 activities each give points.
  - Point milestones at 50, 100 and 200 give a Secret Technique Scroll x10, a Level 10 Stone Bag and 10 gold.
  - With 50 points or more, a reward can be claimed on each weekday.
- Daily Login: a 7-day cycle plus a daily bonus.
- Twenty-Minute Reward: gift certificates on a timer. The captured cooldown is 5 minutes and the reward 10 GC.

**PvP and arenas**
- Team Stone:
  - Ranked 3v3 from level 50, with 25 attempts a day.
  - A win or loss moves your score by 18 to 22 points.
  - There are 8 leagues paying 250 BattleCoins and up each week.
- Championship: an 8-player bracket from level 30. Wins pay 100, 250 and 500 Hero Coins, and Hero Coins buy outfit jars.
- Squad Arena / Team Arena:
  - 3 loadouts, each with a different main attribute.
  - 10 tickets a day; extra tickets cost 200 GC.
  - A weekly reward based on hourly rank points.
- Arena Boss: 21 promotion bosses tied to the rank score thresholds.

**PvE**
- Shichibukai: a dice-board expedition with 9 floors and 4 difficulties, 4 runs a day, a points shop, and level 40 as the max.
- Las Noches tower:
  - Unlocks at level 61, with 3 tries a day.
  - The Express route costs 50k stones and needs floor 50 cleared.
  - The VIP route starts at floor 59.
  - "Impel Down" is an alias for it.
- Field Boss: fights cost a Demon Proof of Suppression.
- Scroll Dungeon: the client code is lazy-loaded and was not captured.

**Clan**
- Clan Garden:
  - 9 plots and tree levels 1-5. Unlocking a plot costs 250 GC.
  - Rolling a level costs 25 GC or 25k stones.
  - Levelling a tree costs 250 GC or 5 gold.
  - Harvests come every 2-6 hours.
- Clan Missions: 15 bosses shared by the clan.
- Clan War: 5v5 up to 20v20 using fighter snapshots.
- Clan Adventure: idle, up to 24 hours.
- Clan Picnic: a weekly goal.
- Clan Training: 3 donations a day.
- Clan Protection: a boss fight.
- Clan Storage.

**Progression systems**
- Bankai:
  - 3 weapons, with a 4th still in development.
  - Max level 25; leveling up costs `3000 + 1500 x (level-1)` EXP.
  - Forms unlock at levels 1, 5 and 10.
  - Each weapon has 8 crystal slots and swappable stats.
- Achievement skill tree: 280 achievements. Each gives 1 to 6 points depending on its rank (d to ss).

**Shops**
- Valhalla shop (gem stones bought with crystals) and Kennel shop (pet food bought with Feathers).

## Unknowns (server-only)

**Talents**
- How much EXP an upgrade gives and the crit chance.
- Exactly when in combat the talent percentage applies.
- What cost entries 41-80 are for.

**Bloodlines**
- How the active limits are added into the character's stats.
- The prayer `bonusStats` for each level.
- Discover odds.
- How `itemsPerDay` is counted.
- What `bloodlines.bg` controls.
- The bonus stat ids reuse the `stat__` labels, but some labels look wrong. For example soul 10 is labelled "Defense Improvement %" (stat 18) while the client panel calls it block. Verify before using them.

**Skills**
- The battle scripts for the 12 scroll skills and for 1809. Only tooltips are available.
- Where scroll skills come from and what they cost.
- How scroll skills level up.
- Secret technique damage for each outfit.

**Quests**
- Steps, rewards, levels and NPCs for 208 of the 209 quests.
- Whether Reborn still serves the 10xxx chain.

**Events**
- Almost all odds, reward tables and boss stats.
- Weekly reset instants.
- Schedules for the seasonal and admin-started events.
- The Scroll Dungeon UI.

## Recommended M5 scope order

1. **Talents.** Small and self-contained: config tables, two socket actions and one combat hook. It only matters past level 50, so the combat hook can be written test-first in `game-core`.
2. **Bloodlines: limits only.** Ninja House turn-ins, activating up to 3 limits, and flat plus bonus stats. Needs a drop source for the 18 items. We have no Slot Machine yet, so use field drops for now.
3. **Scroll skills.** 12 skill scripts in `game-core` written from the tooltips, scroll items for 7 days or permanent, and the max-2 equip rule. Reuses the ninjutsu pipeline from M4.5.
4. **Secret technique (10000) and outfit stars.** The HP-threshold trigger, then the star bonuses. Variants are visual only, so they can wait for the art.
5. **Bloodline souls.** Discover, synthesis, refine, sockets and prayer. Prayer needs a formula of our own because the server's is unknown.
6. **New quest chains.** The 20xxx tutorial and the 30xxx story. The text and steps must be our own because only names were captured; reuse the step-type enum.
7. **Events.** Start with the cheap daily ones: daily login, weekly rewards, Dice of Fate, Pet Tracing and the Slot Machine (which also supplies the bloodline items). Then Tailed Beast and Team Stone. Seasonal and admin-started events (summer and Christmas, Hashirama vs Madara, Akatsuki) come last. Clan systems and Bankai probably belong in M6 or later.

## Follow-up after M5 (agreed 2026-10-13)

Once M5 implementation is done, extend `tools/fetch-reborn-assets.ts` to also fetch the asset
groups skipped in the first run: audio (BGM and SFX), pets, wings, auras, general combat effects,
and card art. Patterns to start from: `assets/audio/playlist.json`, `entities/pets`, the `WING`
config, `combat/pets` in `json/loader.json`, and the `Akatsuki/1.jpg`-style card paths in the bundle.
