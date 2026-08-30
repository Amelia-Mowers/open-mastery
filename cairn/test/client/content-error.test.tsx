// @vitest-environment jsdom
/** NO SILENT FALLBACKS, applied to content faults.
 *
 * A template that cannot render is a curriculum fault. Returning its raw
 * source printed "{a*b}" on the board as though it were content; a
 * placeholder is the same failure in weaker form — a lesson shown with its
 * maths missing. So renderText THROWS and the boundary offers a reload:
 * the student sees an honest error, never broken material.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderText, TemplateRenderError } from '../../src/client/app/render'
import { ContentErrorBoundary } from '../../src/client/app/ContentErrorBoundary'

afterEach(() => vi.restoreAllMocks())

describe('content faults fail loudly', () => {
  it('renderText throws rather than returning the raw template', () => {
    expect(renderText('{a} + {b}', { a: 1, b: 2 })).toBe('1 + 2')
    // {c} is not in params — a curriculum fault
    expect(() => renderText('{a} + {c}', { a: 1 })).toThrow(TemplateRenderError)
    // and never yields the raw source or a placeholder as "content"
    try {
      renderText('{a*b}', {})
      throw new Error('should have thrown')
    } catch (e) {
      expect(String((e as Error).message)).not.toBe('{a*b}')
    }
  })

  it('the boundary shows an honest error with a reload, not a broken lesson', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = (): never => {
      throw new TemplateRenderError('{a*b}', {})
    }
    render(
      <ContentErrorBoundary>
        <Boom />
      </ContentErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()
    // the student is told it is not their fault and progress is safe
    expect(screen.getByText(/not yours/i)).toBeTruthy()
  })
})
