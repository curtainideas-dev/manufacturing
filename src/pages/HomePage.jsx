import { ChevronRightIcon } from '../components/Icons'

/**
 * The front door.
 *
 * Four ways in, because there are four jobs to do here and they belong to
 * different people. Submitting and tracking a PO is Sandi's day; Manufacturing
 * is the factory's; Admin is setup nobody touches weekly. Landing all of them
 * on the same seven-tab screen meant everyone navigating past the six tabs
 * that were not theirs.
 *
 * Deliberately not behind the app's data load — this page needs nothing from
 * Supabase, so it paints instantly and the wait happens after the choice, not
 * before it.
 */

const TILES = [
  {
    href:  '/submit',
    emoji: '📥',
    title: 'Submit a PO',
    desc:  'Send a purchase order in. Attach the PDF, fill in the details, and the job is created.',
    tone:  'var(--accent-bg)',
  },
  {
    href:  '/track',
    emoji: '🔎',
    title: 'Track a PO',
    desc:  'Where every order is up to — received, in progress or completed — and anything held up waiting on stock.',
    tone:  'var(--blue-bg)',
  },
  {
    href:  '/manufacturing',
    emoji: '🏭',
    title: 'Manufacturing',
    desc:  'Jobs, components, products, stock and supplier orders. The day-to-day workshop screens.',
    tone:  'var(--warning-bg)',
  },
  {
    href:  '/admin',
    emoji: '🛠️',
    title: 'Admin',
    desc:  'Options, component kinds, fabric categories, and anything deleted by mistake.',
    tone:  'var(--warm-100)',
  },
]

export default function HomePage() {
  return (
    <div className="app" style={{ minHeight: '100dvh' }}>
      <div className="header">
        <img src="/favicon.png" alt="" width={28} height={28} style={{ borderRadius: 6 }} />
        <div className="header-title">Curtain Ideas</div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: 16, maxWidth: 560, margin: '0 auto', width: '100%' }}>
          <p style={{ color: 'var(--warm-300)', fontSize: 14, margin: '4px 4px 16px' }}>
            What would you like to do?
          </p>

          <div style={{ display: 'grid', gap: 12 }}>
            {TILES.map(t => (
              <a key={t.href} href={t.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card" style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '18px 16px', cursor: 'pointer',
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: t.tone, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 26,
                  }}>
                    {t.emoji}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 3 }}>{t.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--warm-300)', lineHeight: 1.45 }}>
                      {t.desc}
                    </div>
                  </div>
                  <ChevronRightIcon size={18} color="var(--warm-200)" style={{ flexShrink: 0 }} />
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
