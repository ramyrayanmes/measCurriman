// src/components/UsersManager.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { callEdgeFunctionJson } from '../edgeFunctions'
import { roleLabel } from '../stageUtils'

const ALL_ROLES = ['admin', 'teacher', 'auditor', 'head_kindergarten', 'head_elementary', 'head_middle', 'head_high']

export default function UsersManager() {
  const [users, setUsers] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teacherSubjects, setTeacherSubjects] = useState([])
  const [auditorSubjects, setAuditorSubjects] = useState([])
  const [deptHeadSubjects, setDeptHeadSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [newEmail, setNewEmail] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newRole, setNewRole] = useState('teacher')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [justCreated, setJustCreated] = useState(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: u, error: uErr }, { data: s }, { data: ts }, { data: as_ }, { data: dhs }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
      supabase.from('subjects').select('*').order('name', { ascending: true }),
      supabase.from('teacher_subjects').select('*'),
      supabase.from('auditor_subjects').select('*'),
      supabase.from('department_head_subjects').select('*'),
    ])
    if (uErr) setError(uErr.message)
    setUsers(u ?? [])
    setSubjects(s ?? [])
    setTeacherSubjects(ts ?? [])
    setAuditorSubjects(as_ ?? [])
    setDeptHeadSubjects(dhs ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function handleCreateUser(e) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    setJustCreated(null)
    try {
      const result = await callEdgeFunctionJson('create-user', {
        email: newEmail,
        full_name: newFullName,
        role: newRole,
      })
      setJustCreated({ email: result.email, temp_password: result.temp_password })
      setNewEmail(''); setNewFullName(''); setNewRole('teacher')
      loadAll()
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

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

  async function toggleDeptHead(userId, subjectId, isAssigned) {
    if (isAssigned) {
      const { error } = await supabase.from('department_head_subjects').delete().eq('user_id', userId).eq('subject_id', subjectId)
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.from('department_head_subjects').insert({ user_id: userId, subject_id: subjectId })
      if (error) setError(error.message)
    }
    loadAll()
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <h2>Users</h2>

      <div className="user-card">
        <h3>Create new user</h3>
        <form onSubmit={handleCreateUser} className="inline-form">
          <input placeholder="Full name" value={newFullName} onChange={e => setNewFullName(e.target.value)} required />
          <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
          <select value={newRole} onChange={e => setNewRole(e.target.value)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
        </form>
        {createError && <p className="error">{createError}</p>}
        {justCreated && (
          <div className="temp-password-box">
            <strong>Account created.</strong> Share this temporary password with {justCreated.email} —
            it will only be shown here once:
            <div className="temp-password-value">{justCreated.temp_password}</div>
            <span className="muted">They can change it themselves after logging in via the "Change password" option.</span>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {users.map(user => {
        const assignedSubjectIds = (user.role === 'teacher' ? teacherSubjects : auditorSubjects)
          .filter(row => (user.role === 'teacher' ? row.teacher_id : row.auditor_id) === user.id)
          .map(row => row.subject_id)

        const deptHeadSubjectIds = deptHeadSubjects
          .filter(row => row.user_id === user.id)
          .map(row => row.subject_id)

        return (
          <div key={user.id} className="user-card">
            <div className="user-card-header">
              <strong>{user.full_name}</strong> <span className="muted">({user.email})</span>
              <select value={user.role} onChange={e => handleRoleChange(user.id, e.target.value)}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>

            {(user.role === 'teacher' || user.role === 'auditor') && (
              <div className="subject-checkboxes">
                <span className="muted">Assigned subjects ({user.role}):</span>
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

            {user.role?.startsWith('head_') && (
              <p className="muted">Automatic access to all subjects in their stage — no manual assignment needed.</p>
            )}

            {/* Department Head is independent of primary role — anyone can hold it */}
            <div className="subject-checkboxes dept-head-row">
              <span className="muted">Department Head of:</span>
              {subjects.map(s => {
                const isHead = deptHeadSubjectIds.includes(s.id)
                return (
                  <label key={s.id} className="checkbox-pill">
                    <input
                      type="checkbox"
                      checked={isHead}
                      onChange={() => toggleDeptHead(user.id, s.id, isHead)}
                    />
                    {s.name}
                  </label>
                )
              })}
              {subjects.length === 0 && <span className="muted">No subjects created yet.</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
