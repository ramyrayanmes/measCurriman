// src/components/WeeklyPlansSection.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import WeeklyPlanEditor from './WeeklyPlanEditor'
import { downloadFromEdgeFunction } from '../edgeFunctions'

export default function WeeklyPlansSection({ subjects, userId, canManageSubject }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [busyAction, setBusyAction] = useState(null) // e.g. "planId-docx"

  async function loadPlans() {
    setLoading(true)
    if (subjects.length === 0) { setPlans([]); setLoading(false); return }
    const { data, error } = await supabase
      .from('weekly_plans')
      .select('*')
      .in('subject_id', subjects.map(s => s.id))
      .order('week_number', { ascending: false })
    if (error) setError(error.message)
    else setPlans(data)
    setLoading(false)
  }

  useEffect(() => { loadPlans() }, [subjects])

  async function handleExport(planId, format) {
    setBusyAction(`${planId}-${format}`)
    setError(null)
    try {
      await downloadFromEdgeFunction('export-document', { table: 'weekly_plans', record_id: planId, format }, `plan.${format}`)
    } catch (err) {
      setError(err.message)
    }
    setBusyAction(null)
  }

  if (editing) {
    return (
      <WeeklyPlanEditor
        subjectId={editing.subjectId}
        existingPlan={editing.plan}
        userId={userId}
        canRestore={canManageSubject(editing.subjectId)}
        onBack={() => { setEditing(null); loadPlans() }}
      />
    )
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h2>Weekly Lesson Plans</h2>
      {error && <p className="error">{error}</p>}

      {subjects.map(subject => (
        <div key={subject.id} className="subject-block">
          <div className="subject-block-header">
            <h3>{subject.name} {subject.grade_level ? `(Grade ${subject.grade_level})` : ''}</h3>
            <button onClick={() => setEditing({ subjectId: subject.id, plan: null })}>
              + New week
            </button>
          </div>

          {plans.filter(p => p.subject_id === subject.id).map(p => (
            <div key={p.id} className="curriculum-row plan-row">
              <span>Week {p.week_number} (Sem {p.semester}) — {p.date_from} to {p.date_to}</span>
              <div className="plan-row-actions">
                <button
                  onClick={() => handleExport(p.id, 'docx')}
                  disabled={busyAction === `${p.id}-docx`}
                  className="secondary"
                >
                  {busyAction === `${p.id}-docx` ? 'Preparing…' : 'Word'}
                </button>
                <button
                  onClick={() => handleExport(p.id, 'pdf')}
                  disabled={busyAction === `${p.id}-pdf`}
                  className="secondary"
                >
                  {busyAction === `${p.id}-pdf` ? 'Preparing…' : 'PDF'}
                </button>
                <button onClick={() => setEditing({ subjectId: subject.id, plan: p })} className="secondary">
                  Open
                </button>
              </div>
            </div>
          ))}

          {plans.filter(p => p.subject_id === subject.id).length === 0 && (
            <p className="muted">No weekly plans yet for this subject.</p>
          )}
        </div>
      ))}
    </div>
  )
}
