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

// jsdom has <dialog> but not its modal methods.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false
}

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
