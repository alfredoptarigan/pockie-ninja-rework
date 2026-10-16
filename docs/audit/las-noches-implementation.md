# Las Noches implementation — 2026-10-16

Reference: [observed rules/assets](las-noches-reborn-re.md) and
[battle verification](las-noches-monsters-re.md).

Implemented:

- Export all 170 floor NPC names through the existing text generator, plus Demon City entry NPC names.
- Separate lobby from a full-screen tower with the acquired background, server-owned opponent stats/reward, bank, lives, daily tries, record, progress and Info.
- Lobby Start only opens the tower. Begin Challenge invokes the existing server entry operation and shows its actual price.
- Two lives for new manual runs; each loss halves the bank, final loss wipes it. No automatic EXP payout on a fight. An exhausted run waits for Claim, which consumes the daily try. Fight is rejected at zero lives or after clearing the last floor.
- Ordinary Auto Battle requests real fights, three seconds after replay completion. It stops on errors, exhausted lives, completion or unmount. It does not purchase Gold auto packages.
- Retain server accounting and pause/resume for previously purchased queues. Existing stored runs are not reset or replenished.
- Observed floors 1–19 have no equipped gameplay skills; retain internal initialization/block IDs. Aaroniero retains 1816 and 3810. Unobserved later assignments are unchanged.
- Outfit-based NPC bosses use their configured outfit art for portraits and combat. Las Noches combat uses background scene 61; tower uses Las Noches music.
- Loading waits for the tower background/portrait, including image-error recovery. Shared city/dungeon loading is also implemented.

Limits requiring more reference evidence:

- Entry still uses the existing 1,000-Stone price; the reference Begin Challenge price was not established.
- Express still uses the existing local route/price. No guessed checkpoint mapping or VIP route is introduced.
- Full-bag mail overflow and bonus encounters are not implemented here.
- Floor 21+ stats/rewards/skills remain imported legacy data; known differences in the reference are not extrapolated to the entire table.
- Final-loss acknowledgement follows the visible Claim control/rules; its exact reference server accounting was not exercised.
- Tower layout uses existing skin components rather than claiming pixel-identical reproduction of the reference SVG/CSS.
