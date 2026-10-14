import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/utils'
import { AudioProvider } from '../audio'
import { SettingsButton } from './index'

beforeEach(() => localStorage.clear())

function renderSettings() {
  renderWithProviders(
    <AudioProvider>
      <SettingsButton />
    </AudioProvider>,
  )
}

describe('Settings window', () => {
  it('opens from the Settings button with the sound options and the account links', async () => {
    renderSettings()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const window = screen.getByRole('dialog', { name: 'Settings' })
    expect(within(window).getByRole('tab', { name: 'Settings' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const sound = within(window).getByRole('group', { name: 'Sound:' })
    const mute = within(sound).getByRole('checkbox', { name: 'Mute Music' })
    const volume = within(sound).getByRole('spinbutton', { name: 'Volume %' })
    const slider = within(sound).getByRole('slider', { name: 'Volume' })
    expect(mute).not.toBeChecked()

    await userEvent.clear(volume)
    await userEvent.type(volume, '30')
    expect(slider).toHaveValue('30')
    await userEvent.click(mute)
    expect(slider).toBeDisabled()
    expect(volume).toBeDisabled()

    expect(within(window).getByRole('link', { name: 'Back to the website' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(within(window).getByRole('button', { name: 'Log out' })).toBeEnabled()

    await userEvent.click(within(window).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
