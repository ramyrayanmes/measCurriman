// src/components/ReportsPanel.jsx
import { useState } from 'react'
import { callEdgeFunctionJson } from '../edgeFunctions'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Most recent Sunday whose Thursday has already passed (Cairo time)
function defaultWeekStart() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i)
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 0 && addDays(d, 4) <= today) return d
  }
  return addDays(today, -6)
}

export default function ReportsPanel() {
  const [weekStart, setWeekStart] = useState(defaultWeekStart())
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const isSunday = weekStart && new Date(weekStart + 'T00:00:00Z').getUTCDay() === 0

  async function run(mode) {
    if (mode === 'send' && !confirm('Send the report to every department head and meas.curricula@mes.edu.eg now?')) return
    setBusy(mode)
    setError(null)
    setResult(null)
    try {
      const data = await callEdgeFunctionJson('weekly-compliance-report', { mode, week_start: weekStart })
      setResult({ ...data, mode })
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  return (
    <div>
      <h2>Weekly submission report</h2>
      <p className="hint">
        The report is emailed automatically every Saturday morning (Cairo time) to each department head and to
        meas.curricula@mes.edu.eg. Use this page to preview it or send it on demand.
      </p>

      <div className="inline-form">
        <label className="muted">
          Week starting (Sunday)&nbsp;
          <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
        </label>
        <button onClick={() => run('preview')} disabled={!isSunday || busy} className="secondary">
          {busy === 'preview' ? 'Loading…' : 'Preview'}
        </button>
        <button onClick={() => run('test')} disabled={!isSunday || busy} className="secondary">
          {busy === 'test' ? 'Sending…' : 'Send test to me'}
        </button>
        <button onClick={() => run('send')} disabled={!isSunday || busy}>
          {busy === 'send' ? 'Sending…' : 'Send to everyone'}
        </button>
      </div>
      {!isSunday && <p className="error">Please pick a Sunday — weeks run Sunday to Thursday.</p>}
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="report-result">
          <h3>Week of {result.week_start} to {result.week_end}</h3>

          <h4>
            {result.mode === 'preview' ? 'Emails that would be sent' :
             result.mode === 'test' ? 'Test emails (all delivered to you)' : 'Emails sent'}
          </h4>
          {result.emails.length === 0 ? (
            <p className="muted">Nothing to report — no subjects have assigned teachers or retroactive submissions.</p>
          ) : (
            <ul className="version-list">
              {result.emails.map((e, i) => (
                <li key={i}>
                  <span>{e.to}{e.subjects_count ? ` — ${e.subjects_count} subject(s)` : ''}</span>
                  {e.status && <span className={e.status === 'sent' ? 'status-ok' : 'status-missing'}>{e.status}</span>}
                </li>
              ))}
            </ul>
          )}

          <h4>Checklist</h4>
          {result.subjects.map(s => (
            <div key={s.subject_id} className="subject-block">
              <h3>
                {s.subject_name}{s.grade_level ? ` (Grade ${s.grade_level})` : ''} — {s.teachers.filter(t => t.submitted).length} of {s.teachers.length} submitted
              </h3>
              <p className="muted">
                Department head(s): {s.heads.length ? s.heads.map(h => h.name).join(', ') : 'none assigned'}
              </p>
              <table className="data-table">
                <thead><tr><th>Teacher</th><th>Status</th><th>Plan(s)</th></tr></thead>
                <tbody>
                  {s.teachers.map(t => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className={t.submitted ? 'status-ok' : 'status-missing'}>
                        {t.submitted ? '✓ Submitted' : '✗ Not submitted'}
                      </td>
                      <td>{t.plans.map(p => `Week ${p.week_number} (Sem ${p.semester}): ${p.date_from} to ${p.date_to}`).join('; ') || '—'}</td>
                    </tr>
                  ))}
                  {s.teachers.length === 0 && <tr><td colSpan={3} className="muted">No teachers assigned.</td></tr>}
                </tbody>
              </table>
              {s.retroactive.length > 0 && (
                <>
                  <p><strong>Retroactive submissions</strong> (created this week for earlier weeks):</p>
                  <ul>
                    {s.retroactive.map((x, i) => (
                      <li key={i}>
                        {x.teacher} — Week {x.week_number} (Sem {x.semester}): {x.date_from} to {x.date_to},
                        created {new Date(x.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
