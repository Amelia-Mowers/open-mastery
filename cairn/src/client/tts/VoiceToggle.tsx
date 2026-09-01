/** The voice control — a mute button + volume slider that sits in the
 * player control rows (lesson and stepwise), beside the speed control.
 * The voice is ON by default; errors show on the button — a silent mute
 * is not an option. */
import { useSyncExternalStore } from 'react'
import { speech, VOICE_FEATURE } from './speech'

/** speaker glyph drawn in currentColor so it takes the button's ink */
function SpeakerIcon({ muted, level }: { muted: boolean; level: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
      <path
        d="M2 6 H5 L8.6 3.2 V12.8 L5 10 H2 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M10.6 6 L14.2 10 M14.2 6 L10.6 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <>
          <path d="M10.8 6.1 A2.6 2.6 0 0 1 10.8 9.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          {level > 0.55 && (
            <path d="M12.6 4.4 A5 5 0 0 1 12.6 11.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  )
}

export function VoiceControl() {
  if (!VOICE_FEATURE) return null
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const state = useSyncExternalStore(speech.subscribe, speech.getState, speech.getState)
  const err = state.model === 'error'
  const title = err
    ? `The voice could not play: ${state.message ?? 'unknown error'} — click the speaker to retry`
    : state.enabled
      ? 'Reading the lesson aloud — click the speaker to mute'
      : 'Voice muted — click the speaker to hear lessons read aloud'
  return (
    <div className={'voice-ctl' + (state.enabled ? '' : ' voice-ctl-off') + (err ? ' voice-ctl-err' : '')} title={title}>
      <button
        type="button"
        className="btn btn-quiet voice-mute"
        aria-pressed={!state.enabled}
        aria-label={state.enabled ? 'Mute the voice' : 'Unmute the voice'}
        onClick={() => {
          if (state.enabled && !err) speech.disable()
          else speech.enable()
        }}
      >
        <SpeakerIcon muted={!state.enabled} level={state.volume} />
      </button>
      <input
        type="range"
        className="voice-vol"
        min={0}
        max={100}
        value={Math.round(state.volume * 100)}
        aria-label="Voice volume"
        onChange={(e) => {
          speech.setVolume(Number(e.currentTarget.value) / 100)
          if (!state.enabled) speech.enable() // reaching for volume means they want sound
        }}
      />
    </div>
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
