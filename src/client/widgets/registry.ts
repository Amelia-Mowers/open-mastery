import type { WidgetInstance } from './contract'
import { createNumericInput, type NumericInputConfig } from './numeric-input'
import { createExpressionInput, type ExpressionInputConfig } from './expression-input'
import { createNumberLine, type NumberLineConfig } from './number-line'
import { createBalanceScale } from '../viz/balance-scale'
import { createEnvelopeModel } from '../viz/envelope-model'
import { createTapeDiagram } from '../viz/tape-diagram'
import { createHangerDiagram } from '../viz/hanger-diagram'
import { createAreaModel } from '../viz/area-model'
import { createOppositeFlip, type OppositeFlipConfig } from '../viz/opposite-flip'
import { createWorkedEquation } from '../viz/worked-equation'

/** The widget trinity (§4.4): one contract, three roles. `lesson` = drives a
 * patch-based explanation timeline; `input` = interactive in problem mode
 * with a meaningful extract(). Widgets marked input:false are display-only
 * FOR NOW — each has a planned input semantic (see CLAUDE.md). */
export interface WidgetRoles {
  lesson: boolean
  input: boolean
}

export const WIDGET_ROLES: Record<WidgetType, WidgetRoles> = {
  'numeric-input': { lesson: false, input: true },
  'expression-input': { lesson: false, input: true },
  'equation-input': { lesson: false, input: true },
  'number-line': { lesson: true, input: true },
  'balance-scale': { lesson: true, input: false },
  'envelope-model': { lesson: true, input: false },
  'tape-diagram': { lesson: true, input: false },
  'hanger-diagram': { lesson: true, input: false },
  'area-model': { lesson: true, input: false },
  'opposite-flip': { lesson: true, input: true },
  'worked-equation': { lesson: true, input: false },
}

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
  | 'tape-diagram'
  | 'hanger-diagram'
  | 'area-model'
  | 'opposite-flip'
  | 'worked-equation'

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
    case 'tape-diagram':
      return createTapeDiagram() as never
    case 'hanger-diagram':
      return createHangerDiagram() as never
    case 'area-model':
      return createAreaModel() as never
    case 'opposite-flip':
      return createOppositeFlip(config as OppositeFlipConfig) as never
    case 'worked-equation':
      return createWorkedEquation() as never
    default:
      throw new UnknownWidgetError(type)
  }
}
