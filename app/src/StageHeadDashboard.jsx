// src/StageHeadDashboard.jsx
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import ContentManager from './components/ContentManager'
import { gradeToStage, STAGE_ROLES, STAGE_LABELS } from './stageUtils'

export default function StageHeadDashboard({ userId, role }) {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const stage = STAGE_ROLES[role]

  useEffect(() => {
    supabase.from('subjects').select('*').order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setSubjects((data ?? []).filter(s => gradeToStage(s.grade_level) === stage))
        setLoading(false)
      })
  }, [stage])

  if (loading) return <p>Loading…</p>
  if (error) return <p className="error">{error}</p>

  return (
    <div>
      <p className="muted">Showing all subjects in {STAGE_LABELS[stage] ?? stage} (grade levels only — subjects with no grade level set won't appear here until an admin sets one).</p>
      {subjects.length === 0 ? (
        <p>No subjects found for your stage yet.</p>
      ) : (
        <ContentManager subjects={subjects} userId={userId} canRestore={true} />
      )}
    </div>
  )
}
