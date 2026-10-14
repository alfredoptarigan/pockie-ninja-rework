// Reborn's Settings window (data/reborn-raw/audit-2026-10-14, "Settings"): 400x325, opened by the
// top bar's Settings button, a tab control over a 400x300 panel. We honour the Sound block (Mute
// Music, Volume %) and keep our account links (website, log out). ponytail: no Privacy, Patch Notes
// or Redeem Code tabs and no Theme, Language, Combat or "Other" options; the game has none of those
// systems yet, so they are left out rather than shown inert.
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { useLogout } from '../../lib/auth'
import { SoundSettings } from '../audio'
import { Dialog, GameButton, Tabs } from '../skin'

const TOP_BUTTON = 'h-[22px] w-[66px] !min-w-0 !px-0'

export function SettingsWindow({ onClose }: { onClose: () => void }) {
  const logout = useLogout()
  const panelId = useId()
  return (
    <Dialog title="Settings" onClose={onClose} className="game-window-bare w-[410px]">
      <div className="w-[400px] font-game text-xs text-black">
        <Tabs
          label="Settings"
          tabs={[{ id: 'settings', title: 'Settings' }]}
          active="settings"
          onChange={() => {}}
          panelId={panelId}
        />
        <div
          id={panelId}
          role="tabpanel"
          className="game-panel-1 flex h-[300px] flex-col gap-3 overflow-auto p-[5px]"
        >
          <SoundSettings />
          <section aria-label="Account" className="flex flex-col gap-1">
            <h3 className="font-bold">Account:</h3>
            <div className="flex items-center gap-2">
              <Link to="/" className="game-button inline-flex h-6 items-center px-3">
                Back to the website
              </Link>
              <GameButton disabled={logout.isPending} onClick={() => logout.mutate()}>
                Log out
              </GameButton>
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  )
}

/** The top bar's Settings button; it opens the Settings window. */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <GameButton className={TOP_BUTTON} onClick={() => setOpen(true)}>
        Settings
      </GameButton>
      {open && <SettingsWindow onClose={() => setOpen(false)} />}
    </>
  )
}
