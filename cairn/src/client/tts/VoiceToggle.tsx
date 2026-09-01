/** The voice switch — lives in the app header so it is one control,
 * everywhere. The model autoloads in the background, so the usual press
 * is instant; while it is still downloading the button says so; errors
 * show on the button — a silent mute is not an option. */
import { useSyncExternalStore } from 'react'
import { speech } from './speech'

export function VoiceToggle() {
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
