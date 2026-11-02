// src/components/WeeklyPlansSection.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import WeeklyPlanEditor from './WeeklyPlanEditor'
import PlanDownloadButtons from './PlanDownloadButtons'

export default function WeeklyPlansSection({ course, gradeName, userId, isAdmin, isAuditor, canEdit }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // { plan } — plan null means "new"
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('weekly_plans')
      .select('*, profiles(full_name)')
      .eq('course_id', course.id)
      .order('date_from', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else { setPlans(data); setError(null) }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [course.id, reloadTick])

  if (editing) {
    const plan = editing.plan
    return (
      <WeeklyPlanEditor
        courseId={course.id}
        defaultGradeLevel={gradeName}
        existingPlan={plan}
        userId={userId}
        isAuditor={isAuditor}
        readOnly={!canEdit || (plan && plan.teacher_id !== userId && !isAdmin)}
        onBack={() => { setEditing(null); setReloadTick(t => t + 1) }}
      />
    )
  }

  if (loading) return <p className="muted">Loading…</p>

  return (
    <div>
      <div className="section-title-row" style={{ marginTop: 0 }}>
        <h3>Weekly Lesson Plans</h3>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ plan: null })}>+ New week</button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {plans.map(p => (
        <div key={p.id} className="card plan-row">
          <div>
            <div className="plan-title">Week {p.week_number} <span className="chip">Sem {p.semester}</span></div>
            <div className="muted">
              {p.date_from} to {p.date_to}
              {p.teacher_id !== userId && p.profiles?.full_name ? ` • ${p.profiles.full_name}` : ''}
            </div>
          </div>
          <div className="plan-row-actions">
            <PlanDownloadButtons planId={p.id} isAuditor={isAuditor} />
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ plan: p })}>Open</button>
          </div>
        </div>
      ))}

      {plans.length === 0 && <p className="muted">No weekly plans yet for this course.</p>}
    </div>
  )
}
