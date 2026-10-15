import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Prompt } from './Prompt'

describe('Prompt', () => {
  it("is Reborn's untitled 250px confirm with Accept and Deny", async () => {
    const onAccept = vi.fn()
    const onClose = vi.fn()
    render(
      <Prompt
        message="Sell 2 Healing Powder for 32 Stone?"
        onAccept={onAccept}
        onClose={onClose}
      />,
    )
    const prompt = screen.getByRole('alertdialog', { name: 'Sell 2 Healing Powder for 32 Stone?' })
    expect(prompt).toHaveStyle({ width: '250px' })
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(onAccept).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows a titled Notice with a single OK, and a green Success message', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Prompt title="Notice" message="The merchant is away." onClose={onClose} />,
    )
    expect(screen.getByRole('dialog', { name: 'Notice' })).toHaveStyle({ width: '260px' })
    await userEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()

    rerender(
      <Prompt title="Success" tone="success" message="Healing complete!" onClose={onClose} />,
    )
    expect(screen.getByText('Healing complete!')).toHaveClass('text-[#2e7d32]')
  })

  it('takes a name, custom labels, extra fields and a disabled Accept', async () => {
    const onAccept = vi.fn()
    render(
      <Prompt
        label="Buy Healing Powder"
        title="Warning"
        message="Buy 2?"
        acceptLabel="Confirm"
        denyLabel="Cancel"
        acceptDisabled
        onAccept={onAccept}
        onClose={vi.fn()}
      >
        <input aria-label="Quantity" defaultValue={2} />
      </Prompt>,
    )
    const prompt = screen.getByRole('dialog', { name: 'Buy Healing Powder' })
    expect(prompt).toContainElement(screen.getByLabelText('Quantity'))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
