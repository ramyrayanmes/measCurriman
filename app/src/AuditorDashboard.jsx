// src/AuditorDashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import AuditorCurriculumView from './components/AuditorCurriculumView'
import AuditorWeeklyPlanView from './components/AuditorWeeklyPlanView'

export default function AuditorDashboard({ userId }) {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('curricula')
  const [viewing, setViewing] = useState(null) // { type: 'curriculum'|'weekly', record }

  useEffect(() => {
    supabase
      .from('auditor_subjects')
      .select('subject_id, subjects(id, name, grade_level)')
      .eq('auditor_id', userId)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setSubjects((data ?? []).map(a => a.subjects))
        setLoading(false)
      })
  }, [userId])

  if (loading) return <p>Loading…</p>
  if (error) return <p className="error">{error}</p>
  if (subjects.length === 0) {
    return <p>You haven't been assigned to any subjects yet — ask an admin to assign you one.</p>
  }

  if (viewing?.type === 'curriculum') {
    return <AuditorCurriculumView curriculum={viewing.record} onBack={() => setViewing(null)} />
  }
  if (viewing?.type === 'weekly') {
    return <AuditorWeeklyPlanView plan={viewing.record} onBack={() => setViewing(null)} />
  }

  return (
    <div>
      <nav className="tabs">
        <button className={tab === 'curricula' ? 'active' : ''} onClick={() => setTab('curricula')}>Curricula</button>
        <button className={tab === 'weekly' ? 'active' : ''} onClick={() => setTab('weekly')}>Weekly Lesson Plans</button>
      </nav>

      {tab === 'curricula' && (
        <AuditorCurriculaList subjects={subjects} onView={(c) => setViewing({ type: 'curriculum', record: c })} />
      )}
      {tab === 'weekly' && (
        <AuditorWeeklyPlansList subjects={subjects} onView={(p) => setViewing({ type: 'weekly', record: p })} />
      )}
    </div>
  )
}

function AuditorCurriculaList({ subjects, onView }) {
  const [curricula, setCurricula] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('curricula')
      .select('*')
      .in('subject_id', subjects.map(s => s.id))
      .order('academic_year', { ascending: false })
      .then(({ data }) => { setCurricula(data ?? []); setLoading(false) })
  }, [subjects])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h2>Curricula</h2>
      {subjects.map(subject => (
        <div key={subject.id} className="subject-block">
          <h3>{subject.name} {subject.grade_level ? `(Grade ${subject.grade_level})` : ''}</h3>
          {curricula.filter(c => c.subject_id === subject.id).map(c => (
            <div key={c.id} className="curriculum-row">
              <span>{c.title} {c.academic_year ? `— ${c.academic_year}` : ''}</span>
              <button onClick={() => onView(c)} className="secondary">View</button>
            </div>
          ))}
          {curricula.filter(c => c.subject_id === subject.id).length === 0 && (
            <p className="muted">No curricula for this subject.</p>
          )}
        </div>
      ))}
    </div>
  )
}

function AuditorWeeklyPlansList({ subjects, onView }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('weekly_plans')
      .select('*')
      .in('subject_id', subjects.map(s => s.id))
      .order('week_number', { ascending: false })
      .then(({ data }) => { setPlans(data ?? []); setLoading(false) })
  }, [subjects])

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h2>Weekly Lesson Plans</h2>
      {subjects.map(subject => (
        <div key={subject.id} className="subject-block">
          <h3>{subject.name} {subject.grade_level ? `(Grade ${subject.grade_level})` : ''}</h3>
          {plans.filter(p => p.subject_id === subject.id).map(p => (
            <div key={p.id} className="curriculum-row">
              <span>Week {p.week_number} (Sem {p.semester}) — {p.date_from} to {p.date_to}</span>
              <button onClick={() => onView(p)} className="secondary">View</button>
            </div>
          ))}
          {plans.filter(p => p.subject_id === subject.id).length === 0 && (
            <p className="muted">No weekly plans for this subject.</p>
          )}
        </div>
      ))}
    </div>
  )
}
