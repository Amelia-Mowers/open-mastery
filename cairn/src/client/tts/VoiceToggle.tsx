/** The voice switch that lives in the player chrome. Opt-in: the first
 * press downloads the on-device model (progress shown on the button);
 * errors show on the button too — a silent mute is not an option. */
import { useEffect, useSyncExternalStore } from 'react'
import { speech } from './speech'

export function VoiceToggle() {
  const state = useSyncExternalStore(speech.subscribe, speech.getState, speech.getState)
  // a student who turned the voice on gets it back next visit (the model
  // is already in the browser cache, so this is a fast warm load)
  useEffect(() => {
    if (state.kind === 'off' && speech.prefOn()) void speech.enable().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const label =
    state.kind === 'off'
      ? '🔇 voice'
      : state.kind === 'loading'
        ? `voice ${state.pct}%…`
        : state.kind === 'error'
          ? 'voice failed'
          : state.speaking
            ? '🔊 voice'
            : '🔉 voice'
  return (
    <button
      className="btn btn-quiet voice-toggle"
      aria-pressed={state.kind === 'ready'}
      title={
        state.kind === 'error'
          ? `The voice could not start: ${state.message}`
          : state.kind === 'loading'
            ? 'Downloading the voice — happens once, stays on this device'
            : 'Read the lesson aloud (downloads a voice to this device the first time)'
      }
      onClick={() => {
        if (state.kind === 'ready') speech.disable()
        else void speech.enable().catch(() => undefined)
      }}
    >
      {label}
    </button>
  )
}
