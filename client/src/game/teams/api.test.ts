import { describe, expect, it } from 'vitest'
import { teamHudScene, teamScene } from './api'

describe('teamScene', () => {
  it('allows teams where the server does: neutral fields, the lobby and Demon City', () => {
    // Demon City (171) is the toll gate lobby: team toll gates are formed and entered there.
    for (const sceneId of [2601, 2805, 3102, 171]) expect(teamScene(sceneId)).toBe(true)
    for (const sceneId of [111, 161, 2101]) expect(teamScene(sceneId)).toBe(false)
  })

  it('shows the team HUD in Demon City and the toll gate instance', () => {
    expect(teamHudScene(171)).toBe(true)
    expect(teamHudScene(5001)).toBe(true)
    expect(teamHudScene(111)).toBe(false)
  })
})
