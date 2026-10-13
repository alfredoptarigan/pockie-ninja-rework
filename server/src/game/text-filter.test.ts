import { describe, expect, it } from 'vitest'
import { filterText } from './text-filter.js'

describe('filterText (decision 19)', () => {
  it('masks English profanity with asterisks of the same length', () => {
    expect(filterText('fuck you')).toBe('**** you')
    expect(filterText('you are a cunt')).toBe('you are a ****')
    expect(filterText('what a bitch')).toBe('what a *****')
  })

  it('catches common obfuscations', () => {
    expect(filterText('sh1t')).toBe('****')
    expect(filterText('fuuuck')).toBe('****')
  })

  it('keeps the rest of the text, case and spacing unchanged', () => {
    expect(filterText('Meet me at Las Noches, shit happens.')).toBe(
      'Meet me at Las Noches, **** happens.',
    )
    expect(filterText('')).toBe('')
    expect(filterText('  Hello  ninja  ')).toBe('  Hello  ninja  ')
  })

  it.each([
    'Scunthorpe',
    'assassin',
    'Assassin Blade',
    'Sasuke',
    'Kisame',
    'Kisuke',
    'Shikamaru',
    'Shippuden',
    'Shitsuke',
    'Shiitake ramen',
    'Shitenno',
    'Sexy no Jutsu',
    'Hokage_7',
    'Kakashi Hatake',
    'Kankuro',
    'Kunoichi',
    'Sharingan',
    'Shukaku',
    'Penistone',
    'Matsuri',
    'Hancock',
    'cocktail',
    'classic',
    'pass the toll gate',
    'Ninjutsu Duel',
    'Honor shop',
    'Market',
    'Valhalla',
    'Las Noches',
    'Chunin III',
    'Jounin',
    'ANBU',
    'Sannin',
    'Kage',
    'grass',
    'analysis',
    'therapist',
    'document',
    'title',
    'harass',
  ])('does not mask %s', (text) => {
    expect(filterText(text)).toBe(text)
  })
})
