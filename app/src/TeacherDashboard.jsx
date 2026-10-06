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
    const [{ data: taught, error: tErr }, { data: headed, error: hErr }] = await Promise.all([
      supabase.from('teacher_subjects').select('subject_id, subjects(id, name, grade_level)').eq('teacher_id', userId),
      supabase.from('department_head_subjects').select('subject_id, subjects(id, name, grade_level)').eq('user_id', userId),
    ])
    if (tErr) setError(tErr.message)
    if (hErr) setError(hErr.message)

    // Merge both lists, de-duplicated by subject id — someone might both
    // teach a subject AND head it.
    const merged = new Map()
    for (const row of [...(taught ?? []), ...(headed ?? [])]) {
      if (row.subjects) merged.set(row.subjects.id, row.subjects)
    }
    setSubjects(Array.from(merged.values()))
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
