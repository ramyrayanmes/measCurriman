// src/components/ContentManager.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import CurriculumForm from './CurriculumForm'
import WeeklyPlansSection from './WeeklyPlansSection'

export default function ContentManager({ subjects, userId, canRestore }) {
  const [tab, setTab] = useState('curricula')
  const [deptHeadSubjectIds, setDeptHeadSubjectIds] = useState(new Set())

  useEffect(() => {
    supabase
      .from('department_head_subjects')
      .select('subject_id')
      .eq('user_id', userId)
      .then(({ data }) => setDeptHeadSubjectIds(new Set((data ?? []).map(r => r.subject_id))))
  }, [userId])

  // Global canRestore (true for admins/Stage Heads) always wins; otherwise,
  // check whether this specific subject has been granted to this user as
  // a Department Head assignment.
  function canManageSubject(subjectId) {
    return canRestore || deptHeadSubjectIds.has(subjectId)
  }

  if (subjects.length === 0) {
    return <p>No subjects available yet.</p>
  }

  return (
    <div>
      <nav className="tabs">
        <button className={tab === 'curricula' ? 'active' : ''} onClick={() => setTab('curricula')}>Curricula</button>
        <button className={tab === 'weekly' ? 'active' : ''} onClick={() => setTab('weekly')}>Weekly Lesson Plans</button>
      </nav>

      {tab === 'curricula' && <CurriculaSection subjects={subjects} userId={userId} canManageSubject={canManageSubject} />}
      {tab === 'weekly' && <WeeklyPlansSection subjects={subjects} userId={userId} canManageSubject={canManageSubject} />}
    </div>
  )
}

function CurriculaSection({ subjects, userId, canManageSubject }) {
  const [curricula, setCurricula] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  async function loadCurricula() {
    setLoading(true)
    const { data, error } = await supabase
      .from('curricula')
      .select('*')
      .in('subject_id', subjects.map(s => s.id))
      .order('academic_year', { ascending: false })
    if (error) setError(error.message)
    else setCurricula(data)
    setLoading(false)
  }

  useEffect(() => { loadCurricula() }, [subjects])

  if (editing) {
    const manage = canManageSubject(editing.subjectId)
    return (
      <div>
        <h2>{editing.curriculum ? 'Edit' : 'New'} Curriculum — {subjects.find(s => s.id === editing.subjectId)?.name}</h2>
        <CurriculumForm
          subjectId={editing.subjectId}
          existing={editing.curriculum}
          userId={userId}
          canRestore={manage}
          onSaved={() => { setEditing(null); loadCurricula() }}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h2>Curricula</h2>
      {error && <p className="error">{error}</p>}

      {subjects.map(subject => (
        <div key={subject.id} className="subject-block">
          <div className="subject-block-header">
            <h3>{subject.name} {subject.grade_level ? `(Grade ${subject.grade_level})` : ''}</h3>
            <button onClick={() => setEditing({ subjectId: subject.id, curriculum: null })}>
              + New curriculum
            </button>
          </div>

          {curricula.filter(c => c.subject_id === subject.id).map(c => (
            <div key={c.id} className="curriculum-row">
              <span>{c.title} {c.academic_year ? `— ${c.academic_year}` : ''}</span>
              <button onClick={() => setEditing({ subjectId: subject.id, curriculum: c })} className="secondary">
                Open
              </button>
            </div>
          ))}

          {curricula.filter(c => c.subject_id === subject.id).length === 0 && (
            <p className="muted">No curricula yet for this subject.</p>
          )}
        </div>
      ))}
    </div>
  )
}
