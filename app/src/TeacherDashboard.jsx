// src/TeacherDashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import ContentManager from './components/ContentManager'

export default function TeacherDashboard({ userId }) {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function loadSubjects() {
    setLoading(true)
    const { data, error } = await supabase
      .from('teacher_subjects')
      .select('subject_id, subjects(id, name, grade_level)')
      .eq('teacher_id', userId)
    if (error) setError(error.message)
    setSubjects((data ?? []).map(a => a.subjects))
    setLoading(false)
  }

  useEffect(() => { loadSubjects() }, [userId])

  if (loading) return <p>Loading…</p>
  if (error) return <p className="error">{error}</p>
  if (subjects.length === 0) {
    return <p>You haven't been assigned to any subjects yet — ask an admin to assign you one.</p>
  }

  return <ContentManager subjects={subjects} userId={userId} canRestore={false} />
}
