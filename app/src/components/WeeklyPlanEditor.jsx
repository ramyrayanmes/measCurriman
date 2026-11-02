// src/components/WeeklyPlanEditor.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import WeeklyPlanHeaderForm from './WeeklyPlanHeaderForm'
import LessonPeriodForm from './LessonPeriodForm'
import PlanDownloadButtons from './PlanDownloadButtons'
import { useToast } from '../toastContext'

const BLOOMS_LABELS = { 1: 'Remembering', 2: 'Understanding', 3: 'Applying', 4: 'Analyzing', 5: 'Evaluating', 6: 'Creating' }

export default function WeeklyPlanEditor({ courseId, defaultGradeLevel, existingPlan, userId, isAuditor, readOnly, onBack }) {
  const toast = useToast()
  const [plan, setPlan] = useState(existingPlan)
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(!!existingPlan)
  const [editingPeriod, setEditingPeriod] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)

  const planId = plan?.id
  const reloadPeriods = () => setReloadTick(t => t + 1)

  useEffect(() => {
    if (!planId) return
    let cancelled = false
    supabase
      .from('lesson_periods')
      .select('*')
      .eq('weekly_plan_id', planId)
      .order('lesson_date', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setPeriods(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [planId, reloadTick])

  async function handleDeletePeriod(id) {
    if (!confirm('Delete this class period?')) return
    const { error } = await supabase.from('lesson_periods').delete().eq('id', id)
    if (error) toast(error.message, 'error'); else toast('Class period deleted')
    reloadPeriods()
  }

  if (!plan) {
    return (
      <div>
        <h3>New Weekly Plan</h3>
        <WeeklyPlanHeaderForm
          courseId={courseId}
          defaultGradeLevel={defaultGradeLevel}
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
        <h3>{editingPeriod === 'new' ? 'Add' : 'Edit'} Class Period</h3>
        <LessonPeriodForm
          weeklyPlanId={plan.id}
          existing={editingPeriod === 'new' ? null : editingPeriod}
          onSaved={() => { setEditingPeriod(null); reloadPeriods() }}
          onCancel={() => setEditingPeriod(null)}
        />
      </div>
    )
  }

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm">&larr; Back to weekly plans</button>
      <div className="section-title-row">
        <div>
          <h3>Week {plan.week_number} — Semester {plan.semester}</h3>
          <p className="muted">{plan.date_from} to {plan.date_to}{plan.grade_level ? ` • ${plan.grade_level}` : ''}</p>
        </div>
        <div className="plan-row-actions">
          <PlanDownloadButtons planId={plan.id} isAuditor={isAuditor} />
          {!readOnly && (
            <button className="btn btn-primary btn-sm" onClick={() => setEditingPeriod('new')}>+ Add class period</button>
          )}
        </div>
      </div>

      {readOnly && <div className="readonly-banner">You have read-only access to this plan.</div>}

      {loading ? <p className="muted">Loading…</p> : (
        <>
          {periods.map(p => (
            <div key={p.id} className="period-card">
              <div className="period-card-header">
                <strong>{p.class_section || '(no class/section set)'} {p.lesson_date ? `— ${p.lesson_date}` : ''}</strong>
                {!readOnly && (
                  <div>
                    <button onClick={() => setEditingPeriod(p)} className="btn btn-ghost btn-sm">Edit</button>
                    <button onClick={() => handleDeletePeriod(p.id)} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                )}
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
    </div>
  )
}
