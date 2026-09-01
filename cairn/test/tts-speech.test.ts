import { describe, it, expect } from 'vitest'
import { mathToSpeech } from '../src/client/tts/speech'

describe('mathToSpeech', () => {
  it('says the board glyphs', () => {
    expect(mathToSpeech('3x + 5 = 17')).toBe('3x + 5 equals 17')
    expect(mathToSpeech('7x − 2x = 5x')).toBe('7x minus 2x equals 5x')
    expect(mathToSpeech('3·4 : 8·4')).toBe('3 times 4 : 8 times 4')
    expect(mathToSpeech('$28 ÷ 4')).toBe('28 dollars divided by 4')
    expect(mathToSpeech('20% of ? = 24')).toBe('20 percent of ? equals 24')
    expect(mathToSpeech('25% = 1/4')).toBe('25 percent equals 1 over 4')
    expect(mathToSpeech('6²')).toBe('6 squared')
    expect(mathToSpeech('4³')).toBe('4 cubed')
    expect(mathToSpeech('3 pounds → $12')).toBe('3 pounds gives 12 dollars')
  })
  it('keeps prose intact', () => {
    expect(mathToSpeech('So what is the WHOLE?')).toBe('So what is the WHOLE?')
  })
})
