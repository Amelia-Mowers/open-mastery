/** Wraps changing content so height changes glide instead of snapping: the
 * outer div pixel-locks to the inner content's height (via ResizeObserver)
 * and transitions between values. Falls back to a plain passthrough where
 * ResizeObserver is unavailable (jsdom, ancient browsers). */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function SmoothHeight({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
  }, [])

  return (
    <div ref={outerRef} className="smooth-height">
      <div ref={innerRef} className={dim ? 'smooth-inner dim' : 'smooth-inner'} aria-hidden={dim || undefined}>
        {children}
      </div>
    </div>
  )
}
