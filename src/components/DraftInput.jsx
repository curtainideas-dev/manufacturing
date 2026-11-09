import { useState, useRef } from 'react'

/**
 * An input that saves when you leave it, not on every keystroke.
 *
 * Typing is held locally and handed to `onCommit` on blur or Enter — once,
 * and only if it changed. Escape puts the saved value back without saving.
 * When the saved value changes from outside (another screen, a reload) while
 * the field isn't being edited, the field follows it.
 *
 * `parse` turns the typed text into what gets saved (e.g. a number, or null
 * for blank). Everything else is passed straight to the <input>.
 */
export default function DraftInput({ value, onCommit, parse = v => v, ...props }) {
  const shown = String(value ?? '')
  const [draft, setDraft] = useState(null)   // null = not editing
  // Escape blurs the field, and blur commits. The blur handler runs before
  // React has applied setDraft(null), so it would still see the typed text —
  // this flag is how Escape tells it not to save.
  const cancelled = useRef(false)

  const commit = () => {
    const typed = draft
    setDraft(null)
    if (cancelled.current) { cancelled.current = false; return }
    if (typed !== null && typed !== shown) onCommit(parse(typed))
  }

  return (
    <input
      {...props}
      value={draft ?? shown}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => { commit(); props.onBlur?.(e) }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
        props.onKeyDown?.(e)
      }}
    />
  )
}
