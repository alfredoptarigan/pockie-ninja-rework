// The write panel of the Mail window (UI_MailFrame.WriteNewMail): recipient, subject 20, body 200.
import { useId, useState, type FormEvent } from 'react'
import { MAIL_BODY_MAX, MAIL_SUBJECT_MAX } from '../../../../shared/src/schemas/social'
import { errorMessage } from '../api'
import { GameButton, Notice } from '../skin'
import { useSendMail } from './api'

export function ComposeMail({
  to = '',
  subject = '',
  onSent,
  onCancel,
}: {
  to?: string
  subject?: string
  onSent: () => void
  onCancel: () => void
}) {
  const ids = useId()
  const [form, setForm] = useState({ to, subject, body: '' })
  const sendMail = useSendMail()
  const set = (field: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    sendMail.mutate(form, { onSuccess: onSent })
  }
  const ready = form.to.trim() && form.subject.trim() && form.body.trim()
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 text-[12px] text-black">
      <label htmlFor={`${ids}-to`}>To</label>
      <input
        id={`${ids}-to`}
        value={form.to}
        maxLength={12}
        onChange={(event) => set('to')(event.target.value)}
        className="border border-wood-light bg-white px-1"
      />
      <label htmlFor={`${ids}-subject`} className="flex justify-between">
        <span>Subject</span>
        <span aria-hidden>
          {form.subject.length}/{MAIL_SUBJECT_MAX}
        </span>
      </label>
      <input
        id={`${ids}-subject`}
        value={form.subject}
        maxLength={MAIL_SUBJECT_MAX}
        onChange={(event) => set('subject')(event.target.value)}
        className="border border-wood-light bg-white px-1"
      />
      <label htmlFor={`${ids}-body`} className="flex justify-between">
        <span>Message</span>
        <span aria-hidden>
          {form.body.length}/{MAIL_BODY_MAX}
        </span>
      </label>
      <textarea
        id={`${ids}-body`}
        value={form.body}
        maxLength={MAIL_BODY_MAX}
        rows={5}
        onChange={(event) => set('body')(event.target.value)}
        className="resize-none border border-wood-light bg-white px-1"
      />
      {sendMail.isError && <Notice tone="error">{errorMessage(sendMail.error)}</Notice>}
      <div className="flex justify-end gap-2">
        <GameButton type="submit" disabled={!ready || sendMail.isPending}>
          Send
        </GameButton>
        <GameButton onClick={onCancel}>Cancel</GameButton>
      </div>
    </form>
  )
}
