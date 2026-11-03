// src/Shell.jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Brand from './components/Brand'
import Sidebar from './components/Sidebar'
import CoursePanel from './components/CoursePanel'
import ManageDepartments from './components/ManageDepartments'
import UsersManager from './components/UsersManager'
import ReportsPanel from './components/ReportsPanel'
import { LOGO_URL } from './branding'
import NotificationsPanel from './components/NotificationsPanel'
import ChangePasswordPanel from './components/ChangePasswordPanel'
import { roleLabel } from './stageUtils'
import { isAdmin, isReviewer, canEditCourse, roleChipClass } from './access'

const MOBILE_QUERY = '(max-width: 900px)'

export default function Shell({ session, profile }) {
  const userId = session.user.id
  const admin = isAdmin(profile)

  const [grades, setGrades] = useState([])
  const [departments, setDepartments] = useState([])
  const [courses, setCourses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [view, setView] = useState('courses')
  const [courseId, setCourseId] = useState(null)
  const [target, setTarget] = useState(null) // deep link from a notification: { versionId, nonce }
  const [collapsed, setCollapsed] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('grades').select('*').order('sort_order'),
      supabase.from('departments').select('*').order('sort_order').order('name'),
      supabase.from('courses').select('*'),
      supabase.from('course_assignments').select('course_id, kind').eq('user_id', userId),
    ]).then(([g, d, c, a]) => {
      if (cancelled) return
      const failed = [g, d, c, a].find(r => r.error)
      if (failed) { setError(failed.error.message); setLoading(false); return }
      setGrades(g.data)
      setDepartments(d.data)
      setCourses(c.data)
      setAssignments(a.data)
      setError(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId, reloadTick])

  // Called after admin edits so the sidebar and lists refresh.
  const loadStructure = useCallback(() => setReloadTick(t => t + 1), [])

  const gradeById = useMemo(() => new Map(grades.map(x => [x.id, x])), [grades])
  const deptById = useMemo(() => new Map(departments.map(x => [x.id, x])), [departments])
  const course = courses.find(x => x.id === courseId) ?? null

  function selectCourse(id) {
    setTarget(null)
    setCourseId(id)
    setView('courses')
    if (window.matchMedia(MOBILE_QUERY).matches) setCollapsed(true)
  }

  function openNotification(n) {
    if (!n.course_id || !courses.some(c => c.id === n.course_id)) return false
    setCourseId(n.course_id)
    setView('courses')
    setTarget({
      versionId: n.related_table === 'curriculum_versions' ? n.related_id : null,
      nonce: Date.now(),
    })
    if (window.matchMedia(MOBILE_QUERY).matches) setCollapsed(true)
    return true
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const sidebarVisible = view === 'courses' && !collapsed
  const hasCourses = courses.length > 0

  return (
    <>
      <header className="app-header">
        <div className="header-brand">
          <img src={LOGO_URL} alt="MEAS" />
          <span className="brand-text"><Brand onDark /></span>
        </div>

        <nav className="header-nav">
          <button className={`nav-tab${view === 'courses' ? ' active' : ''}`} onClick={() => setView('courses')}>
            📚 <span className="nav-label">Curricula</span>
          </button>
          {admin && (
            <button className={`nav-tab admin-tab${view === 'manage' ? ' active' : ''}`} onClick={() => setView('manage')}>
              ⚙ <span className="nav-label">Manage</span>
            </button>
          )}
          {admin && (
            <button className={`nav-tab admin-tab${view === 'users' ? ' active' : ''}`} onClick={() => setView('users')}>
              👥 <span className="nav-label">Users</span>
            </button>
          )}
          {admin && (
            <button className={`nav-tab admin-tab${view === 'reports' ? ' active' : ''}`} onClick={() => setView('reports')}>
              📊 <span className="nav-label">Reports</span>
            </button>
          )}
        </nav>

        <div className="header-right">
          <NotificationsPanel userId={userId} onOpen={openNotification} />
          <div className="user-badge">
            <span className="user-name">{profile.full_name || session.user.email}</span>
            <span className={`role-chip ${roleChipClass(profile.role)}`}>{roleLabel(profile.role)}</span>
          </div>
          <ChangePasswordPanel />
          <button className="link-button" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <div className="app-body">
        {view === 'courses' && (
          <>
            <Sidebar
              collapsed={collapsed}
              departments={departments}
              courses={courses}
              grades={grades}
              selectedId={courseId}
              onSelect={selectCourse}
              showArchived={admin}
            />
            <button
              className={`sidebar-toggle${collapsed ? ' collapsed' : ''}`}
              onClick={() => setCollapsed(c => !c)}
              aria-label="Toggle sidebar"
            >
              {collapsed ? '›' : '‹'}
            </button>
          </>
        )}

        <main className={`main${sidebarVisible ? '' : ' expanded'}`}>
          {error && <p className="error">{error}</p>}
          {loading && <p className="muted">Loading…</p>}

          {!loading && view === 'manage' && admin && (
            <ManageDepartments
              grades={grades}
              departments={departments}
              courses={courses}
              onChanged={loadStructure}
            />
          )}

          {!loading && view === 'users' && admin && (
            <UsersManager departments={departments} courses={courses} grades={grades} currentUserId={userId} />
          )}

          {!loading && view === 'reports' && admin && <ReportsPanel />}

          {!loading && view === 'courses' && (
            course ? (
              <CoursePanel
                key={`${course.id}:${target?.nonce ?? 0}`}
                initialVersionId={target?.versionId ?? null}
                course={course}
                department={deptById.get(course.department_id)}
                gradeById={gradeById}
                userId={userId}
                isAdmin={admin}
                isAuditor={profile.role === 'auditor'}
                reviewer={isReviewer(profile, assignments, course)}
                canEdit={canEditCourse(profile, assignments, course)}
              />
            ) : (
              <div className="welcome">
                <span className="wi">🏫</span>
                <h2>Welcome{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h2>
                {hasCourses ? (
                  <p>Pick a department and grade from the sidebar to open its curriculum and weekly plans.</p>
                ) : admin ? (
                  <p>There are no departments or courses yet. Open <strong>Manage</strong> to create your departments and grade courses.</p>
                ) : (
                  <p>No departments or grades have been assigned to you yet. Please contact an administrator.</p>
                )}
              </div>
            )
          )}
        </main>
      </div>
    </>
  )
}
