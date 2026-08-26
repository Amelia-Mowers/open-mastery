/** Canonical demo timelines for every representation — the widget zoo
 * (?view=zoo) plays them all for testing/debugging. Keep one demo per
 * representation, using its canonical param family. */
import { explanationSchema, type Explanation } from '@openmastery/schema'
import type { Params } from './render'

export interface ZooDemo {
  title: string
  widget: string
  params: Params
  explanation: Explanation
}

const exp = (
  id: string,
  widget: string,
  timeline: unknown[],
): Explanation =>
  explanationSchema.parse({
    id: `zoo.demo.${id}`,
    skill: 'zoo.demo',
    representation: widget,
    widget,
    params_from: 'item',
    timeline,
    review: { status: 'vetted' },
  })

export const ZOO_DEMOS: ZooDemo[] = [
  {
    title: 'balance-scale — ax = b',
    widget: 'balance-scale',
    params: { a: 4, b: 28, variable: 'x' },
    explanation: exp('balance', 'balance-scale', [
      { t: 0, patch: { left: '{a}{variable}', right: '{b}' }, caption: 'The scale is balanced: {a}{variable} equals {b}.' },
      { t: 3, patch: { highlight: 'left.coef' }, caption: '{variable} is multiplied by {a}.' },
      { t: 6, patch: { op: 'divide', by: '{a}' }, caption: 'Divide both sides by {a}.' },
      { t: 9, patch: { left: '{variable}', right: '{b/a}', op: null, highlight: null }, caption: '{variable} = {b/a}.' },
      { t: 11, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'envelope-model — share b counters into a envelopes',
    widget: 'envelope-model',
    params: { a: 4, b: 28, variable: 'x' },
    explanation: exp('envelopes', 'envelope-model', [
      { t: 0, patch: { envelopes: '{a}', counters: '{b}' }, caption: '{a} envelopes hold the same total as {b} counters.' },
      { t: 4, patch: { partition: true }, caption: 'Share the {b} counters into {a} equal groups.' },
      { t: 8, patch: { reveal: true }, caption: 'Each envelope holds {b/a}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'tape-diagram — x/a = b (total unknown)',
    widget: 'tape-diagram',
    params: { a: 7, b: 6, variable: 'n' },
    explanation: exp('tape', 'tape-diagram', [
      { t: 0, patch: { parts: '{a}', partLabel: '?', total: '{variable}' }, caption: '{variable} as {a} equal parts.' },
      { t: 4, patch: { partLabel: '{b}', highlight: ['1'] }, caption: 'One part is {b}.' },
      { t: 8, patch: { total: '{variable} = {a*b}', highlight: [] }, caption: '{a} parts of {b}: {variable} = {a*b}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'hanger-diagram — the coefficient as countable shapes',
    widget: 'hanger-diagram',
    params: { a: 4, b: 28, variable: 'x' },
    explanation: exp('hanger', 'hanger-diagram', [
      { t: 0, patch: { copies: '{a}', shapeLabel: '{variable}', weight: '{b}' }, caption: '{a} copies of {variable} balance {b}.' },
      { t: 4, patch: { split: true, share: '{b/a}' }, caption: 'Share {b} into {a} equal pieces.' },
      { t: 8, patch: { reveal: true }, caption: 'Each {variable} balances {b/a}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'area-model — the distributive property by area',
    widget: 'area-model',
    params: { a: 3, b: 2, variable: 'x' },
    explanation: exp('area', 'area-model', [
      { t: 0, patch: { height: '{a}', parts: ['{variable}', '{b}'] }, caption: '{a}({variable} + {b}) as a rectangle.' },
      { t: 4, patch: { highlight: ['1'] }, caption: 'The first piece is {a} by {variable}.' },
      { t: 8, patch: { products: ['{a}{variable}', '{a*b}'], highlight: [] }, caption: '{a}({variable} + {b}) = {a}{variable} + {a*b}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'opposite-flip — -x = b flips across zero',
    widget: 'opposite-flip',
    params: { b: 2, variable: 'r' },
    explanation: exp('flip', 'opposite-flip', [
      { t: 0, patch: { value: '{b}' }, caption: 'The OPPOSITE of {variable} sits at {b}.' },
      { t: 4, patch: { flip: true }, caption: 'Opposites are mirror twins across 0.' },
      { t: 8, patch: { resolve: true }, caption: '{variable} = {-b}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'worked-equation — whiteboard steps with movement',
    widget: 'worked-equation',
    params: { a: 4, b: 28, variable: 'x' },
    explanation: exp('worked', 'worked-equation', [
      { t: 0, patch: { start: '{a}{variable} = {b}' }, caption: 'On the board.' },
      { t: 3.5, patch: { line: '{a}{variable} ÷ {a} = {b} ÷ {a}', note: 'divide both sides by {a}' }, caption: 'Divide both sides.' },
      { t: 7.5, patch: { line: '{variable} = {b/a}', note: '{a} ÷ {a} = 1' }, caption: '{variable} = {b/a}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
  {
    title: 'number-line (lesson) — jumps landing on b',
    widget: 'number-line',
    params: { a: 4, b: 28, variable: 'x' },
    explanation: exp('numberline', 'number-line', [
      { t: 0, patch: { min: 0, max: '{b}', step: '{b/a}' }, caption: '{a} equal jumps land on {b}.' },
      { t: 4, patch: { highlight: ['{b/a}'], marker: '{b/a}' }, caption: 'One jump is {b/a}.' },
      { t: 8, patch: { marker: '{b}' }, caption: 'So {variable} = {b/a}.' },
      { t: 10, handoff: { prompt: 'Replay' } },
    ]),
  },
]
