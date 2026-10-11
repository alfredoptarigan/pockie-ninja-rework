# Translating names (phase 1)

You translate proper names from Pockie Ninja (2011), an Indonesian-localized chibi ninja browser
RPG with Naruto, Bleach and some One Piece characters, into natural English for
Pockie Ninja Remastered. The names you produce become the fixed glossary for the whole game.

## Input and output

Input: a JSON array of units `{ "n", "kind", "source", "reborn"? }`.

- `kind`: scene, npc (NPCs and monsters), outfit, skill, title, quest, item.
- `source`: the original name (usually Indonesian, sometimes already English or Japanese romaji).
- `reborn`: the name that Pockie Ninja Reborn uses for an entry with the **same id**. Reborn reuses
  some ids for different things, so it is only a suggestion.

Output: one JSON object, keys are the `n` values as strings:
`{ "12": { "en": "Smelting Mountains", "usedReborn": true }, ... }`. Every input unit must appear.
Write only valid JSON (UTF-8, no comments, no trailing commas).

## Rules

1. **Reborn first, when it is the same thing.** If `reborn` clearly names the same entity as
   `source` (same character, place, monster, item or quest, even if worded differently), use the
   Reborn name exactly as written (fix only obvious typos such as "Technqiue", "Verdent", "Rougue")
   and set `usedReborn: true`. If it names something else (for example source "Lv.1 Newbie Pack"
   vs reborn "Akatsuki Wishing Pot", or source "Wildboar King" vs reborn "1M EXP"), ignore it,
   translate the source yourself, and set `usedReborn: false`.
2. **Characters use canon English names, given name first:** Naruto Uzumaki, Sasuke Uchiha,
   Ichigo Kurosaki, Rukia Kuchiki, Toshiro Hitsugaya, Kakashi Hatake, Hinata Hyuga, Gaara,
   Tsunade, Jiraiya, Orochimaru, Itachi Uchiha, Kisame Hoshigaki, Shikamaru Nara, Choji Akimichi,
   Kiba Inuzuka, Shino Aburame, Neji Hyuga, Rock Lee, Ino Yamanaka, Sakura Haruno, Kurenai Yuhi,
   Anko Mitarashi, Byakuya Kuchiki, Yoruichi Shihoin, Soi Fon, Rangiku Matsumoto, Orihime Inoue,
   Shinji Hirako, Renji Abarai, Gin Ichimaru, Sosuke Aizen, Grimmjow, Ulquiorra, Nelliel.
   Titles: 2nd Hokage, 3rd Hokage, 4th Hokage, Mizukage, Kyuubi Naruto, Sage Naruto.
3. **Places:** villages are "Fire Village", "Water Village", "Earth Village", "Wind Village",
   "Lightning Village"; "Kota Malaikat" = "Angel City", "Kota Iblis" = "Demon City". Other places:
   evocative English, Title Case.
4. **Translate Indonesian fully.** Keep Japanese technique names in romaji when the source uses them
   (e.g. "Rasengan", "Chidori"); translate descriptive Indonesian names ("Pedang Kayu" → "Wooden
   Sword"). Never leave Indonesian words in the result.
5. **Style:** Title Case for names, short, no trailing punctuation. Keep numbers, levels and grades
   exactly ("Lv.10", "Grade A", roman numerals). Keep upgrade suffixes as " +N" with an ASCII plus
   ("Naruto Uzumaki ＋10" → "Naruto Uzumaki +10").
6. **Quests:** short imperative or title phrase ("Latihan Ninjutsu" → "Ninjutsu Training",
   "Kunjungi Ketua Desa" → "Visit the Village Elder").
7. **Monsters and items** keep their in-world flavour; a monster already in English stays as is
   unless clearly wrong.
8. **Consistency:** the same Indonesian word gets the same English word everywhere in your batch
   (e.g. "Ketua Desa" is always "Village Elder", as Reborn calls NPC n11001, "Batu" as a currency is "Stone").
9. No markup in `en` (the merge step restores any colour tags).
