import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { BattleSkills } from './BattleSkills'
import type { VisualReplay } from './phaser/companions'

it('shows skill descriptions on hover and keyboard focus, including pet skills', () => {
  const replay = {
    fighters: [{ panel: { skills: [1802, 1813], petSkills: [1813] } }],
    events: [],
  } as unknown as VisualReplay
  const view = render(<BattleSkills replay={replay} fighters={[0, undefined]} />)
  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(2)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.mouseEnter(buttons[0]!.parentElement!)
  expect(screen.getByRole('tooltip').textContent).toContain(buttons[0]!.getAttribute('aria-label'))
  fireEvent.mouseLeave(buttons[0]!.parentElement!)
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.focus(buttons[1]!)
  expect(buttons[1]!.getAttribute('aria-describedby')).toBe('battle-skill-tooltip')
  fireEvent.keyDown(buttons[1]!, { key: 'Escape' })
  expect(screen.queryByRole('tooltip')).toBeNull()
  fireEvent.focus(buttons[0]!)
  view.rerender(<BattleSkills replay={replay} fighters={[undefined, undefined]} />)
  expect(screen.queryByRole('tooltip')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})
