// Game text from the generated slice of tools/i18n/en.json (client/scripts/game-text.ts).
// Strings carry the original client's small markup (<font color>, <b>, <br>, [line]); it is
// turned into React elements here and never injected as HTML.
import type { ReactNode } from 'react'
import strings from '../i18n/en.json'

const table = strings as Record<string, string>

const TOKEN =
  /(<font\s+color=['"]?#[0-9a-fA-F]{6}['"]?\s*>|<\/font>|<b>|<\/b>|<br\s*\/?>|\[line\]|\[break\]|\n)/i
const COLOR = /#[0-9a-fA-F]{6}/
// The 2011 colors were picked for dark panels; on parchment they need darker shades to stay
// readable (WCAG AA). Unknown colors are used as they are.
const READABLE: Record<string, string> = {
  '#00b034': '#1b6e17',
  '#ff0000': '#b3170f',
  '#8e8e8e': '#5c5c5c',
  '#00aeff': '#0a5f93',
  '#ffff00': '#7a5c00',
  '#ff9900': '#9a4a00',
  '#ff8a00': '#9a4a00',
  '#ff6565': '#b3170f',
}

/** Fills `{@0:}` style placeholders. */
function fill(text: string, args: (string | number)[]) {
  // Some templates glue the argument to the previous word ("talk to{@1:NPC}").
  return text.replace(/\{@(\d+):[^}]*\}/g, (_, i: string, offset: number) => {
    const value = String(args[Number(i)] ?? '')
    return value && /[\p{L}\p{N}]/u.test(text[offset - 1] ?? '') ? ` ${value}` : value
  })
}

/** Raw string for a key, or undefined when the slice does not have it. */
export function rawText(key: string): string | undefined {
  return table[key]
}

/** Plain text without markup (for labels, aria attributes and options). */
export function plainText(key: string, fallback = '', args: (string | number)[] = []) {
  const text = table[key]
  if (text === undefined) return fallback
  return fill(text, args)
    .replace(/<[^>]*>|\[line\]|\[break\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Outfit names are stored with their tier ("Ggio Vega +0"); creation shows the bare name. */
export function outfitName(clothing: number) {
  return plainText(`lg_avatar${clothing}`, `Outfit ${clothing}`).replace(/\s*\+0$/, '')
}

interface Span {
  color?: string
  bold: boolean
  children: ReactNode[]
}

/** Renders a game string with its colors and line breaks. */
export function GameText({
  k,
  fallback = '',
  args = [],
}: {
  k: string
  fallback?: string
  args?: (string | number)[]
}) {
  const text = table[k]
  if (text === undefined) return <>{fallback}</>

  const root: Span = { bold: false, children: [] }
  const stack: Span[] = [root]
  let key = 0
  for (const part of fill(text, args).split(TOKEN)) {
    if (!part) continue
    const top = stack[stack.length - 1]!
    const lower = part.toLowerCase()
    if (lower.startsWith('<font')) {
      const color = COLOR.exec(part)![0].toLowerCase()
      stack.push({ color: READABLE[color] ?? color, bold: top.bold, children: [] })
    } else if (lower === '<b>') {
      stack.push({ color: top.color, bold: true, children: [] })
    } else if (lower === '</font>' || lower === '</b>') {
      if (stack.length > 1) close(stack, key++)
    } else if (TOKEN.test(part)) {
      top.children.push(<br key={key++} />)
    } else {
      // Stray tags the table may contain are dropped, their text kept.
      top.children.push(part.replace(/<[^>]*>/g, ''))
    }
  }
  while (stack.length > 1) close(stack, key++)
  return <>{root.children}</>
}

function close(stack: Span[], key: number) {
  const span = stack.pop()!
  stack[stack.length - 1]!.children.push(
    <span key={key} style={{ color: span.color, fontWeight: span.bold ? 700 : undefined }}>
      {span.children}
    </span>,
  )
}
