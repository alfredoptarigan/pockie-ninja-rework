// Reborn's small prompts (reborn-windows-M-Z-hud.md "Notice", "Warning", "Success", "Purchase
// successful" and the global confirm `Ie.J1`): one window for all of them.
// - No title: the confirm prompt, 250 wide, the text on BigBG1 and Accept / Deny 75x25.
// - A title ("Notice", "Warning", "Success"...): 260 wide, the centred message and OK 80x22, or
//   Confirm / Cancel when it asks something.
// Like Dialog it is a modal <dialog>, so it stacks over the window that opened it and Escape denies.
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { GameButton } from './skin'

const CONFIRM_WIDTH = 250
const TITLED_WIDTH = 260

export function Prompt({
  title,
  label,
  message,
  tone,
  width,
  onAccept,
  acceptLabel = 'Accept',
  acceptDisabled = false,
  denyLabel,
  onClose,
  children,
}: {
  /** Title band text; none for the confirm prompt. */
  title?: string
  /** Accessible name when the message is not a good one (it changes, or it is long). */
  label?: string
  message: ReactNode
  /** Success messages are bold green, as in Reborn's Success popup. */
  tone?: 'success'
  width?: number
  /** With it the prompt asks (Accept / Deny); without it it informs (OK). */
  onAccept?: () => void
  acceptLabel?: string
  acceptDisabled?: boolean
  /** Deny, Cancel or OK: closes the prompt. */
  denyLabel?: string
  onClose: () => void
  /** Extra fields under the message (a quantity, a currency choice). */
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageId = useId()
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
  }, [])
  const asks = onAccept !== undefined
  const buttonSize = asks
    ? title
      ? 'h-[22px] w-[70px]'
      : 'h-[25px] w-[75px]'
    : 'h-[22px] w-[80px]'
  return (
    <dialog
      ref={ref}
      role={title ? undefined : 'alertdialog'}
      aria-label={label}
      aria-labelledby={label ? undefined : title ? titleId : messageId}
      onClose={onClose}
      className={`game-frame game-window m-auto max-w-[calc(100%-1rem)] bg-transparent px-[5px] pb-[5px] backdrop:bg-transparent ${title ? 'pt-0' : 'pt-[5px]'}`}
      style={{ width: width ?? (title ? TITLED_WIDTH : CONFIRM_WIDTH) }}
    >
      {title && (
        <div className="game-frame-title mb-[5px]">
          <h2 id={titleId} className="game-title-tag font-game font-bold">
            {title}
          </h2>
        </div>
      )}
      <div className="game-panel-1 flex flex-col items-center gap-[8px] px-[6px] py-[10px] font-game text-[12px] leading-[15px] text-black">
        <div
          id={messageId}
          className={`w-full text-center whitespace-pre-line ${tone === 'success' ? 'font-bold text-[#2e7d32]' : ''}`}
        >
          {message}
        </div>
        {children}
        <div className="flex justify-center gap-[10px]">
          {asks && (
            <GameButton className={buttonSize} disabled={acceptDisabled} onClick={onAccept}>
              {acceptLabel}
            </GameButton>
          )}
          <GameButton className={buttonSize} onClick={onClose}>
            {denyLabel ?? (asks ? 'Deny' : 'OK')}
          </GameButton>
        </div>
      </div>
    </dialog>
  )
}
