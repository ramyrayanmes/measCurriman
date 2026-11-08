// src/components/ManageDepartments.jsx
import { useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { STAGE_LABELS } from '../stageUtils'
import { courseLabel } from '../access'
import { useToast } from '../toastContext'

const STAGES = Object.keys(STAGE_LABELS)

export default function ManageDepartments({ grades, departments, courses, onChanged }) {
  const toast = useToast()
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const gradeById = useMemo(() => new Map(grades.map(g => [g.id, g])), [grades])
  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  // Runs a Supabase write, reports errors, then refreshes the shell data.
  async function run(request, successMessage = 'Changes saved') {
    setBusy(true)
    setError(null)
    const { error } = await request
    setBusy(false)
    if (error) { setError(error.message); toast(error.message, 'error'); return false }
    toast(successMessage)
    await onChanged()
    return true
  }

  const nowIso = () => new Date().toISOString()
  const archiveToggle = (table, row) =>
    run(supabase.from(table).update({ archived_at: row.archived_at ? null : nowIso() }).eq('id', row.id))

  return (
    <div className="cv-wrap">
      <div className="cv-topbar">
        <div>
          <h2 className="cv-title">Manage Departments, Grades and Courses</h2>
          <p className="cv-subtitle">Departments, grades, courses and electives. Archiving hides items without deleting any content.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <DepartmentsSection
        departments={departments} courses={courses} busy={busy} run={run} archiveToggle={archiveToggle}
      />
      <GradesSection
        grades={grades} courses={courses} busy={busy} run={run} archiveToggle={archiveToggle}
      />
      <CoursesSection
        departments={departments} grades={grades} courses={courses}
        gradeById={gradeById} deptById={deptById}
        busy={busy} run={run} archiveToggle={archiveToggle}
      />
    </div>
  )
}

function DepartmentsSection({ departments, courses, busy, run, archiveToggle }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📘')
  const [kind, setKind] = useState('department')
  const [editing, setEditing] = useState(null)

  async function handleDelete(d) {
    const count = courses.filter(c => c.department_id === d.id).length
    const typed = window.prompt(
      `PERMANENTLY delete "${d.name}"?\n\nThis also deletes its ${count} course(s) with all curriculum versions, ` +
      `working copies, weekly plans and user assignments. This cannot be undone.\n\nType the department name to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== d.name) { window.alert('The name did not match. Nothing was deleted.'); return }
    await run(supabase.rpc('delete_department', { p_dept: d.id }), 'Department deleted')
  }

  async function handleAdd(e) {
    e.preventDefault()
    const ok = await run(supabase.from('departments').insert({
      name: name.trim(), icon: icon.trim() || '📘', kind, sort_order: departments.length,
    }))
    if (ok) setName('')
  }

  async function saveEdit(e) {
    e.preventDefault()
    const ok = await run(supabase.from('departments')
      .update({ name: editing.name.trim(), icon: editing.icon.trim() || '📘' }).eq('id', editing.id))
    if (ok) setEditing(null)
  }

  return (
    <>
      <div className="section-title-row"><h3>Departments</h3></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Icon</th><th>Name</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {departments.map(d => (
              <tr key={d.id} className={d.archived_at ? 'row-archived' : ''}>
                <td>{d.icon}</td>
                <td>{d.name}{d.archived_at ? ' (archived)' : ''}</td>
                <td>{d.kind === 'elective' ? 'Elective group' : 'Department'}</td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing({ id: d.id, name: d.name, icon: d.icon })}>Edit</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => archiveToggle('departments', d)}>
                      {d.archived_at ? 'Restore' : 'Archive'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => handleDelete(d)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {departments.length === 0 && <tr><td colSpan={4} className="muted">No departments yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {editing && (
        <form className="inline-form" onSubmit={saveEdit}>
          <label>Department name <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required /></label>
          <label>Icon <input value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })} /></label>
          <button className="btn btn-primary btn-sm" disabled={busy || !editing.name.trim()}>Save</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
        </form>
      )}
      <form className="inline-form" onSubmit={handleAdd}>
        <input value={icon} onChange={e => setIcon(e.target.value)} style={{ width: 60 }} aria-label="Icon" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New department name" required />
        <select value={kind} onChange={e => setKind(e.target.value)}>
          <option value="department">Department</option>
          <option value="elective">Elective group</option>
        </select>
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>Add</button>
      </form>
    </>
  )
}

function GradesSection({ grades, courses, busy, run, archiveToggle }) {
  const [name, setName] = useState('')
  const [stage, setStage] = useState('elementary')

  async function handleAdd(e) {
    e.preventDefault()
    const maxOrder = grades.reduce((m, g) => Math.max(m, g.sort_order), -1)
    const ok = await run(supabase.from('grades').insert({ name: name.trim(), stage, sort_order: maxOrder + 1 }))
    if (ok) setName('')
  }

  function rename(g) {
    const next = prompt('Grade name', g.name)
    if (next && next.trim() && next.trim() !== g.name) {
      run(supabase.from('grades').update({ name: next.trim() }).eq('id', g.id))
    }
  }

  async function handleDelete(g) {
    const count = courses.filter(c => c.grade_id === g.id).length
    if (count) {
      window.alert(`Cannot delete "${g.name}": ${count} course(s) use this grade. Delete or move those courses first.`)
      return
    }
    const typed = window.prompt(`Permanently delete grade "${g.name}"? This cannot be undone.\n\nType the grade name to confirm:`)
    if (typed === null) return
    if (typed.trim() !== g.name) { window.alert('The name did not match. Nothing was deleted.'); return }
    await run(supabase.from('grades').delete().eq('id', g.id), 'Grade deleted')
  }

  function changeStage(g, stage) {
    if (stage === g.stage) return
    if (!window.confirm(`Change "${g.name}" to ${STAGE_LABELS[stage]}? Its courses move to this stage, changing stage-head access.`)) return
    run(supabase.from('grades').update({ stage }).eq('id', g.id))
  }

  return (
    <>
      <div className="section-title-row"><h3>Grades</h3></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Grade</th><th>Stage</th><th></th></tr></thead>
          <tbody>
            {grades.map(g => (
              <tr key={g.id} className={g.archived_at ? 'row-archived' : ''}>
                <td>{g.name}{g.archived_at ? ' (archived)' : ''}</td>
                <td>
                  <select
                    value={g.stage}
                    disabled={busy}
                    onChange={e => changeStage(g, e.target.value)}
                    aria-label={`Stage for ${g.name}`}
                  >
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                </td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => rename(g)}>Rename</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => archiveToggle('grades', g)}>
                      {g.archived_at ? 'Restore' : 'Archive'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => handleDelete(g)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline-form" onSubmit={handleAdd}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New grade name" required />
        <select value={stage} onChange={e => setStage(e.target.value)}>
          {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>Add grade</button>
      </form>
    </>
  )
}

function CoursesSection({ departments, grades, courses, gradeById, deptById, busy, run, archiveToggle }) {
  const regularDepts = departments.filter(d => d.kind === 'department' && !d.archived_at)
  const electiveDepts = departments.filter(d => d.kind === 'elective' && !d.archived_at)
  const activeGrades = grades.filter(g => !g.archived_at)

  const [deptId, setDeptId] = useState('')
  const [selectedGrades, setSelectedGrades] = useState([])
  const [elDeptId, setElDeptId] = useState('')
  const [elName, setElName] = useState('')
  const [elStage, setElStage] = useState('high')
  const [editing, setEditing] = useState(null)

  const existingGradeIds = new Set(courses.filter(c => c.department_id === deptId).map(c => c.grade_id))
  const addable = activeGrades.filter(g => !existingGradeIds.has(g.id))

  function toggleGrade(id) {
    setSelectedGrades(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleAddCourses(e) {
    e.preventDefault()
    const rows = selectedGrades.map(gid => ({
      department_id: deptId, grade_id: gid, stage: gradeById.get(gid).stage,
    }))
    const ok = await run(supabase.from('courses').insert(rows))
    if (ok) setSelectedGrades([])
  }

  async function handleAddElective(e) {
    e.preventDefault()
    const ok = await run(supabase.from('courses').insert({
      department_id: elDeptId, name: elName.trim(), stage: elStage,
    }))
    if (ok) setElName('')
  }

  function startEdit(c) {
    setEditing({ id: c.id, department_id: c.department_id, grade_id: c.grade_id, name: c.name ?? '', stage: c.stage })
  }

  async function saveEdit(e) {
    e.preventDefault()
    const original = courses.find(c => c.id === editing.id)
    if (!original) { window.alert('This course no longer exists.'); return }
    const moving = original.department_id !== editing.department_id || original.grade_id !== editing.grade_id ||
      (!original.grade_id && original.stage !== editing.stage)
    if (moving && !window.confirm('Moving this course keeps its curricula, plans and assignments with it, and may change stage-head access. Continue?')) return
    const updates = original.grade_id
      ? { department_id: editing.department_id, grade_id: editing.grade_id }
      : { department_id: editing.department_id, name: editing.name.trim(), stage: editing.stage }
    const ok = await run(supabase.from('courses').update(updates).eq('id', editing.id))
    if (ok) setEditing(null)
  }

  async function handleDelete(c) {
    const label = `${deptById.get(c.department_id)?.name ?? 'Department'} - ${courseLabel(c, gradeById)}`
    const typed = window.prompt(
      `PERMANENTLY delete "${label}"?\n\nThis also deletes its official and saved curriculum versions, working copies, ` +
      `comments, weekly plans, lesson periods, assignments and notifications. This cannot be undone.\n\nType the course name "${courseLabel(c, gradeById)}" to confirm:`
    )
    if (typed === null) return
    if (typed.trim() !== courseLabel(c, gradeById)) { window.alert('The name did not match. Nothing was deleted.'); return }
    const ok = await run(supabase.rpc('delete_course', { p_course: c.id }), 'Course deleted')
    if (ok && editing?.id === c.id) setEditing(null)
  }

  const sorted = [...courses].sort((a, b) =>
    (deptById.get(a.department_id)?.name ?? '').localeCompare(deptById.get(b.department_id)?.name ?? '') ||
    (gradeById.get(a.grade_id)?.sort_order ?? 999) - (gradeById.get(b.grade_id)?.sort_order ?? 999) ||
    courseLabel(a, gradeById).localeCompare(courseLabel(b, gradeById))
  )

  return (
    <>
      <div className="section-title-row"><h3>Courses</h3></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Department</th><th>Grade / Elective</th><th>Stage</th><th></th></tr></thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.id} className={c.archived_at ? 'row-archived' : ''}>
                <td>{deptById.get(c.department_id)?.name}</td>
                <td>{courseLabel(c, gradeById)}{c.archived_at ? ' (archived)' : ''}</td>
                <td>{STAGE_LABELS[c.stage]}</td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => startEdit(c)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => archiveToggle('courses', c)}>
                      {c.archived_at ? 'Restore' : 'Archive'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => handleDelete(c)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {courses.length === 0 && <tr><td colSpan={4} className="muted">No courses yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="card">
          <h3>Edit course</h3>
          <form className="curriculum-form" onSubmit={saveEdit}>
            <label>
              {editing.grade_id ? 'Department' : 'Elective group'}
              <select value={editing.department_id} onChange={e => setEditing({ ...editing, department_id: e.target.value })} required>
                {departments.filter(d => d.kind === (editing.grade_id ? 'department' : 'elective') && (!d.archived_at || d.id === editing.department_id))
                  .map(d => <option key={d.id} value={d.id}>{d.name}{d.archived_at ? ' (archived)' : ''}</option>)}
              </select>
            </label>
            {editing.grade_id ? (
              <label>
                Grade
                <select value={editing.grade_id} onChange={e => setEditing({ ...editing, grade_id: e.target.value })} required>
                  {grades.filter(g => !g.archived_at || g.id === editing.grade_id)
                    .map(g => <option key={g.id} value={g.id}>{g.name}{g.archived_at ? ' (archived)' : ''}</option>)}
                </select>
              </label>
            ) : (
              <>
                <label>Elective name <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required /></label>
                <label>
                  Stage
                  <select value={editing.stage} onChange={e => setEditing({ ...editing, stage: e.target.value })}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                </label>
              </>
            )}
            <div className="form-actions">
              <button className="btn btn-primary" disabled={busy || (!editing.grade_id && !editing.name.trim())}>Save</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Add grades to a department</h3>
        <form className="curriculum-form" onSubmit={handleAddCourses}>
          <label>
            Department
            <select value={deptId} onChange={e => { setDeptId(e.target.value); setSelectedGrades([]) }} required>
              <option value="">Select…</option>
              {regularDepts.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>
          </label>
          {deptId && (
            <div>
              <span className="field-label">Grades</span>
              <div className="subject-checkboxes">
                {addable.map(g => (
                  <label key={g.id} className="checkbox-pill">
                    <input type="checkbox" checked={selectedGrades.includes(g.id)} onChange={() => toggleGrade(g.id)} />
                    {g.name}
                  </label>
                ))}
                {addable.length === 0 && <span className="muted">All grades are already added.</span>}
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || selectedGrades.length === 0}>Add courses</button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Add an elective</h3>
        <form className="curriculum-form" onSubmit={handleAddElective}>
          <label>
            Elective group
            <select value={elDeptId} onChange={e => setElDeptId(e.target.value)} required>
              <option value="">Select…</option>
              {electiveDepts.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>
          </label>
          <label>
            Elective name
            <input value={elName} onChange={e => setElName(e.target.value)} required />
          </label>
          <label>
            Stage
            <select value={elStage} onChange={e => setElStage(e.target.value)}>
              {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </label>
          {electiveDepts.length === 0 && <p className="muted">Create a department of type “Elective group” first.</p>}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy || !elDeptId || !elName.trim()}>Add elective</button>
          </div>
        </form>
      </div>
    </>
  )
}
