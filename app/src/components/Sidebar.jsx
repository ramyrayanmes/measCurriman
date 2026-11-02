// src/components/Sidebar.jsx
import { useMemo, useState } from 'react'
import { courseLabel, isCourseArchived } from '../access'

export default function Sidebar({
  collapsed, departments, courses, grades, selectedId, onSelect, showArchived,
}) {
  const [search, setSearch] = useState('')
  const [closedDepts, setClosedDepts] = useState(() => new Set())
  const [openArchived, setOpenArchived] = useState(() => new Set())

  const gradeById = useMemo(() => new Map(grades.map(g => [g.id, g])), [grades])
  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])

  const q = search.trim().toLowerCase()

  const groups = useMemo(() => {
    const sortCourses = (a, b) =>
      (gradeById.get(a.grade_id)?.sort_order ?? 999) - (gradeById.get(b.grade_id)?.sort_order ?? 999) ||
      courseLabel(a, gradeById).localeCompare(courseLabel(b, gradeById))

    return departments.map(dept => {
      const all = courses.filter(c => c.department_id === dept.id).sort(sortCourses)
      const deptMatches = q && dept.name.toLowerCase().includes(q)
      const matching = q && !deptMatches
        ? all.filter(c => courseLabel(c, gradeById).toLowerCase().includes(q))
        : all
      const archivedDept = Boolean(dept.archived_at)
      return {
        dept,
        archivedDept,
        active: matching.filter(c => !isCourseArchived(c, gradeById, deptById)),
        archived: matching.filter(c => isCourseArchived(c, gradeById, deptById)),
        matched: !q || matching.length > 0 || deptMatches,
      }
    }).filter(g => g.matched && (showArchived || (!g.archivedDept && g.active.length > 0)))
  }, [departments, courses, gradeById, deptById, q, showArchived])

  const liveGroups = groups.filter(g => !g.archivedDept)
  const archivedGroups = groups.filter(g => g.archivedDept)
  const departmentGroups = liveGroups.filter(g => g.dept.kind === 'department')
  const electiveGroups = liveGroups.filter(g => g.dept.kind === 'elective')

  function toggle(set, setter, id) {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function renderGroup(g, forceArchived = false) {
    const selectedHere = [...g.active, ...g.archived].some(c => c.id === selectedId)
    const open = Boolean(q) || selectedHere || !closedDepts.has(g.dept.id)
    const items = forceArchived ? [...g.active, ...g.archived] : g.active
    return (
      <div key={g.dept.id} className="dept-group">
        <div className={`dept-header${open ? ' open' : ''}`} onClick={() => toggle(closedDepts, setClosedDepts, g.dept.id)}>
          <span className="dept-chevron">▶</span>
          <span>{g.dept.icon}</span>
          <span>{g.dept.name}</span>
          <span className="dept-count">{items.length}</span>
        </div>
        {open && (
          <div>
            {items.map(c => (
              <div
                key={c.id}
                className={`grade-item${c.id === selectedId ? ' active' : ''}${forceArchived ? ' archived' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                {courseLabel(c, gradeById)}
              </div>
            ))}
            {items.length === 0 && <div className="grade-item archived">No grades yet</div>}
            {!forceArchived && showArchived && g.archived.length > 0 && (
              <>
                <div className="archived-header" onClick={() => toggle(openArchived, setOpenArchived, g.dept.id)}>
                  {openArchived.has(g.dept.id) ? '▾' : '▸'} Archived ({g.archived.length})
                </div>
                {openArchived.has(g.dept.id) && g.archived.map(c => (
                  <div
                    key={c.id}
                    className={`grade-item archived${c.id === selectedId ? ' active' : ''}`}
                    onClick={() => onSelect(c.id)}
                  >
                    {courseLabel(c, gradeById)}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-search">
        <input
          type="search"
          placeholder="Search departments or grades…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {departmentGroups.length > 0 && <div className="sidebar-label">Departments</div>}
      {departmentGroups.map(g => renderGroup(g))}

      {electiveGroups.length > 0 && <div className="sidebar-label">Electives</div>}
      {electiveGroups.map(g => renderGroup(g))}

      {archivedGroups.length > 0 && <div className="sidebar-label">Archived</div>}
      {archivedGroups.map(g => renderGroup(g, true))}

      {groups.length === 0 && (
        <div className="sidebar-empty">
          {q ? 'No matches.' : 'Nothing here yet.'}
        </div>
      )}
    </aside>
  )
}
