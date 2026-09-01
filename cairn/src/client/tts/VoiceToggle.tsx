/** The voice switch — lives in the app header so it is one control,
 * everywhere. The model autoloads in the background, so the usual press
 * is instant; while it is still downloading the button says so; errors
 * show on the button — a silent mute is not an option. */
import { useSyncExternalStore } from 'react'
import { speech, VOICE_FEATURE } from './speech'

export function VoiceToggle() {
  if (!VOICE_FEATURE) return null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useSyncExternalStore(speech.subscribe, speech.getState, speech.getState)
  const label =
    state.model === 'error'
      ? '⚠ voice'
      : state.enabled
        ? state.model === 'loading'
          ? `🔉 ${state.pct}%…`
          : state.speaking
            ? '🔊 voice on'
            : '🔉 voice on'
        : '🔇 voice off'
  const title =
    state.model === 'error'
      ? `The voice could not start: ${state.message ?? 'unknown error'}`
      : state.enabled
        ? state.model === 'loading'
          ? 'Voice is on — finishing the one-time download'
          : 'Reading the lesson aloud — click to turn off'
        : 'Read lessons aloud (on-device; nothing leaves this computer)'
  return (
    <button
      className="btn btn-quiet voice-toggle"
      aria-pressed={state.enabled}
      title={title}
      onClick={() => {
        if (state.enabled) speech.disable()
        else speech.enable()
      }}
    >
      {label}
    </button>
  )
}


/** A quiet spinner + estimated bar under the caption while its audio is
 * being made — visible only when the voice is on and synthesis is
 * mid-flight. The bar is an estimate from measured synthesis speed. */
export function VoiceGenSpinner() {
  if (!VOICE_FEATURE) return null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useSyncExternalStore(speech.subscribe, speech.getState, speech.getState)
  if (!state.enabled || !state.generating) return null
  return (
    <span className="voice-gen" role="status" aria-label="Preparing the voice">
      <i aria-hidden />
      <span className="voice-gen-bar" aria-hidden>
        <span style={{ width: `${state.genPct}%` }} />
      </span>
    </span>
  )
}
