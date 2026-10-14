import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { showToast, ToastHost, TOAST_MS } from './toast'

afterEach(() => vi.useRealTimers())

describe('toast', () => {
  it('shows one message at a time and hides it after three seconds, like Reborn', () => {
    vi.useFakeTimers()
    render(<ToastHost />)
    act(() => showToast('Invalid Swap', 'failure'))
    act(() => showToast('Inventory is full! Please make some space first.', 'failure'))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Inventory is full!')
    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reads info and success toasts as a status', () => {
    render(<ToastHost />)
    act(() => showToast('Saved.', 'success'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })
})
