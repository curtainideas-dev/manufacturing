/**
 * The stages a job moves through, in order.
 *
 *   Received       the PO is in; windows are being entered
 *   To check       entered, waiting for a second person to check every window
 *   Ready to make  checked; prices frozen; not started
 *   In production  being made
 *   Made           finished, waiting for the customer to collect
 *   Picked up      gone
 *
 * The ids are what's stored in mfg_jobs.status. Two keep their older names so
 * existing rows didn't need rewriting: 'in_progress' is In production and
 * 'completed' is Picked up.
 *
 * Windows can be edited while a job is Received or To check. From Ready to
 * make on, the job's prices and quantities are frozen (see computeJobLock).
 */
export const STAGES = [
  { id: 'received',    label: 'Received',      emoji: '📥', pill: 'pill-orange' },
  { id: 'to_check',    label: 'To check',      emoji: '🔍', pill: 'pill-orange' },
  { id: 'ready',       label: 'Ready to make', emoji: '📋', pill: 'pill-green' },
  { id: 'in_progress', label: 'In production', emoji: '🔧', pill: 'pill-green' },
  { id: 'made',        label: 'Made',          emoji: '📦', pill: 'pill-green' },
  { id: 'completed',   label: 'Picked up',     emoji: '✅', pill: 'pill-green' },
]

export const stageOf    = (status) => STAGES.find(s => s.id === status) || STAGES[0]
export const stageIndex = (status) => Math.max(0, STAGES.findIndex(s => s.id === status))

/** Windows, options and swaps can still change. */
export const isEditableStage = (status) => status === 'received' || status === 'to_check'

/** Prices and quantities are frozen from Ready to make on. */
export const isFrozenStage = (status) => !isEditableStage(status)

/** Stock is taken off the shelf while the job is being made. */
export const isProductionStage = (status) => status === 'in_progress' || status === 'made'

/**
 * The one step forward and the one step back from each stage, with the words
 * on the button. Moving more than one stage means pressing more than once,
 * which keeps every move something the screen can explain.
 */
export const MOVES = {
  received:    { next: { to: 'to_check',    label: 'Send to check' } },
  to_check:    { next: { to: 'ready',       label: 'Checked — ready to make' },
                 back: { to: 'received',    label: 'Back to received' } },
  ready:       { next: { to: 'in_progress', label: 'Start production' },
                 back: { to: 'to_check',    label: 'Back to check' } },
  in_progress: { next: { to: 'made',        label: 'Mark made' },
                 back: { to: 'ready',       label: 'Back to ready to make' } },
  made:        { next: { to: 'completed',   label: 'Picked up' },
                 back: { to: 'in_progress', label: 'Back to in production' } },
  completed:   { back: { to: 'made',        label: 'Back to made' } },
}
