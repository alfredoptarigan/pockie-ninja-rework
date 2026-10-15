import type { VisualReplay } from './companions'

/** Cast techniques only: replay buff events can carry status ids instead of skill ids. */
export function replayTechniques(replay: VisualReplay, fighter: number) {
  return [
    ...new Set(
      replay.events
        .filter(
          (e) =>
            e.actor === fighter &&
            !e.isPet &&
            [5, 7, 14].includes(e.event) &&
            e.skillId &&
            e.skillId !== 1,
        )
        .map((e) => e.skillId!),
    ),
  ].slice(0, 15)
}

export const techniqueIcon = (id: number) =>
  `/assets/reborn/icons/skills/${id >= 2801 && id <= 2810 ? id - 1 : id === 3809 ? 1809 : id}.webp`
