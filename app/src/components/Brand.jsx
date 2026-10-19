// src/components/Brand.jsx
import { APP_VERSION } from '../version'

// The CurriMan wordmark: "Curri" in blue, "Man" in dark ink (or white on a
// dark background), with a small version tag.
export default function Brand({ onDark = false, showVersion = true }) {
  return (
    <span className={`brand${onDark ? ' brand-on-dark' : ''}`}>
      <span className="brand-curri">Curri</span>
      <span className="brand-man">Man</span>
      {showVersion && <span className="brand-ver">v{APP_VERSION}</span>}
    </span>
  )
}
