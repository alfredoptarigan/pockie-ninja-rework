export type IniSection = Record<string, string | string[]>
export type Ini = Record<string, IniSection>

const COMMENT = /^(;|#|\/\/)/

/**
 * Parses the original server's INI files: `[section]` headers and `key=value` lines.
 * A key repeated within a section (for example `r=` spawn lines) becomes an array in file order.
 */
export function parseIni(text: string): Ini {
  const ini: Ini = {}
  let section = ''

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || COMMENT.test(line)) continue

    const header = /^\[(.*)\]$/.exec(line)
    if (header) {
      section = header[1]!.trim()
      ini[section] ??= {}
      continue
    }

    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    const target = (ini[section] ??= {})
    const existing = target[key]
    if (existing === undefined) target[key] = value
    else target[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
  }

  return ini
}
