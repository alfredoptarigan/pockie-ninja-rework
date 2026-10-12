import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergeFromFiles, mergeSentences, npcNameTranslation, sentenceTerms } from './sentences.ts'
import type { GlossaryEntry } from './names.ts'

const dir = import.meta.dirname
const glossary: Record<string, GlossaryEntry> = {
  lg_name_n33006: { kind: 'npc', source: 'Stinger Bee', en: 'Bee' },
  lg_name_n33018: { kind: 'npc', source: 'Sweet Potato Demon', en: 'Potato' },
  lg_name_n32001: { kind: 'npc', source: 'Scarlet Bandit', en: 'Scarlet' },
  lg_Task_1: { kind: 'quest', source: 'Sweet Potato Demon', en: 'Potato' },
  lg_Scene_BackGround_111: { kind: 'scene', source: 'Fire Hamlet', en: 'Fire Village' },
}

describe('reproducible reviewed sentence merge', () => {
  it('reproduces the committed en.json byte for byte and retains every reviewed value', () => {
    const { en, problems } = mergeFromFiles()
    expect(`${JSON.stringify(en, null, 1)}\n`).toBe(readFileSync(join(dir, 'en.json'), 'utf8'))
    expect(problems).toEqual({})
    const overrides = JSON.parse(readFileSync(join(dir, 'overrides.json'), 'utf8')) as Record<
      string,
      string
    >
    expect(Object.keys(overrides).length).toBeGreaterThan(0)
    for (const [key, text] of Object.entries(overrides)) expect(en[key], key).toBe(text)
  }, 15_000)

  it('rejects overrides for missing keys or changed placeholders', () => {
    const source = { greeting: 'Hello {@0:name}' }
    const index = { '0': [{ key: 'greeting', numbers: [] }] }
    expect(() =>
      mergeSentences(source, {}, index, { '0': 'Hello {@0:name}' }, { unknown: 'Hello' }),
    ).toThrow('Unknown reviewed key')
    expect(() =>
      mergeSentences(
        source,
        {},
        index,
        { '0': 'Hello {@0:name}' },
        { greeting: 'Hello {@1:name}' },
      ),
    ).toThrow('Reviewed placeholders differ')
    expect(
      mergeSentences(
        source,
        {},
        index,
        { '0': 'Hello {@0:name}' },
        { greeting: 'Welcome {@0:name}' },
      ).en.greeting,
    ).toBe('Welcome {@0:name}')
  })
})

describe('whole NPC name scope', () => {
  it('does not supply monster names as prose terms, including duplicate quest names', () => {
    expect([...sentenceTerms(glossary)]).toEqual([['Fire Hamlet', 'Fire Village']])
  })

  it('uses a whole name in an NPC name field while retaining its markup', () => {
    expect(
      npcNameTranslation('lg_NPC_n33006', "<font color='#fff'>Stinger Bee</font>", glossary),
    ).toBe("<font color='#fff'>Bee</font>")
    expect(npcNameTranslation('lg_NPC_n33018', 'Sweet Potato Demon', glossary)).toBe('Potato')
  })

  it('never substitutes substrings, other NPC names or names inside dialogue and descriptions', () => {
    expect(
      npcNameTranslation('lg_NPC_n33006', 'Stinger Bee loves peace.', glossary),
    ).toBeUndefined()
    expect(npcNameTranslation('lg_NPC_n33006', 'Sweet Potato Demon', glossary)).toBeUndefined()
    expect(npcNameTranslation('lg_Say_n33006', 'Stinger Bee', glossary)).toBeUndefined()
    const source = {
      lg_Say_n33006: 'Stinger Bee',
      lg_description: 'A scarlet potato attracts a bee.',
    }
    const index = {
      '0': [{ key: 'lg_Say_n33006', numbers: [] }],
      '1': [{ key: 'lg_description', numbers: [] }],
    }
    const { en } = mergeSentences(source, glossary, index, {
      '0': 'Stinger Bee',
      '1': 'A scarlet potato attracts a bee.',
    })
    expect(en.lg_Say_n33006).toBe('Stinger Bee')
    expect(en.lg_description).toBe('A scarlet potato attracts a bee.')
  })
})
