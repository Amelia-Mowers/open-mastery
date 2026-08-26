/** The widget zoo renders every demo and input for eyeballing. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Zoo } from '../../src/client/app/Zoo'
import { ZOO_DEMOS } from '../../src/client/app/zoo-demos'

describe('widget zoo', () => {
  it('renders a playing demo for every representation plus the answer inputs', () => {
    const { container } = render(<Zoo />)
    // every demo card is present and its player mounted (timeline segments render)
    expect(container.querySelectorAll('.zoo-card')).toHaveLength(ZOO_DEMOS.length + 3)
    const tracks = screen.getAllByRole('group', { name: 'Lesson timeline' })
    expect(tracks).toHaveLength(ZOO_DEMOS.length)
    // inputs are live
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(1)
  })
})
