/**
 * The heading over a group of components — an emoji, a name, and how many.
 *
 * Shared between the library and the stock page so a shelf reads the same in
 * both: the person who looks up what a part IS and the person counting them
 * are usually the same person ten seconds apart, and two layouts for one set
 * of shelves is a tax on both.
 */
export default function SectionHeader({ emoji, title, count, tint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0 8px' }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: tint || 'var(--warm-300)',
      }}>{title}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: 'var(--warm-300)',
        background: 'var(--warm-100)', borderRadius: 99, padding: '1px 8px',
      }}>{count}</span>
    </div>
  )
}

/**
 * The rule that separates the parts nobody has tagged yet from the ones that
 * are grouped above it.
 *
 * A divider rather than another heading, because "no kind yet" is not a kind —
 * it is the bottom of the list, and the nudge to name what those parts are.
 */
export function UntaggedDivider({ count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '22px 0 2px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--warm-200)' }} />
      <span style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.09em', color: 'var(--warm-300)',
      }}>
        no kind yet · {count}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--warm-200)' }} />
    </div>
  )
}