// src/TeacherDashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import CurriculumForm from './components/CurriculumForm'

export default function TeacherDashboard({ userId }) {
  const [subjects, setSubjects] = useState([])
  const [curricula, setCurricula] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // { subjectId, curriculum|null }

  async function loadData() {
    setLoading(true)
    setError(null)

    const { data: assignments, error: aErr } = await supabase
      .from('teacher_subjects')
      .select('subject_id, subjects(id, name, grade_level)')
      .eq('teacher_id', userId)

    if (aErr) { setError(aErr.message); setLoading(false); return }

    const mySubjects = (assignments ?? []).map(a => a.subjects)
    setSubjects(mySubjects)

    if (mySubjects.length > 0) {
      const { data: curriculaData, error: cErr } = await supabase
        .from('curricula')
        .select('*')
        .in('subject_id', mySubjects.map(s => s.id))
        .order('academic_year', { ascending: false })
      if (cErr) setError(cErr.message)
      else setCurricula(curriculaData)
    } else {
      setCurricula([])
    }

    setLoading(false)
  }

  useEffect(() => { loadData() }, [userId])

  if (loading) return <p>Loading…</p>

  if (subjects.length === 0) {
    return <p>You haven't been assigned to any subjects yet — ask an admin to assign you one.</p>
  }

  if (editing) {
    return (
      <div>
        <h2>{editing.curriculum ? 'Edit' : 'New'} Curriculum — {subjects.find(s => s.id === editing.subjectId)?.name}</h2>
        <CurriculumForm
          subjectId={editing.subjectId}
          existing={editing.curriculum}
          userId={userId}
          onSaved={() => { setEditing(null); loadData() }}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div>
      <h2>My Curricula</h2>
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
                Edit
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
