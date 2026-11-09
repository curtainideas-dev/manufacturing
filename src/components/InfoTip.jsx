import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small (i) that shows its explanation on hover or keyboard focus.
 *
 * Explanations used to sit on the page as paragraphs under every field, which
 * turned setup screens into a wall of text. They live here now: out of the way
 * until someone actually wonders what a field means.
 *
 * The bubble is portalled to <body> and positioned in fixed coordinates,
 * because cards and modals clip their overflow and would cut it off.
 */
export default function InfoTip({ children }) {
  const ref = useRef(null)
  const bubbleRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !ref.current || !bubbleRef.current) return
    const r = ref.current.getBoundingClientRect()
    const b = bubbleRef.current.getBoundingClientRect()
    const margin = 8
    let left = r.left + r.width / 2 - b.width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - b.width - margin))
    // Above by default; below when there isn't room above.
    const top = r.top - b.height - margin >= margin ? r.top - b.height - margin : r.bottom + margin
    setPos({ left, top })
  }, [open])

  if (!children) return null
  const show = () => { setPos(null); setOpen(true) }
  const hide = () => setOpen(false)

  return (
    <span ref={ref} className="info-tip" tabIndex={0} aria-label="More info"
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      onClick={e => e.stopPropagation()}>
      i
      {open && createPortal(
        <span ref={bubbleRef} className="info-tip-body" role="tooltip"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
          {children}
        </span>,
        document.body,
      )}
    </span>
  )
}
