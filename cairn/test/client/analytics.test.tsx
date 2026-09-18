/** Anonymous demo analytics: signals are recorded for every surface but
 * beacons only leave on the deployed GitHub Pages host — jsdom runs on
 * localhost, so these tests double as proof that dev/test stay silent. */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { recorded, trackView } from '../../src/client/app/analytics'
import { LessonPlayer } from '../../src/client/app/LessonPlayer'
import { fixtureBundle } from '../core/fixtures'

beforeEach(() => {
  recorded.length = 0
})

describe('demo analytics', () => {
  it('records view names and exposes the breadcrumb for probes', () => {
    trackView('guide')
    expect(recorded).toEqual(['/guide'])
    expect((window as unknown as Record<string, unknown>)['__cairnAnalytics']).toBe(recorded)
  })

  it('a lesson serve records its explanation id; a walkthrough does not', async () => {
    const bundle = fixtureBundle()
    const exp = bundle.explanations[0]!
    const params = bundle.items.find((i) => i.skills.includes(exp.skill))!.params
    const { unmount } = render(
      <LessonPlayer explanation={exp} params={params} kind="lesson" autoplay={false} onDone={() => {}} />,
    )
    await waitFor(() => expect(recorded).toContain(`lesson/${exp.id}`))
    unmount()
    recorded.length = 0
    render(
      <LessonPlayer explanation={exp} params={params} kind="walkthrough" autoplay={false} onDone={() => {}} />,
    )
    expect(recorded).toEqual([])
  })
})
