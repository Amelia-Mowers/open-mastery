/** Milestones are ONE-SHOT server-side: departureMilestone marks a
 * "<skill>:<rank>" shown when it GENERATES it, so any milestone the client
 * fails to render is destroyed for good. Two ways that used to happen:
 *
 *  1. it arrived attached to a `lesson` serve, and the lesson branch
 *     outranked the milestone branch in the render chain, so the student
 *     was taught the next skill instead of being congratulated for the
 *     one they just left;
 *  2. a second refresh() landed before the student dismissed the first,
 *     and setMilestone overwrote it.
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../../src/client/app/App'
import type { CairnApi, ServerNext } from '../../src/client/app/api'

const MS = (skillId: string, name: string): NonNullable<ServerNext['milestone']> => ({
  name,
  blurb: 'nice work',
  pct: 0.4,
  skillId,
  skillName: `Skill ${skillId}`,
})

/** serves a lesson that CARRIES a milestone for the skill just left */
function stubApi(queue: ServerNext[]): CairnApi {
  let i = 0
  const api = {
    next: async () => queue[Math.min(i++, queue.length - 1)]!,
    attempt: async () => ({ verdict: { verdict: 'correct' }, correct: true, emitted: [], points: 0 }),
    explanationViewed: async () => {},
    startCheck: async () => {},
    explain: async () => ({ explanation: null, params: {}, skillName: '', totalReps: 0 }),
    explained: async () => {},
    demos: async () => ({ demos: [] }),
    demoFor: async () => ({}),
    bundle: async () => ({ skills: [] }),
    guide: async () => ({ students: [], totalSkills: 0 }),
    seedClass: async () => {},
    state: async () => ({ skills: {}, openFlags: [], points: 0 }),
    reset: async () => {},
  }
  return api as unknown as CairnApi
}

const lessonServe = (skillId: string, milestone?: NonNullable<ServerNext['milestone']>): ServerNext =>
  ({
    action: { kind: 'lesson', skillId, explanationId: `${skillId}.exp` },
    explanation: {
      id: `${skillId}.exp`,
      skill: skillId,
      representation: 'worked-equation',
      widget: 'worked-equation',
      timeline: [{ t: 0, caption: 'watch' }],
    },
    params: {},
    skillName: `Skill ${skillId}`,
    points: 0,
    ...(milestone ? { milestone } : {}),
  }) as unknown as ServerNext

describe('milestone delivery', () => {
  it('congratulates the student BEFORE teaching the next skill', async () => {
    // the student is moved off skill A onto a lesson for skill B, and the
    // milestone for A rides that very response
    const api = stubApi([lessonServe('B', MS('A', 'Started'))])
    render(<App apiFactory={() => api} initialStudent="kid" />)

    // the milestone for A must be what they see — not B's lesson
    await waitFor(() => expect(screen.getByText('Milestone!')).toBeTruthy())
    expect(screen.getByText(/Skill A/)).toBeTruthy()
  })

  it('queues a second milestone instead of destroying the first', async () => {
    // "Keep going on this" refreshes, and that refresh carries ANOTHER
    // milestone. The first is already burned server-side, so an overwrite
    // here loses an award the student earned and can never be re-issued.
    const api = stubApi([
      lessonServe('B', MS('A', 'Started')),
      lessonServe('C', MS('B', 'Getting it')),
    ])
    render(<App apiFactory={() => api} initialStudent="kid" />)

    await waitFor(() => expect(screen.getByText(/Skill A/)).toBeTruthy())
    // "Keep going" dismisses A's milestone AND refreshes, pulling in B's
    await userEvent.click(screen.getByRole('button', { name: 'Keep going on this' }))
    // B's milestone must now be on screen — the queue kept it
    await waitFor(() => expect(screen.getByText(/Skill B/)).toBeTruthy())
    expect(screen.getByText('Milestone!')).toBeTruthy()
  })
})
