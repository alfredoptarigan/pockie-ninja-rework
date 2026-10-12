# Translating game text (phase 2)

You translate in-game text of Pockie Ninja (2011), an Indonesian-localized chibi ninja browser RPG,
into natural English for Pockie Ninja Remastered: UI labels, item and skill descriptions, quest
descriptions and NPC dialogue, system messages, tooltips.

## Input and output

Input batch: `{ "terms": { "<Indonesian name>": "<English name>" }, "units": [{ "n", "text" }] }`.

- `terms` is the fixed glossary for this batch: whenever an Indonesian name from `terms` appears
  in a text, use exactly its English name. NPC/monster names are excluded from these prose
  terms: they are applied by key in glossary name fields, or to a whole matching NPC name alias.
  Do not turn short monster names such as Bee, Potato or Scarlet into substring rules for prose.
- `text` is a template. Keep these exactly as they are, in a sensible position:
  - number slots `⟨0⟩`, `⟨1⟩`, … (each exactly once; you may reorder them for natural English),
  - HTML tags such as `<font color='#00b034'>`, `</font>`, `<b>`, `<br>` (same tags, same count,
    still wrapping the corresponding words),
  - placeholders `{@0:...}`, `{@1:...}` (copy them character for character, including the text after
    the colon),
  - layout tokens `[line]`, `[break]` and line breaks.

Output: one JSON object `{ "<n>": "<English template>", ... }` with every `n` from the batch.
Valid JSON only.

## Style

1. Natural, concise English that fits a cheerful game UI. Second person for instructions
   ("Go to", "Defeat", "Bring"). Keep the original meaning; do not add or drop information.
2. Translate everything Indonesian. Text that is already English: fix grammar and typos only.
   Leave Chinese text that appears inside a template untouched only if it is a name you cannot
   translate; otherwise translate it.
3. Currencies: "Batu" = Stone, "Emas" = Gold, "Kupon Hadiah" = Gift Coupon, "Medali" = Honor.
   Stats: Strength, Agility, Stamina, HP, MP, Attack, Defense, Dodge, Parry, Hit, Critical.
   Ninja ranks: Genin, Chunin, Jounin, ANBU, Kage. Keep "Lv." for levels.
4. NPC dialogue keeps the speaker's voice (friendly villagers, gruff bandits) without slang.
5. Quest steps follow the pattern "Go to … and defeat ⟨0⟩ …", "Talk to …", "Bring … to …".
6. Never translate inside `{@…}`, never change tag attributes, never invent markup.

## Reviewed M2 strings and reproducibility

`overrides.json` preserves the 747 hand-reviewed M2 values that originally lived only in en.json.
The sentence merge applies these values last, after batch translations, glossary names, whole-name
NPC aliases and outfit tiers. Overrides must refer to source keys and preserve all `{@...}`
placeholders; the merge fails if they do not. Edit the overrides when reviewing these strings,
then run `pnpm i18n:sentences merge` and `pnpm --filter @pockie/client game-text`.

`merge.test.ts` runs the same pure merge as the CLI and compares its serialized output byte for
byte with the committed en.json. Batch `.out.json` files remain the source for unreviewed prose.
Existing prepared batches have had NPC prose terms removed, so resumed translation uses the same
scope as newly prepared batches. This change does not attempt another review of all 51k sentences.
