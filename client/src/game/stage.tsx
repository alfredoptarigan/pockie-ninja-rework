// Mount points for Task 8b (Phaser). The React HUD renders these and works without them.
//
// ScenePictureMount: the scene background with clickable NPCs/buildings (`npcs[].x/y/scale` are
// the original picture coordinates) and monster portraits. Call `onNpc` / `onMonster` on clicks so
// the same dialogs and fights open as from the lists next to the picture.
//
// BattleReplayMount: plays `replay` (game-core Replay: fighters + events) with sprite strips,
// damage numbers and skip/replay controls, above the text summary in the fight dialog.
import type { FightResult, SceneMonster, SceneNpc, SceneView } from './types'

export function ScenePictureMount(_props: {
  scene: SceneView
  onNpc: (npc: SceneNpc) => void
  onMonster: (monster: SceneMonster) => void
}) {
  return null
}

export function BattleReplayMount(_props: { replay: FightResult['replay'] }) {
  return null
}
