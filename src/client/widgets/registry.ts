import type { WidgetInstance } from './contract'
import { createNumericInput, type NumericInputConfig } from './numeric-input'
import { createExpressionInput, type ExpressionInputConfig } from './expression-input'
import { createNumberLine, type NumberLineConfig } from './number-line'
import { createBalanceScale } from '../viz/balance-scale'
import { createEnvelopeModel } from '../viz/envelope-model'

export class UnknownWidgetError extends Error {
  constructor(readonly widgetType: string) {
    super(`Unknown widget type: ${widgetType}`)
    this.name = 'UnknownWidgetError'
  }
}

export type WidgetType =
  | 'numeric-input'
  | 'expression-input'
  | 'equation-input' // curriculum alias for expression-input
  | 'number-line'
  | 'balance-scale'
  | 'envelope-model'

/**
 * Create a widget instance by curriculum widget type.
 * Throws UnknownWidgetError for unregistered types (a typed error the
 * client shell can catch and surface as a curriculum bug).
 */
export function createWidget(
  type: string,
  config: unknown = {},
): WidgetInstance<never, unknown, Record<string, unknown>> {
  switch (type) {
    case 'numeric-input':
      return createNumericInput(config as NumericInputConfig) as never
    case 'expression-input':
    case 'equation-input':
      return createExpressionInput(config as ExpressionInputConfig) as never
    case 'number-line':
      return createNumberLine(config as NumberLineConfig) as never
    case 'balance-scale':
      return createBalanceScale() as never
    case 'envelope-model':
      return createEnvelopeModel() as never
    default:
      throw new UnknownWidgetError(type)
  }
}
