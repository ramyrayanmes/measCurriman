// src/components/CompareView.jsx
import { useState } from 'react'
import SnapshotView from './SnapshotView'
import { diffCurricula, diffWeeklyPlan } from '../versionDiff'

export default function CompareView({ table, oldSnapshot, newSnapshot, oldLabel, newLabel, onClose }) {
  const [showFull, setShowFull] = useState(false)

  const changes = table === 'curricula'
    ? diffCurricula(oldSnapshot, newSnapshot)
    : diffWeeklyPlan(oldSnapshot, newSnapshot)

  return (
    <div className="compare-view panel-with-close">
      <button className="close-x" onClick={onClose} aria-label="Close">×</button>
      <h4>Comparing: {oldLabel} → {newLabel}</h4>

      {changes.length === 0 ? (
        <p className="muted">No differences found.</p>
      ) : (
        <ul className="diff-list">
          {changes.map((c, i) => (
            <li key={i}>
              <strong>{c.label}:</strong>{' '}
              <span className="diff-old">{c.oldVal || '(empty)'}</span>
              {' → '}
              <span className="diff-new">{c.newVal || '(empty)'}</span>
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => setShowFull(s => !s)} className="secondary">
        {showFull ? 'Hide full side-by-side' : 'Show full side-by-side'}
      </button>

      {showFull && (
        <div className="side-by-side">
          <div className="side-by-side-col">
            <h5>{oldLabel}</h5>
            <SnapshotView table={table} snapshot={oldSnapshot} />
          </div>
          <div className="side-by-side-col">
            <h5>{newLabel}</h5>
            <SnapshotView table={table} snapshot={newSnapshot} />
          </div>
        </div>
      )}
    </div>
  )
}
