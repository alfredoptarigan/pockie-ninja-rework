// Decorative Memphis shapes. All are aria-hidden and positioned by the caller via className.
const ink = 'var(--color-ink)'

interface ShapeProps {
  className?: string
  color?: string
}

export function Circle({ className = '', color = 'var(--color-coral)' }: ShapeProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      <circle cx="50" cy="50" r="46" fill={color} stroke={ink} strokeWidth="4" />
    </svg>
  )
}

export function Triangle({ className = '', color = 'var(--color-teal)' }: ShapeProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 90" className={className}>
      <path d="M50 5 95 85H5Z" fill={color} stroke={ink} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  )
}

export function HalfCircle({ className = '', color = 'var(--color-blue)' }: ShapeProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 54" className={className}>
      <path d="M4 50a46 46 0 0 1 92 0Z" fill={color} stroke={ink} strokeWidth="4" />
    </svg>
  )
}

export function Squiggle({ className = '', color = 'var(--color-mustard)' }: ShapeProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 40" className={className} fill="none">
      <path
        d="M6 20c12-16 24-16 36 0s24 16 36 0 24-16 36 0 24 16 36 0"
        stroke={ink}
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M6 20c12-16 24-16 36 0s24 16 36 0 24-16 36 0 24 16 36 0"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Zigzag({ className = '', color = 'var(--color-pink)' }: ShapeProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 40" className={className} fill="none">
      <path
        d="M4 32 24 8l20 24 20-24 20 24 20-24 12 14"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Plus({ className = '', color = 'var(--color-blue)' }: ShapeProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className={className}>
      <path
        d="M15 3h10v12h12v10H25v12H15V25H3V15h12Z"
        fill={color}
        stroke={ink}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DotGrid({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`bg-dots ${className}`} />
}
