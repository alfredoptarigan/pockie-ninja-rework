// Runs JPEXS FFDec (from the game backup) headless. Exports of a whole folder run in one JVM.
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { paths } from './paths.ts'

const run = promisify(execFile)
const java = join(paths.runtime, 'jdk8/bin/java')
const jar = join(paths.runtime, 'ffdec/ffdec.jar')
const HEAP = '-Xmx1200m'
// FFDec prints a line per exported item; big folders need more than the default 1 MB buffer.
const MAX_OUTPUT = 64 * 1024 * 1024

export async function ffdec(args: string[]) {
  await run(java, [HEAP, '-Djava.awt.headless=true', '-jar', jar, ...args], {
    maxBuffer: MAX_OUTPUT,
  })
}

/** Exports every sprite of `input` (a SWF or a folder of SWFs) as PNG frames and SVG frames. */
export async function exportSprites(input: string, out: string) {
  await ffdec(['-format', 'sprite:png', '-export', 'sprite', join(out, 'png'), input])
  await ffdec(['-format', 'sprite:svg', '-export', 'sprite', join(out, 'svg'), input])
}

/** Runs `task` over `items` with at most `limit` running at once, keeping result order. */
export async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
