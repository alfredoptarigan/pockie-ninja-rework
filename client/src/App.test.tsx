import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('shows the game name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Pockie Ninja Remastered' })).toBeInTheDocument()
  })
})
