# Handoff: finish the English sentence translation

This file is for an AI assistant (or person) taking over the remaining translation batches of
Pockie Ninja Remastered. Everything you need is in this repository.

## Context

Pockie Ninja Remastered is a fully English remake of a 2011 chibi ninja browser RPG. The original
game text is an Indonesian language table (`tools/i18n/source.id.json`, 51k strings). It is
translated in two phases:

1. **Names (done):** every proper name (scenes, NPCs, monsters, items, outfits, skills, quests,
   titles) is fixed in `tools/i18n/glossary.json`.
2. **Sentences (in progress):** all other text, deduplicated into 13,839 templates and split into
   51 batches in `tools/i18n/work/sentences/batch-NNN.json`. 30 batches are done.

## What to do

1. See which batches are left:
   ```bash
   pnpm i18n:sentences status
   ```
2. For each remaining batch `NNN`:
   - Read the rules in `tools/i18n/SENTENCES_GUIDE.md` and follow them exactly.
   - Read `tools/i18n/work/sentences/batch-NNN.json`:
     `{ "terms": { "<Indonesian name>": "<English name>" }, "units": [{ "n": 123, "text": "..." }] }`.
   - Translate every unit into natural English and write
     `tools/i18n/work/sentences/batch-NNN.out.json` as one JSON object
     `{ "123": "<English template>", ... }` that covers every `n` of the batch.
   - If a `.out.json` already exists (batch 046 is partly done), keep its valid entries and add the
     missing ones.
3. Validate (the status command does this for all batches):
   ```bash
   pnpm i18n:sentences status
   ```
   A batch is done when it no longer appears in the "To do" list.
4. When all 51 batches are done, build the final file and check for problems:
   ```bash
   pnpm i18n:sentences merge
   ```
   This writes `tools/i18n/en.json` and `tools/i18n/en.problems.json` (should list no sentence
   keys).
5. Commit and push after every few batches (conventional commits, e.g.
   `feat(i18n): add translated sentence batches 015, 016, 020`).

## Hard rules (the validator enforces 1-3)

1. Keep number slots `⟨0⟩`, `⟨1⟩`, … each exactly once (you may reorder them).
2. Keep every HTML tag (`<font color='#00b034'>`, `</font>`, `<b>`, `<br>`), every placeholder
   `{@0:...}` (copied character for character), and every `[line]`, `[break]` and line break.
   Copy broken markup from the source as it is.
3. Write valid JSON only, and cover every `n`.
4. Use the batch's `terms` for names, exactly as given.
5. Translate sentence by sentence yourself. Do not run a word-substitution script or machine
   translation over the text.
6. Change nothing outside `tools/i18n/work/sentences/batch-NNN.out.json` (except the commits).

## Style in one paragraph

Natural, concise English for a cheerful game UI; second person for instructions ("Go to",
"Defeat", "Bring"); keep the meaning, add nothing. Currencies: Batu = Stone, Emas = Gold,
Kupon Hadiah = Gift Coupon, Medali = Honor. Stats: Strength, Agility, Stamina, HP, MP, Attack,
Defense, Dodge, Parry, Hit, Critical. Ranks: Genin, Chunin, Jounin, ANBU, Kage. Keep "Lv.". Full
details: `tools/i18n/SENTENCES_GUIDE.md`.

## Example

Input unit:

```json
{
  "n": 4182,
  "text": "Pergi ke<font color='#00b034'> Tambang Batu </font>dan kalahkan ⟨0⟩ Sunflower."
}
```

with `terms: { "Tambang Batu": "Smelting Mountains" }`. Output entry:

```json
{ "4182": "Go to<font color='#00b034'> Smelting Mountains </font>and defeat ⟨0⟩ Sunflowers." }
```
