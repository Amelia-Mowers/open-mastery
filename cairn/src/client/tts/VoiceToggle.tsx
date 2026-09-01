/** The voice switch — lives in the app header so it is one control,
 * everywhere. Audio is pre-rendered, so the press is instant; errors
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
        ? state.speaking
          ? '🔊 voice on'
          : '🔉 voice on'
        : '🔇 voice off'
  const title =
    state.model === 'error'
      ? `The voice could not play: ${state.message ?? 'unknown error'}`
      : state.enabled
        ? 'Reading the lesson aloud — click to turn off'
        : 'Read lessons aloud'
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


/** A quiet spinner under the caption while its audio is still on the
 * wire — visible only when the voice is on and the sound has not
 * started. Usually gone before it is seen; it matters on slow links. */
export function VoiceGenSpinner() {
  if (!VOICE_FEATURE) return null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useSyncExternalStore(speech.subscribe, speech.getState, speech.getState)
  if (!state.enabled || !state.generating) return null
  return (
    <span className="voice-gen" role="status" aria-label="Fetching the voice">
      <i aria-hidden />
    </span>
  )
}
