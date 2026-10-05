// src/components/UsersManager.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function UsersManager() {
  const [users, setUsers] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teacherSubjects, setTeacherSubjects] = useState([]) // [{teacher_id, subject_id}]
  const [auditorSubjects, setAuditorSubjects] = useState([]) // [{auditor_id, subject_id}]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: u, error: uErr }, { data: s }, { data: ts }, { data: as_ }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('subjects').select('*').order('name', { ascending: true }),
      supabase.from('teacher_subjects').select('*'),
      supabase.from('auditor_subjects').select('*'),
    ])
    if (uErr) setError(uErr.message)
    setUsers(u ?? [])
    setSubjects(s ?? [])
    setTeacherSubjects(ts ?? [])
    setAuditorSubjects(as_ ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function handleRoleChange(userId, newRole) {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (error) setError(error.message)
    else loadAll()
  }

  async function toggleAssignment(role, userId, subjectId, isAssigned) {
    const table = role === 'teacher' ? 'teacher_subjects' : 'auditor_subjects'
    const idCol = role === 'teacher' ? 'teacher_id' : 'auditor_id'

    if (isAssigned) {
      const { error } = await supabase.from(table).delete().eq(idCol, userId).eq('subject_id', subjectId)
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.from(table).insert({ [idCol]: userId, subject_id: subjectId })
      if (error) setError(error.message)
    }
    loadAll()
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h2>Users</h2>
      <p className="hint">
        New accounts are still created manually in Supabase (Authentication → Users) for now —
        this screen manages their role and which subjects they can access.
      </p>
      {error && <p className="error">{error}</p>}

      {users.map(user => {
        const assignedSubjectIds = (user.role === 'teacher' ? teacherSubjects : auditorSubjects)
          .filter(row => (user.role === 'teacher' ? row.teacher_id : row.auditor_id) === user.id)
          .map(row => row.subject_id)

        return (
          <div key={user.id} className="user-card">
            <div className="user-card-header">
              <strong>{user.full_name}</strong> <span className="muted">({user.email})</span>
              <select value={user.role} onChange={e => handleRoleChange(user.id, e.target.value)}>
                <option value="admin">admin</option>
                <option value="teacher">teacher</option>
                <option value="auditor">auditor</option>
              </select>
            </div>

            {(user.role === 'teacher' || user.role === 'auditor') && (
              <div className="subject-checkboxes">
                <span className="muted">Assigned subjects:</span>
                {subjects.map(s => {
                  const isAssigned = assignedSubjectIds.includes(s.id)
                  return (
                    <label key={s.id} className="checkbox-pill">
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => toggleAssignment(user.role, user.id, s.id, isAssigned)}
                      />
                      {s.name}
                    </label>
                  )
                })}
                {subjects.length === 0 && <span className="muted">No subjects created yet.</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
