const Icon = ({ d, size = 20, ...props }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    {...props}
  >
    {typeof d === 'string' ? <path d={d} /> : d}
  </svg>
)

export const PlusIcon = (p) => (
  <Icon {...p} d={<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>} />
)
export const ChevronRightIcon = (p) => <Icon {...p} d="M9 18l6-6-6-6" />
export const ChevronLeftIcon = (p) => <Icon {...p} d="M15 18l-6-6 6-6" />
export const XIcon = (p) => (
  <Icon {...p} d={<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>} />
)
export const CheckIcon = (p) => <Icon {...p} d="M20 6L9 17l-5-5" />
export const TrashIcon = (p) => (
  <Icon {...p} d={<><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></>} />
)
export const InfoIcon = (p) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>} />
)
