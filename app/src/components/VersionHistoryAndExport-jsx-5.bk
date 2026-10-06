// src/components/VersionHistoryAndExport.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { callEdgeFunctionJson, downloadFromEdgeFunction } from '../edgeFunctions'

export default function VersionHistoryAndExport({ table, recordId, canRestore, canManageVersions, onRestored }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyAction, setBusyAction] = useState(null)
  const [editingVersionId, setEditingVersionId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const versionsView = table === 'curricula' ? 'curriculum_versions_secure' : 'weekly_plan_versions_secure'
  const idColumn = table === 'curricula' ? 'curriculum_id' : 'weekly_plan_id'
  const baseTable = table === 'curricula' ? 'curriculum_versions' : 'weekly_plan_versions'

  async function loadVersions() {
    setLoading(true)
    const { data, error } = await supabase
      .from(versionsView)
      .select('id, version_number, name, notes, created_by_email, created_at')
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

  function startEditing(v) {
    setEditingVersionId(v.id)
    setEditName(v.name ?? '')
    setEditNotes(v.notes ?? '')
  }

  async function saveNaming(versionId) {
    setBusyAction(`name-${versionId}`)
    const { error } = await supabase
      .from(baseTable)
      .update({ name: editName || null, notes: editNotes || null })
      .eq('id', versionId)
    setBusyAction(null)
    if (error) { setError(error.message); return }
    setEditingVersionId(null)
    loadVersions()
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
            <li key={v.id} className="version-list-item">
              {editingVersionId === v.id ? (
                <div className="version-edit-form">
                  <input
                    placeholder="Version name (visible to everyone)"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                  <textarea
                    rows={2}
                    placeholder="Private notes (admins/heads only)"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                  />
                  <div className="form-actions">
                    <button onClick={() => saveNaming(v.id)} disabled={busyAction === `name-${v.id}`}>
                      {busyAction === `name-${v.id}` ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingVersionId(null)} className="secondary">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="version-row">
                  <div>
                    <strong>v{v.version_number}</strong>
                    {v.name && <span className="version-name"> — {v.name}</span>}
                    <div className="muted version-meta">
                      {v.created_by_email ?? 'unknown'} • {new Date(v.created_at).toLocaleString()}
                    </div>
                    {v.notes && <div className="version-notes">Notes: {v.notes}</div>}
                  </div>
                  <div className="version-row-actions">
                    {canManageVersions && (
                      <button onClick={() => startEditing(v)} className="secondary">Name / Notes</button>
                    )}
                    {canRestore && (
                      <button onClick={() => handleRestore(v.version_number)} disabled={busyAction === `restore-${v.version_number}`} className="secondary">
                        {busyAction === `restore-${v.version_number}` ? 'Restoring…' : 'Restore'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
          {versions.length === 0 && <li className="muted">No versions visible to you yet.</li>}
        </ul>
      )}
    </div>
  )
}
