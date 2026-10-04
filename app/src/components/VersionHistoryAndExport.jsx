// src/components/VersionHistoryAndExport.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { callEdgeFunctionJson, downloadFromEdgeFunction } from '../edgeFunctions'

export default function VersionHistoryAndExport({ table, recordId, canRestore, onRestored }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Tracks which specific action is in flight, e.g. 'docx', 'pdf', or 'restore-3' — not a shared flag.
  const [busyAction, setBusyAction] = useState(null)

  const versionsTable = table === 'curricula' ? 'curriculum_versions' : 'weekly_plan_versions'
  const idColumn = table === 'curricula' ? 'curriculum_id' : 'weekly_plan_id'

  async function loadVersions() {
    setLoading(true)
    const { data, error } = await supabase
      .from(versionsTable)
      .select('version_number, created_at, created_by')
      .eq(idColumn, recordId)
      .order('version_number', { ascending: false })
    if (error) setError(error.message)
    else setVersions(data)
    setLoading(false)
  }

  useEffect(() => { loadVersions() }, [recordId])

  async function handleRestore(versionNumber) {
    if (!confirm(`Restore to version ${versionNumber}? This creates a new version from it — nothing is deleted.`)) return
    setBusyAction(`restore-${versionNumber}`)
    setError(null)
    try {
      await callEdgeFunctionJson('restore-version', { table, record_id: recordId, version_number: versionNumber })
      await loadVersions()
      onRestored?.()
    } catch (err) {
      setError(err.message)
    }
    setBusyAction(null)
  }

  async function handleExport(format) {
    setBusyAction(format)
    setError(null)
    try {
      await downloadFromEdgeFunction('export-document', { table, record_id: recordId, format }, `export.${format}`)
    } catch (err) {
      setError(err.message)
    }
    setBusyAction(null)
  }

  return (
    <div className="version-panel">
      <div className="export-buttons">
        <button onClick={() => handleExport('docx')} disabled={busyAction === 'docx'}>
          {busyAction === 'docx' ? 'Preparing…' : 'Download Word'}
        </button>
        <button onClick={() => handleExport('pdf')} disabled={busyAction === 'pdf'}>
          {busyAction === 'pdf' ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      <h4>Version History</h4>
      {error && <p className="error">{error}</p>}
      {loading ? <p>Loading…</p> : (
        <ul className="version-list">
          {versions.map(v => (
            <li key={v.version_number}>
              <span>v{v.version_number} — {new Date(v.created_at).toLocaleString()}</span>
              {canRestore && (
                <button
                  onClick={() => handleRestore(v.version_number)}
                  disabled={busyAction === `restore-${v.version_number}`}
                  className="secondary"
                >
                  {busyAction === `restore-${v.version_number}` ? 'Restoring…' : 'Restore'}
                </button>
              )}
            </li>
          ))}
          {versions.length === 0 && <li className="muted">No versions yet.</li>}
        </ul>
      )}
    </div>
  )
}
