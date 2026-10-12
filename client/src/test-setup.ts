import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom lacks these browser APIs; Motion probes them.
vi.stubGlobal(
  'matchMedia',
  (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }) as unknown as MediaQueryList,
)
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

// jsdom has <dialog> but not its modal behaviour: like a browser, showModal focuses the first
// control, close() fires "close", and Escape closes the dialog that has the focus.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true
  this.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  if (!this.open) return
  this.open = false
  this.dispatchEvent(new Event('close'))
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !(event.target instanceof Element)) return
  const dialog = event.target.closest('dialog')
  if (dialog?.open) dialog.close()
})

afterEach(cleanup)

// Phaser needs WebGL/canvas, which jsdom lacks: the stage entry is replaced by a stub that starts
// nothing and ends battles at once (stage.test.tsx inspects the calls).
vi.mock('./game/phaser', () => ({
  mountPicture: vi.fn(() => ({ destroy: vi.fn() })),
  mountBattle: vi.fn((_parent: HTMLElement, options: { onFinished: () => void }) => {
    options.onFinished()
    return Promise.resolve({ skip: vi.fn(), replay: vi.fn(), setSpeed: vi.fn(), destroy: vi.fn() })
  }),
}))
