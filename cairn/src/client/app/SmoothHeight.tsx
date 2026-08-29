/** Wraps changing content so height changes glide instead of snapping: the
 * outer div pixel-locks to the inner content's height (via ResizeObserver)
 * and transitions between values. Falls back to a plain passthrough where
 * ResizeObserver is unavailable (jsdom, ancient browsers).
 *
 * NESTING: only the OUTERMOST instance animates. A scaffolded practice
 * serve puts ItemCard's wrapper straight around StepwisePlayer's, and two
 * animators over the same content run in sequence — the inner glides for
 * 350ms, the outer notices the change and glides again — which reads as
 * the box expanding twice on load. Inner instances pass through and let
 * the ancestor carry one continuous motion.
 */
import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

const InsideSmoothHeight = createContext(false)

export function SmoothHeight({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const nested = useContext(InsideSmoothHeight)

  useEffect(() => {
    if (nested) return
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return
    let first = true
    const ro = new ResizeObserver(() => {
      const h = inner.offsetHeight
      if (first) {
        // lock without animating on the first measurement
        first = false
        outer.style.transition = 'none'
        outer.style.height = `${h}px`
        void outer.offsetHeight // reflow so the next change transitions
        outer.style.transition = ''
        return
      }
      outer.style.height = `${h}px`
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [nested])

  // a nested instance still needs its dim treatment, but must not lock a
  // height of its own — that is what produced the second expansion
  if (nested) {
    return (
      <div className={dim ? 'smooth-inner dim' : 'smooth-inner'} aria-hidden={dim || undefined}>
        {children}
      </div>
    )
  }

  return (
    <InsideSmoothHeight.Provider value={true}>
      <div ref={outerRef} className="smooth-height">
        <div
          ref={innerRef}
          className={dim ? 'smooth-inner dim' : 'smooth-inner'}
          aria-hidden={dim || undefined}
        >
          {children}
        </div>
      </div>
    </InsideSmoothHeight.Provider>
  )
}
