// src/components/AuditorWeeklyPlanView.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import VersionHistoryAndExport from './VersionHistoryAndExport'

const BLOOMS_LABELS = { 1: 'Remembering', 2: 'Understanding', 3: 'Applying', 4: 'Analyzing', 5: 'Evaluating', 6: 'Creating' }

export default function AuditorWeeklyPlanView({ plan, onBack }) {
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('lesson_periods')
      .select('*')
      .eq('weekly_plan_id', plan.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setPeriods(data ?? []); setLoading(false) })
  }, [plan.id])

  return (
    <div>
      <button onClick={onBack} className="secondary">&larr; Back</button>
      <h2>Week {plan.week_number} — Semester {plan.semester}</h2>
      <p className="muted">{plan.date_from} to {plan.date_to} {plan.grade_level ? `• Grade ${plan.grade_level}` : ''}</p>

      <h3>Class Periods</h3>
      {loading ? <p>Loading…</p> : (
        <>
          {periods.map(p => (
            <div key={p.id} className="period-card">
              <strong>{p.class_and_date || '(no class/date set)'}</strong>
              <p><strong>Objectives:</strong> {p.learning_objectives}</p>
              <p><strong>Description:</strong> {p.description_of_lesson}</p>
              <p><strong>Book & Pages:</strong> {p.book_pages}</p>
              <p><strong>Bloom's:</strong> {(p.blooms_levels ?? []).map(n => BLOOMS_LABELS[n]).join(', ')}</p>
              <p><strong>Materials:</strong> {p.materials_resources}</p>
              <p><strong>Differentiation:</strong> {p.differentiation}</p>
              <p><strong>Reflection:</strong> {p.reflection}</p>
              <p><strong>Classwork:</strong> {p.classwork}</p>
              <p><strong>Homework:</strong> {p.homework}</p>
            </div>
          ))}
          {periods.length === 0 && <p className="muted">No class periods recorded.</p>}
        </>
      )}

      <VersionHistoryAndExport
        table="weekly_plans"
        recordId={plan.id}
        canRestore={false}
      />
    </div>
  )
}
