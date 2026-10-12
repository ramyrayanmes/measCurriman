// src/components/BulkUserUpload.jsx
import { useState } from 'react'
import Papa from 'papaparse'
import { callEdgeFunctionJson } from '../edgeFunctions'
import { downloadUserTemplate } from '../csvTemplate'

export default function BulkUserUpload({ onDone }) {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResults(null)
    setParsing(true)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parsed) => {
        setParsing(false)
        if (parsed.errors.length > 0) {
          setError(`CSV parse error: ${parsed.errors[0].message} (row ${parsed.errors[0].row})`)
          return
        }
        await uploadRows(parsed.data)
      },
      error: (err) => {
        setParsing(false)
        setError(err.message)
      },
    })

    e.target.value = '' // allow re-selecting the same file later
  }

  async function uploadRows(rows) {
    setUploading(true)
    setError(null)
    try {
      const result = await callEdgeFunctionJson('bulk-create-users', { rows })
      setResults(result.results)
      onDone?.()
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  const createdCount = results?.filter(r => r.status === 'created').length ?? 0
  const updatedCount = results?.filter(r => r.status === 'updated').length ?? 0
  const skippedCount = results?.filter(r => r.status === 'skipped').length ?? 0

  return (
    <div className="user-card">
      <div className="bulk-upload-header">
        <h3>Bulk upload (CSV)</h3>
        <button onClick={() => setOpen(o => !o)} className="secondary">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <div>
          <button onClick={downloadUserTemplate} className="secondary">Download CSV template</button>
          <div className="inline-form" style={{ marginTop: '0.75rem' }}>
            <input type="file" accept=".csv" onChange={handleFileChange} disabled={parsing || uploading} />
          </div>

          {(parsing || uploading) && <p className="muted">{parsing ? 'Reading file…' : 'Uploading and processing rows…'}</p>}
          {error && <p className="error">{error}</p>}

          {results && (
            <div className="bulk-results">
              <p>
                <strong>{createdCount}</strong> created, <strong>{updatedCount}</strong> updated, <strong>{skippedCount}</strong> skipped.
              </p>
              <table className="data-table">
                <thead>
                  <tr><th>Row</th><th>Email</th><th>Status</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.email}</td>
                      <td className={r.status === 'skipped' ? 'error' : ''}>{r.status}</td>
                      <td>
                        {r.temp_password && <span className="temp-password-value">{r.temp_password}</span>}
                        {r.error && <span className="muted">{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">Temporary passwords above are only shown once — copy them now if you need to share any.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
