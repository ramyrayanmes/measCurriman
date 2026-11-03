// src/components/UsersManager.jsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { callEdgeFunctionJson } from '../edgeFunctions'
import { roleLabel } from '../stageUtils'
import { courseLabel } from '../access'
import BulkUserUpload from './BulkUserUpload'
import { useToast } from '../toastContext'

const ALL_ROLES = ['admin', 'teacher', 'auditor', 'head_department', 'head_kindergarten', 'head_elementary', 'head_middle', 'head_high']
const KIND_LABELS = { teacher: 'Teacher', auditor: 'Auditor', dept_head: 'Head of Department' }
const ALL = '__all__'

export default function UsersManager({ departments, courses, grades, currentUserId }) {
  const toast = useToast()
  const [users, setUsers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [filter, setFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [openUserId, setOpenUserId] = useState(null)

  const [newEmail, setNewEmail] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newRole, setNewRole] = useState('teacher')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [justCreated, setJustCreated] = useState(null)

  const gradeById = useMemo(() => new Map(grades.map(g => [g.id, g])), [grades])
  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const courseById = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses])
  const reload = () => setReloadTick(t => t + 1)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select('id, full_name, email, role, active').order('full_name', { ascending: true }),
      supabase.from('course_assignments').select('user_id, course_id, kind'),
    ]).then(([u, a]) => {
      if (cancelled) return
      if (u.error || a.error) setError((u.error ?? a.error).message)
      else setError(null)
      setUsers(u.data ?? [])
      setAssignments(a.data ?? [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [reloadTick])

  function fullCourseName(courseId) {
    const c = courseById.get(courseId)
    if (!c) return '(unknown course)'
    return `${deptById.get(c.department_id)?.name ?? '?'} — ${courseLabel(c, gradeById)}`
  }

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
      toast('User created')
      setNewEmail(''); setNewFullName(''); setNewRole('teacher')
      reload()
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

  async function handleRoleChange(userId, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) { setError(error.message); toast(error.message, 'error') }
    else { toast('Role updated'); reload() }
  }

  async function addAssignment(userId, courseIds, kind) {
    const ids = Array.isArray(courseIds) ? courseIds : [courseIds]
    const { error } = await supabase.from('course_assignments')
      .insert(ids.map(course_id => ({ user_id: userId, course_id, kind })))
    if (error) { setError(error.message); toast(error.message, 'error') }
    else { toast(ids.length > 1 ? `${ids.length} assignments added` : 'Assignment added'); reload() }
  }

  async function removeAssignment(a) {
    const { error } = await supabase.from('course_assignments').delete()
      .eq('user_id', a.user_id).eq('course_id', a.course_id).eq('kind', a.kind)
    if (error) { setError(error.message); toast(error.message, 'error') }
    else { toast('Assignment removed'); reload() }
  }

  async function handleResetPassword(user) {
    if (!window.confirm(`Generate a new temporary password for ${user.email}? Their current password will stop working.`)) return
    try {
      const result = await callEdgeFunctionJson('create-user', { action: 'reset_password', user_id: user.id })
      setJustCreated({ email: result.email, temp_password: result.temp_password, reset: true })
      toast('Temporary password generated')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function handleSetActive(user, active) {
    const msg = active
      ? `Reactivate ${user.email}? They will be able to sign in again.`
      : `Deactivate ${user.email}? They will be signed out and unable to sign in, but everything they created is kept.`
    if (!window.confirm(msg)) return
    try {
      await callEdgeFunctionJson('create-user', { action: 'set_active', user_id: user.id, active })
      toast(active ? 'User reactivated' : 'User deactivated')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function handleDeleteUser(user) {
    const typed = window.prompt(
      `Permanently delete ${user.email}? This cannot be undone.\n\nType the email address to confirm:`
    )
    if (typed === null) return
    if (typed.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) {
      toast('Email did not match — nothing was deleted', 'error')
      return
    }
    try {
      await callEdgeFunctionJson('create-user', { action: 'delete_user', user_id: user.id })
      toast('User deleted')
      if (openUserId === user.id) setOpenUserId(null)
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const q = filter.trim().toLowerCase()
  const inactiveCount = users.filter(u => u.active === false).length
  const shown = users.filter(u =>
    (showInactive || u.active !== false) &&
    (!q || (u.full_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
  )

  if (loading) return <p className="muted">Loading…</p>

  return (
    <div className="cv-wrap">
      <div className="cv-topbar">
        <div>
          <h2 className="cv-title">Users</h2>
          <p className="cv-subtitle">Accounts, roles and department/grade assignments.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <BulkUserUpload onDone={() => { toast('Bulk upload processed'); reload() }} />

      <div className="card">
        <h3>Create new user</h3>
        <form onSubmit={handleCreateUser} className="inline-form">
          <input placeholder="Full name" value={newFullName} onChange={e => setNewFullName(e.target.value)} required />
          <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
          <select value={newRole} onChange={e => setNewRole(e.target.value)}>
            {ALL_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
        </form>
        {createError && <p className="error">{createError}</p>}
        {justCreated && (
          <div className="temp-password-box">
            <strong>{justCreated.reset ? 'Password reset.' : 'Account created.'}</strong> Share this temporary password with {justCreated.email} — it is only shown once:
            <div className="temp-password-value">{justCreated.temp_password}</div>
            <span className="muted">They can change it after signing in via “Change password”.</span>
          </div>
        )}
      </div>

      <div className="section-title-row">
        <h3>Users ({shown.length}{inactiveCount > 0 && !showInactive ? ` of ${users.length}` : ''})</h3>
        <div className="tbl-actions">
          <label className="muted">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            {' '}Show inactive users{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
          </label>
          <input
            className="user-filter"
            type="search"
            placeholder="Filter by name or email…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      </div>

      {shown.map(user => {
        const mine = assignments.filter(a => a.user_id === user.id)
        const open = openUserId === user.id
        return (
          <div key={user.id} className={`card user-card${user.active === false ? ' user-inactive' : ''}`}>
            <div className="user-card-header">
              <div>
                <strong>{user.full_name || '(no name)'}</strong> <span className="muted">{user.email}</span>
                {user.active === false && <span className="chip chip-inactive">Inactive</span>}
              </div>
              <div className="tbl-actions">
                <select value={user.role} onChange={e => handleRoleChange(user.id, e.target.value)}>
                  {ALL_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(user)}>Reset password</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenUserId(open ? null : user.id)}>
                  {open ? 'Hide' : 'Assignments'} ({mine.length})
                </button>
                {user.id !== currentUserId && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleSetActive(user, user.active === false)}>
                      {user.active === false ? 'Reactivate' : 'Deactivate'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(user)}>Delete</button>
                  </>
                )}
              </div>
            </div>

            {user.role.startsWith('head_') && user.role !== 'head_department' && (
              <p className="muted">Head of stage: reviews every course in their stage automatically (all departments).</p>
            )}
            {user.role === 'head_department' && (
              <p className="muted">Head of department: supervises only the department/grade courses listed under Assignments.</p>
            )}
            {user.role === 'admin' && <p className="muted">Admins have access to everything.</p>}

            {open && (
              <AssignmentEditor
                user={user}
                mine={mine}
                departments={departments}
                courses={courses}
                gradeById={gradeById}
                fullCourseName={fullCourseName}
                onAdd={addAssignment}
                onRemove={removeAssignment}
              />
            )}
          </div>
        )
      })}
      {shown.length === 0 && <p className="muted">No users match.</p>}
    </div>
  )
}

function AssignmentEditor({ user, mine, departments, courses, gradeById, fullCourseName, onAdd, onRemove }) {
  const defaultKind = user.role === 'auditor' ? 'auditor' : user.role === 'head_department' ? 'dept_head' : 'teacher'
  const [kind, setKind] = useState(defaultKind)
  const [deptId, setDeptId] = useState('')
  const [courseId, setCourseId] = useState('')

  const deptCourses = courses.filter(c => c.department_id === deptId && !c.archived_at)
  const taken = new Set(mine.filter(a => a.kind === kind).map(a => a.course_id))

  const available = deptCourses.filter(c => !taken.has(c.id))

  return (
    <div className="assign-editor">
      <p className="muted">
        A person can hold several assignments of different kinds, e.g. Teacher for English/Grade 2 and Head of Department for Math/Grade 4 to 6.
      </p>
      {mine.length === 0 && <p className="muted">No assignments yet.</p>}
      <div className="subject-checkboxes">
        {mine.map(a => (
          <span key={`${a.course_id}-${a.kind}`} className="checkbox-pill assign-pill">
            <span className="chip">{KIND_LABELS[a.kind]}</span>
            {fullCourseName(a.course_id)}
            <button className="link-button" onClick={() => onRemove(a)} aria-label="Remove">✕</button>
          </span>
        ))}
      </div>

      <form
        className="inline-form"
        onSubmit={e => {
          e.preventDefault()
          onAdd(user.id, courseId === ALL ? available.map(c => c.id) : courseId, kind)
          setCourseId('')
        }}
      >
        <select value={kind} onChange={e => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={deptId} onChange={e => { setDeptId(e.target.value); setCourseId('') }} required>
          <option value="">Department…</option>
          {departments.filter(d => !d.archived_at).map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
        </select>
        <select value={courseId} onChange={e => setCourseId(e.target.value)} required disabled={!deptId}>
          <option value="">Grade…</option>
          {available.length > 1 && <option value={ALL}>All grades ({available.length})</option>}
          {available.map(c => (
            <option key={c.id} value={c.id}>{c.name ?? gradeById.get(c.grade_id)?.name}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" disabled={!courseId}>Add</button>
      </form>
    </div>
  )
}
