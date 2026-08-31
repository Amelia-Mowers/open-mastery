import type { WidgetInstance } from './contract'
import { createNumericInput, type NumericInputConfig } from './numeric-input'
import { createExpressionInput, type ExpressionInputConfig } from './expression-input'
import { createTermInput, type TermInputConfig } from './term-input'
import { createCompareInput, type CompareInputConfig } from './compare-input'
import { createPairInput, type PairInputConfig } from './pair-input'
import { createNumberLine, type NumberLineConfig } from './number-line'
import { createBalanceScale, type BalanceScaleConfig } from '../viz/balance-scale'
import { createEnvelopeModel, type EnvelopeModelConfig } from '../viz/envelope-model'
import { createTapeDiagram, type TapeDiagramConfig } from '../viz/tape-diagram'
import { createHangerDiagram, type HangerDiagramConfig } from '../viz/hanger-diagram'
import { createAreaModel, type AreaModelConfig } from '../viz/area-model'
import { createOppositeFlip, type OppositeFlipConfig } from '../viz/opposite-flip'
import { createWorkedEquation, type WorkedEquationConfig } from '../viz/worked-equation'
import { createDoubleNumberLine, type DoubleNumberLineConfig } from '../viz/double-number-line'
import { createRatioTable, type RatioTableConfig } from '../viz/ratio-table'
import { createChoice, type ChoiceConfig } from './choice'
import { createCubeModel } from '../viz/cube-model'

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
  // structured [ ]x + [ ] — scaffolds the easier tiers; the ceiling stays
  // a raw expression (capstone rule)
  'term-input': { lesson: false, input: true },
  // composite comparison answer: both rates + the pick, one submission —
  // the CHECK instrument for compare skills
  'compare-input': { lesson: false, input: true },
  // both quantities of a scaled ratio row, one submission
  'pair-input': { lesson: false, input: true },
  'equation-input': { lesson: false, input: true },
  'number-line': { lesson: true, input: false },
  'balance-scale': { lesson: true, input: false },
  'envelope-model': { lesson: true, input: false },
  'tape-diagram': { lesson: true, input: false },
  'hanger-diagram': { lesson: true, input: false },
  'area-model': { lesson: true, input: false },
  'opposite-flip': { lesson: true, input: false },
  'worked-equation': { lesson: true, input: false },
  'double-number-line': { lesson: true, input: false },
  'ratio-table': { lesson: true, input: false },
  choice: { lesson: false, input: true },
  'cube-model': { lesson: true, input: false },
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
  | 'term-input'
  | 'compare-input'
  | 'pair-input'
  | 'equation-input' // curriculum alias for expression-input
  | 'number-line'
  | 'balance-scale'
  | 'envelope-model'
  | 'tape-diagram'
  | 'hanger-diagram'
  | 'area-model'
  | 'opposite-flip'
  | 'worked-equation'
  | 'double-number-line'
  | 'ratio-table'
  | 'choice'
  | 'cube-model'

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
    case 'term-input':
      return createTermInput(config as TermInputConfig) as never
    case 'compare-input':
      return createCompareInput(config as CompareInputConfig) as never
    case 'pair-input':
      return createPairInput(config as PairInputConfig) as never
    case 'expression-input':
    case 'equation-input':
      return createExpressionInput(config as ExpressionInputConfig) as never
    case 'number-line':
      return createNumberLine(config as NumberLineConfig) as never
    case 'balance-scale':
      return createBalanceScale(config as BalanceScaleConfig) as never
    case 'envelope-model':
      return createEnvelopeModel(config as EnvelopeModelConfig) as never
    case 'tape-diagram':
      return createTapeDiagram(config as TapeDiagramConfig) as never
    case 'hanger-diagram':
      return createHangerDiagram(config as HangerDiagramConfig) as never
    case 'area-model':
      return createAreaModel(config as AreaModelConfig) as never
    case 'opposite-flip':
      return createOppositeFlip(config as OppositeFlipConfig) as never
    case 'worked-equation':
      return createWorkedEquation(config as WorkedEquationConfig) as never
    case 'double-number-line':
      return createDoubleNumberLine(config as DoubleNumberLineConfig) as never
    case 'ratio-table':
      return createRatioTable(config as RatioTableConfig) as never
    case 'choice':
      return createChoice(config as ChoiceConfig) as never
    case 'cube-model':
      return createCubeModel() as never
    default:
      throw new UnknownWidgetError(type)
  }
}
