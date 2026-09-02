import { describe, it, expect } from 'vitest'
import { mathToSpeech } from '../src/client/tts/speech'

describe('mathToSpeech', () => {
  it('says the board glyphs', () => {
    expect(mathToSpeech('3x + 5 = 17')).toBe('3x + 5 equals 17')
    expect(mathToSpeech('7x − 2x = 5x')).toBe('7x minus 2x equals 5x')
    expect(mathToSpeech('3·4 : 8·4')).toBe('3 times 4 : 8 times 4')
    expect(mathToSpeech('$28 ÷ 4')).toBe('28 dollars divided by 4')
    expect(mathToSpeech('20% of ? = 24')).toBe('20 percent of what equals 24')
    expect(mathToSpeech('25% = 1/4')).toBe('25 percent equals 1 over 4')
    expect(mathToSpeech('6²')).toBe('6 squared')
    expect(mathToSpeech('4³')).toBe('4 cubed')
    expect(mathToSpeech('3 pounds → $12')).toBe('3 pounds gives 12 dollars')
  })
  it('keeps prose intact', () => {
    expect(mathToSpeech('So what is the WHOLE?')).toBe('So what is the WHOLE?')
  })
  it('speaks unknown ? marks but keeps question intonation', () => {
    expect(mathToSpeech('4³ = ?')).toBe('4 cubed equals what')
    expect(mathToSpeech('3 pounds → ?')).toBe('3 pounds gives what')
    expect(mathToSpeech("one pound's cost — the $? we are after.")).toBe(
      "one pound's cost — the unknown price we are after.",
    )
    // sentence-ending question marks stay — after words, parens, quotes
    expect(mathToSpeech('What always matches 3(x + 2)?')).toBe('What always matches 3(x + 2)?')
    expect(mathToSpeech('says "the opposite of"?')).toBe('says "the opposite of"?')
  })
})
