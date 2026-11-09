import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { courseLabel, isReviewer, isCourseArchived } from '../access'
import { STAGE_LABELS } from '../stageUtils'
import { fetchAll } from '../supabasePagination'

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function latestWeek(now) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(now))
  const sunday = addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay())
  return addDays(sunday, 4) < today ? sunday : addDays(sunday, -7)
}

function cairoDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(value))
}

export default function ReportsDashboard({ profile, assignments, courses, departments, grades, onOpenVersion }) {
  const [now] = useState(() => Date.now())
  const [week, setWeek] = useState(() => latestWeek(now))
  const [stage, setStage] = useState('')
  const [department, setDepartment] = useState('')
  const [teacher, setTeacher] = useState('')
  const [data, setData] = useState({ loading: true })
  const gradeById = useMemo(() => new Map(grades.map(g => [g.id, g])), [grades])
  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const scoped = useMemo(() => courses.filter(c => isReviewer(profile, assignments, c) &&
    !isCourseArchived(c, gradeById, deptById)), [courses, profile, assignments, gradeById, deptById])
  const scopedIds = useMemo(() => scoped.map(c => c.id).sort(), [scoped])
  const scopeKey = JSON.stringify(scopedIds)

  useEffect(() => {
    let cancelled = false
    const ids = JSON.parse(scopeKey)
    async function load() {
      if (!ids.length) { if (!cancelled) setData({ loading: false, assignments: [], plans: [], reviews: [], official: [], profiles: [], events: [] }); return }
      try {
        const [assigns, plans, reviews, official, events] = await Promise.all([
          fetchAll(() => supabase.from('course_assignments').select('course_id,user_id,kind').in('course_id', ids).eq('kind', 'teacher').order('course_id').order('user_id')),
          fetchAll(() => supabase.from('weekly_plans').select('id,course_id,teacher_id,date_from,date_to,created_at').in('course_id', ids).order('id')),
          fetchAll(() => supabase.from('curriculum_reviews').select('version_id,status,submitted_at,migrated,curriculum_versions!inner(course_id,name,version_number,author_id,change_summary)').in('curriculum_versions.course_id', ids).order('version_id')),
          fetchAll(() => supabase.from('official_versions').select('course_id,version_id,set_at').in('course_id', ids).order('course_id')),
          fetchAll(() => supabase.from('curriculum_review_events').select('id,version_id,action,actor_id,created_at,curriculum_versions!inner(course_id,author_id)').in('curriculum_versions.course_id', ids).order('id')),
        ])
        const personIds = [...new Set([...assigns.map(a => a.user_id), ...reviews.map(r => r.curriculum_versions.author_id), ...events.map(e => e.actor_id).filter(Boolean)])]
        const profiles = personIds.length
          ? await fetchAll(() => supabase.from('profiles').select('id,full_name,email,active').in('id', personIds).order('id'))
          : []
        if (!cancelled) setData({ loading: false, assignments: assigns, plans, reviews, official, profiles, events })
      } catch (error) {
        if (!cancelled) setData({ loading: false, error: error.message })
      }
    }
    load()
    return () => { cancelled = true }
  }, [scopeKey])

  if (data.loading) return <p className="muted">Loading dashboard…</p>
  if (data.error) return <p className="error">Could not load dashboard: {data.error}</p>

  const people = new Map(data.profiles.map(p => [p.id, p]))
  const selected = scoped.filter(c => (!stage || c.stage === stage) && (!department || c.department_id === department))
  const selectedIds = new Set(selected.map(c => c.id))
  const teacherIds = [...new Set(data.assignments.filter(a => selectedIds.has(a.course_id) && people.get(a.user_id)?.active).map(a => a.user_id))]
  const visibleTeachers = teacherIds.filter(id => !teacher || id === teacher)
  const teacherCourses = new Set(data.assignments.filter(a => visibleTeachers.includes(a.user_id) && selectedIds.has(a.course_id)).map(a => a.course_id))
  const visibleCourses = teacher ? selected.filter(c => teacherCourses.has(c.id)) : selected
  const visibleIds = new Set(visibleCourses.map(c => c.id))
  const name = id => people.get(id)?.full_name || people.get(id)?.email || 'Unknown user'
  const title = c => `${deptById.get(c.department_id)?.name ?? 'Department'} — ${courseLabel(c, gradeById)}`
  const status = (id, start) => {
    const end = addDays(start, 4)
    const plans = data.plans.filter(p => p.teacher_id === id && visibleIds.has(p.course_id) && p.date_from <= end && p.date_to >= start)
    if (!plans.length) return 'missed'
    return plans.some(p => cairoDate(p.created_at) <= end) ? 'on time' : 'late'
  }
  const pending = data.reviews.filter(r => r.status === 'pending' && visibleIds.has(r.curriculum_versions.course_id) &&
    (!teacher || r.curriculum_versions.author_id === teacher))
  const official = new Map(data.official.map(o => [o.course_id, o]))
  const validWeek = /^\d{4}-\d{2}-\d{2}$/.test(week) && new Date(`${week}T00:00:00Z`).getUTCDay() === 0 && week <= latestWeek(now)
  const safeWeek = validWeek ? week : latestWeek(now)
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(safeWeek, (i - 7) * 7))
  const submitted = visibleTeachers.filter(id => status(id, safeWeek) !== 'missed').length
  const late = visibleTeachers.filter(id => status(id, safeWeek) === 'late').length
  const missedTwice = visibleTeachers.filter(id => status(id, safeWeek) === 'missed' && status(id, addDays(safeWeek, -7)) === 'missed').length
  const events = data.events.filter(e => visibleIds.has(e.curriculum_versions.course_id) &&
    (!teacher || e.curriculum_versions.author_id === teacher))
  const approvedMonth = events.filter(e => e.action === 'approved' &&
    cairoDate(e.created_at).slice(0, 7) === cairoDate(now).slice(0, 7)).length
  const lastSubmitted = new Map()
  const durations = []
  for (const event of events) {
    if (event.action === 'submitted') lastSubmitted.set(event.version_id, new Date(event.created_at))
    if (event.action === 'approved' && lastSubmitted.has(event.version_id)) {
      durations.push((new Date(event.created_at) - lastSubmitted.get(event.version_id)) / 86400000)
      lastSubmitted.delete(event.version_id)
    }
    if (event.action === 'returned') lastSubmitted.delete(event.version_id)
  }
  const oldest = pending.length ? Math.max(...pending.map(r => Math.max(0, Math.floor((now - new Date(r.submitted_at)) / 86400000)))) : 0
  const approvalCounts = new Map()
  for (const event of events) {
    if (event.action === 'approved' && cairoDate(event.created_at).slice(0, 7) === cairoDate(now).slice(0, 7)) {
      const id = event.actor_id
      approvalCounts.set(id, (approvalCounts.get(id) ?? 0) + 1)
    }
  }
  const columns = [...new Map(visibleCourses.map(c => [
    c.grade_id || c.id,
    { id: c.grade_id || c.id, label: courseLabel(c, gradeById), order: gradeById.get(c.grade_id)?.sort_order ?? 999 },
  ])).values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  const visibleDepartments = departments.filter(d => visibleCourses.some(c => c.department_id === d.id))
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)

  return (
    <div className="dashboard">
      <div className="dashboard-filters card">
        <label>Week starting Sunday<input type="date" value={week} onChange={e => setWeek(e.target.value)} /></label>
        <label>Stage<select value={stage} onChange={e => { setStage(e.target.value); setDepartment(''); setTeacher('') }}><option value="">All available stages</option>{Object.entries(STAGE_LABELS).filter(([id]) => scoped.some(c => c.stage === id)).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Department<select value={department} onChange={e => { setDepartment(e.target.value); setTeacher('') }}><option value="">All available departments</option>{departments.filter(d => scoped.some(c => c.department_id === d.id && (!stage || c.stage === stage))).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Teacher<select value={teacher} onChange={e => setTeacher(e.target.value)}><option value="">All assigned teachers</option>{teacherIds.map(id => <option key={id} value={id}>{name(id)}</option>)}</select></label>
      </div>
      {!validWeek ? <p className="error">Choose a Sunday from a completed week.</p> : (
        <>
          <div className="dashboard-cards">
            <div className="card"><strong>{pending.length}</strong><span>Versions awaiting review</span></div>
            <div className="card"><strong>{missedTwice}</strong><span>Teachers missing two weeks</span></div>
            <div className="card"><strong>{visibleCourses.filter(c => !official.has(c.id)).length}</strong><span>Courses without an Official curriculum</span></div>
            <div className="card"><strong>{late}</strong><span>Teachers with late plans</span></div>
          </div>
          <section className="card dashboard-section">
            <h3>Weekly plan compliance</h3>
            <p className="muted">At least one plan within the selected scope counts per teacher. Late means first created after Thursday, Cairo time. Historical results use current assignments; past assignment changes are not recorded.</p>
            <p><strong className="dashboard-kpi">{visibleTeachers.length ? Math.round(submitted / visibleTeachers.length * 100) : '—'}{visibleTeachers.length ? '%' : ''}</strong> {submitted} of {visibleTeachers.length} teachers submitted</p>
            <div className="dashboard-trend" aria-label="Eight-week compliance trend">
              {weeks.map(w => {
                const percent = visibleTeachers.length ? Math.round(100 * visibleTeachers.filter(id => status(id, w) !== 'missed').length / visibleTeachers.length) : 0
                return <div key={w}><div className="dashboard-bar"><span style={{ height: `${percent}%` }} /></div><strong>{visibleTeachers.length ? `${percent}%` : '—'}</strong><small>{w.slice(5)}</small></div>
              })}
            </div>
            <div className="report-table-wrap"><table className="data-table"><thead><tr><th>Teacher</th>{weeks.map(w => <th key={w}>{w}</th>)}</tr></thead><tbody>
              {visibleTeachers.map(id => <tr key={id}><td>{name(id)}</td>{weeks.map(w => <td key={w} className={status(id, w) === 'missed' ? 'status-missing' : 'status-ok'}>{status(id, w)}</td>)}</tr>)}
            </tbody></table></div>
            {!visibleTeachers.length && <p className="muted">No active teachers assigned in this scope.</p>}
          </section>
          <section className="card dashboard-section">
            <h3>Curriculum health</h3>
            <p className="muted">Official curricula and versions currently awaiting review. Historical review dates before this feature are unavailable.</p>
            <p><strong className="dashboard-kpi">{visibleCourses.length ? Math.round(100 * visibleCourses.filter(c => official.has(c.id)).length / visibleCourses.length) : '—'}{visibleCourses.length ? '%' : ''}</strong> of courses have an Official curriculum</p>
            <p className="muted">Completeness percentages are not available: required curriculum sections have not been defined.</p>
            <div className="report-table-wrap"><table className="data-table dashboard-matrix"><thead><tr><th>Department</th>{columns.map(col => <th key={col.id}>{col.label}</th>)}</tr></thead><tbody>
              {visibleDepartments.map(d => <tr key={d.id}><th>{d.name}</th>{columns.map(col => {
                const c = visibleCourses.find(item => item.department_id === d.id && (item.grade_id || item.id) === col.id)
                if (!c) return <td key={col.id}>—</td>
                const current = official.get(c.id)
                const review = pending.find(item => item.curriculum_versions.course_id === c.id)
                const label = current ? 'Official' : review ? 'Pending' : 'Empty'
                const old = current && new Date(current.set_at) < cutoff
                return <td key={col.id}><span className={`dashboard-cell ${current ? 'official' : review ? 'pending' : 'empty'}`}>{label}{old ? ' *' : ''}</span></td>
              })}</tr>)}
            </tbody></table></div>
            <p className="muted">* Official version unchanged for over 12 months. A pending review can exist alongside an Official version.</p>
            <div className="report-table-wrap"><table className="data-table"><thead><tr><th>Course</th><th>Official curriculum</th><th>Pending reviews</th></tr></thead><tbody>
              {visibleCourses.map(c => <tr key={c.id}><td>{title(c)}</td><td>{official.has(c.id) ? `Official since ${cairoDate(official.get(c.id).set_at)}` : 'None'}</td><td>{pending.filter(r => r.curriculum_versions.course_id === c.id).length}</td></tr>)}
            </tbody></table></div>
            {!visibleCourses.length && <p className="muted">No courses in this scope.</p>}
          </section>
          <section className="card dashboard-section">
            <h3>Review pipeline</h3>
            <p className="muted">{approvedMonth} approvals recorded this month · {oldest} days oldest pending · {durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : '—'} days average from submission to approval.</p>
            <p className="muted">Approval does not automatically make a version Official. Earlier approvals and imported submission times were not recorded; imported pending items use the version creation date.</p>
            {pending.length ? <div className="report-table-wrap"><table className="data-table"><thead><tr><th>Course / version</th><th>Author</th><th>Submitted</th><th></th></tr></thead><tbody>
              {pending.map(r => { const c = visibleCourses.find(item => item.id === r.curriculum_versions.course_id); return <tr key={r.version_id}><td>{title(c)} — v{r.curriculum_versions.version_number} {r.curriculum_versions.name}</td><td>{name(r.curriculum_versions.author_id)}</td><td>{cairoDate(r.submitted_at)}{r.migrated ? ' (imported)' : ''}</td><td><button className="btn btn-ghost btn-sm" onClick={() => onOpenVersion(c.id, r.version_id)}>Review</button></td></tr> })}
            </tbody></table></div> : <p className="muted">No versions awaiting review in this scope.</p>}
            <h4>Approvals this month by reviewer</h4>
            {approvalCounts.size ? <ul>{[...approvalCounts].map(([id, count]) => <li key={id ?? 'deleted'}>{name(id)}: {count}</li>)}</ul> : <p className="muted">No approvals recorded this month.</p>}
          </section>
        </>
      )}
    </div>
  )
}
