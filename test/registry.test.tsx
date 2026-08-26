import { describe, it, expect } from 'vitest'
import { createWidget, UnknownWidgetError } from '../src/client/widgets/registry'

describe('widget registry', () => {
  it('creates each registered widget type', () => {
    expect(createWidget('numeric-input', {}).a11y.role).toBe('textbox')
    expect(createWidget('expression-input', {}).a11y.role).toBe('textbox')
    expect(createWidget('number-line', { min: 0, max: 5, step: 1 }).a11y.role).toBe('slider')
    expect(createWidget('balance-scale').a11y.role).toBe('img')
  })

  it("resolves the curriculum alias 'equation-input' to expression-input", () => {
    const w = createWidget('equation-input', { variable: 'x' })
    expect(w.a11y.role).toBe('textbox')
    expect(w.extract()).toEqual({ raw: '', normalized: '' })
  })

  it('throws a typed error for unknown types', () => {
    expect(() => createWidget('holographic-abacus')).toThrowError(UnknownWidgetError)
    try {
      createWidget('holographic-abacus')
    } catch (e) {
      expect((e as UnknownWidgetError).widgetType).toBe('holographic-abacus')
    }
  })
})
