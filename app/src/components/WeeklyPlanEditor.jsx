// src/components/WeeklyPlanEditor.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import WeeklyPlanHeaderForm from './WeeklyPlanHeaderForm'
import LessonPeriodForm from './LessonPeriodForm'
import VersionHistoryAndExport from './VersionHistoryAndExport'

const BLOOMS_LABELS = { 1: 'Remembering', 2: 'Understanding', 3: 'Applying', 4: 'Analyzing', 5: 'Evaluating', 6: 'Creating' }

export default function WeeklyPlanEditor({ subjectId, existingPlan, userId, canRestore, onBack }) {
  const [plan, setPlan] = useState(existingPlan)
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(!!existingPlan)
  const [editingPeriod, setEditingPeriod] = useState(null)

  async function loadPeriods() {
    if (!plan) return
    setLoading(true)
    const { data } = await supabase
      .from('lesson_periods')
      .select('*')
      .eq('weekly_plan_id', plan.id)
      .order('created_at', { ascending: true })
    setPeriods(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadPeriods() }, [plan])

  async function handleDeletePeriod(id) {
    if (!confirm('Delete this class period?')) return
    await supabase.from('lesson_periods').delete().eq('id', id)
    loadPeriods()
  }

  async function refreshPlan() {
    const { data } = await supabase.from('weekly_plans').select('*').eq('id', plan.id).single()
    if (data) setPlan(data)
    loadPeriods()
  }

  if (!plan) {
    return (
      <div>
        <h2>New Weekly Plan</h2>
        <WeeklyPlanHeaderForm
          subjectId={subjectId}
          userId={userId}
          onSaved={(saved) => setPlan(saved)}
          onCancel={onBack}
        />
      </div>
    )
  }

  if (editingPeriod) {
    return (
      <div>
        <h2>{editingPeriod === 'new' ? 'Add' : 'Edit'} Class Period</h2>
        <LessonPeriodForm
          weeklyPlanId={plan.id}
          existing={editingPeriod === 'new' ? null : editingPeriod}
          onSaved={() => { setEditingPeriod(null); loadPeriods() }}
          onCancel={() => setEditingPeriod(null)}
        />
      </div>
    )
  }

  return (
    <div>
      <button onClick={onBack} className="secondary">&larr; Back to weekly plans</button>
      <h2>Week {plan.week_number} — Semester {plan.semester}</h2>
      <p className="muted">{plan.date_from} to {plan.date_to} {plan.grade_level ? `• Grade ${plan.grade_level}` : ''}</p>

      <h3>Class Periods</h3>
      <button onClick={() => setEditingPeriod('new')}>+ Add class period</button>

      {loading ? <p>Loading…</p> : (
        <>
          {periods.map(p => (
            <div key={p.id} className="period-card">
              <div className="period-card-header">
                <strong>{p.class_and_date || '(no class/date set)'}</strong>
                <div>
                  <button onClick={() => setEditingPeriod(p)} className="secondary">Edit</button>
                  <button onClick={() => handleDeletePeriod(p.id)} className="danger">Delete</button>
                </div>
              </div>
              <p><strong>Objectives:</strong> {p.learning_objectives}</p>
              <p><strong>Description:</strong> {p.description_of_lesson}</p>
              <p><strong>Book & Pages:</strong> {p.book_pages}</p>
              <p><strong>Bloom's:</strong> {(p.blooms_levels ?? []).map(n => BLOOMS_LABELS[n]).join(', ')}</p>
            </div>
          ))}
          {periods.length === 0 && <p className="muted">No class periods added yet.</p>}
        </>
      )}

      <VersionHistoryAndExport
        table="weekly_plans"
        recordId={plan.id}
        canRestore={canRestore}
        onRestored={refreshPlan}
		canManageVersions={canRestore}
      />
    </div>
  )
}
