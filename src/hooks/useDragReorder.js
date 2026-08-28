import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drag-to-reorder for a vertical list, on pointer events so it works the same
 * under a mouse and a finger. Built here rather than pulled in as a library
 * because the list it serves is one card of plain divs.
 *
 * The dragged row lifts and follows the pointer; a line marks where it will
 * land. Nothing else moves — with rows of differing heights, shuffling
 * neighbours around mid-drag reads as jitter, and the line says the same
 * thing without the noise.
 *
 * Positions are measured once, at drag start, in the SCROLL CONTAINER's own
 * coordinates rather than the viewport's, so an auto-scroll part-way through
 * a drag doesn't invalidate them.
 *
 * Usage:
 *   const { listRef, drag, startDrag } = useDragReorder(handleReorder)
 *   <div ref={listRef}>
 *     {items.map((it, i) =>
 *       <div key={it.id} data-reorder-item>
 *         <div onPointerDown={e => startDrag(i, e)}>⠿</div>
 *       </div>)}
 *   </div>
 *
 * `onReorder(from, to)` fires once, on release, and only when the position
 * actually changed.
 */
export function useDragReorder(onReorder, enabled = true) {
  const listRef = useRef(null)
  // { index, over, dy } while a drag is live, null otherwise. Mirrored into a
  // ref so the pointer handlers — bound once — always read current values.
  const [drag, setDrag] = useState(null)
  const ref = useRef(null)

  const finish = useCallback((commit) => {
    const d = ref.current
    ref.current = null
    setDrag(null)
    if (d?.raf) cancelAnimationFrame(d.raf)
    if (commit && d && d.over !== d.index) onReorder(d.index, d.over)
  }, [onReorder])

  const startDrag = useCallback((index, e) => {
    if (!enabled || e.button > 0) return
    // The row underneath is a link into the window; the grip is not.
    e.preventDefault()
    e.stopPropagation()

    const list = listRef.current
    if (!list) return
    const items = [...list.querySelectorAll('[data-reorder-item]')]
    if (items.length < 2) return

    const scroller = list.closest('.scroll-area') || document.scrollingElement
    const base     = scroller.getBoundingClientRect().top - scroller.scrollTop

    // Centres and heights in scroller-content coordinates — stable across
    // any scrolling that happens while the drag is running.
    const rects = items.map(el => {
      const r = el.getBoundingClientRect()
      return { top: r.top - base, height: r.height, centre: r.top - base + r.height / 2 }
    })
    const first = rects[0].top
    const last  = rects[rects.length - 1].top + rects[rects.length - 1].height

    // Where on the row it was picked up, so the row tracks the pointer from
    // that same spot rather than jumping its centre under the cursor.
    const grabOffset = (e.clientY - base + scroller.scrollTop) - rects[index].centre

    ref.current = {
      index, over: index, dy: 0, rects, scroller, base, first, last, grabOffset,
      pointerY: e.clientY, raf: null,
    }
    setDrag({ index, over: index, dy: 0 })
    // Keeps a finger that strays off the grip still feeding this drag.
    // Throws if the pointer is already gone, which is not worth failing over.
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* no capture */ }
  }, [enabled])

  // Bound once for the life of the component; they no-op unless a drag is live.
  useEffect(() => {
    const move = (e) => {
      const d = ref.current
      if (!d) return
      e.preventDefault()
      d.pointerY = e.clientY
      apply()
      autoScroll()
    }

    // Where the dragged row sits now, and which slot that puts it in.
    const apply = () => {
      const d = ref.current
      if (!d) return
      const { rects, index, scroller, base } = d
      // Where the row's centre wants to be, following the pointer.
      const centre = (d.pointerY - base + scroller.scrollTop) - d.grabOffset

      // Slot detection runs UNCLAMPED. Clamping first would stop a row taller
      // than its neighbour from ever getting its centre above the top row's,
      // making the first and last slots unreachable for the tallest rows.
      let over = index
      rects.forEach((r, i) => {
        if (i === index) return
        if (i < index && centre < r.centre) over = Math.min(over, i)
        if (i > index && centre > r.centre) over = Math.max(over, i)
      })

      // The lift itself is clamped, so the row never leaves the list.
      const shown = Math.max(
        d.first + rects[index].height / 2,
        Math.min(d.last - rects[index].height / 2, centre))
      const dy = shown - rects[index].centre
      if (dy !== d.dy || over !== d.over) {
        d.dy = dy; d.over = over
        setDrag({ index, over, dy })
      }
    }

    // Long lists don't fit on screen, so a drag has to be able to pull the
    // list along with it.
    const autoScroll = () => {
      const d = ref.current
      if (!d || d.raf) return
      const step = () => {
        const cur = ref.current
        if (!cur) return
        cur.raf = null
        const box  = cur.scroller.getBoundingClientRect()
        const zone = 64
        let delta = 0
        if (cur.pointerY < box.top + zone)         delta = -Math.ceil((box.top + zone - cur.pointerY) / 4)
        else if (cur.pointerY > box.bottom - zone) delta =  Math.ceil((cur.pointerY - (box.bottom - zone)) / 4)
        if (delta !== 0) {
          const before = cur.scroller.scrollTop
          cur.scroller.scrollTop += delta
          if (cur.scroller.scrollTop !== before) {
            apply()
            cur.raf = requestAnimationFrame(step)
          }
        }
      }
      d.raf = requestAnimationFrame(step)
    }

    const up     = () => finish(true)
    const cancel = () => finish(false)
    const key    = (e) => { if (e.key === 'Escape') finish(false) }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      if (ref.current?.raf) cancelAnimationFrame(ref.current.raf)
    }
  }, [finish])

  return { listRef, drag, startDrag }
}
