// Server-side English profanity mask for chat, whispers and mail (decision 19). The word list
// and the obfuscation handling (leetspeak, repeated letters, case) come from `obscenity`
// (MIT, no dependencies), which already whitelists Scunthorpe-style words such as "assassin".
import {
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
  TextCensor,
} from 'obscenity'

// ponytail: letters split by spaces ("f u c k") pass; reports cover it (decision 19).
const english = englishDataset.build()

// Game words the English list would mask: ninja names, techniques and food.
const GAME_WORDS = ['shitenno', 'shitsuke', 'shiitake', 'shitake', 'penistone', 'sexy no jutsu']

const matcher = new RegExpMatcher({
  ...english,
  whitelistedTerms: [...(english.whitelistedTerms ?? []), ...GAME_WORDS],
  ...englishRecommendedTransformers,
})
const censor = new TextCensor().setStrategy(asteriskCensorStrategy())

/** Replaces every profane word with asterisks of the same length; other text is unchanged. */
export function filterText(text: string): string {
  const matches = matcher.getAllMatches(text)
  return matches.length === 0 ? text : censor.applyTo(text, matches)
}
