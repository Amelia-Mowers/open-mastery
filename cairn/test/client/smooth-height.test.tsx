// @vitest-environment jsdom
/** Only ONE height animator may wrap any given content.
 *
 * A scaffolded practice serve nests ItemCard's SmoothHeight directly
 * around StepwisePlayer's, and each pixel-locks and transitions its own
 * height over 350ms. Chained, they read as the box expanding twice on
 * load. Measured in a real browser before the fix: 3 wrappers, 2 of them
 * nested, on a single practice card.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SmoothHeight } from '../../src/client/app/SmoothHeight'

describe('SmoothHeight nesting', () => {
  it('a nested instance does not open a second animated wrapper', () => {
    const { container } = render(
      <SmoothHeight>
        <div>
          <SmoothHeight>
            <SmoothHeight>
              <p>content</p>
            </SmoothHeight>
          </SmoothHeight>
        </div>
      </SmoothHeight>,
    )
    // exactly one animator, however deep the tree goes
    expect(container.querySelectorAll('.smooth-height')).toHaveLength(1)
    expect(container.querySelectorAll('.smooth-height .smooth-height')).toHaveLength(0)
    expect(container.textContent).toContain('content')
  })

  it('a nested instance still applies its dim treatment', () => {
    const { container } = render(
      <SmoothHeight>
        <SmoothHeight dim>
          <p>quiet</p>
        </SmoothHeight>
      </SmoothHeight>,
    )
    const dimmed = container.querySelector('.smooth-inner.dim')
    expect(dimmed).not.toBeNull()
    expect(dimmed?.getAttribute('aria-hidden')).toBe('true')
  })
})
