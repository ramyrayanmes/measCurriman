// src/access.js
//
// Client-side mirror of the SQL access helpers (can_review / can_edit).
// This only decides what the UI shows; row level security enforces the rules.

export function isAdmin(profile) {
  return profile?.role === 'admin'
}

export function isReviewer(profile, assignments, course) {
  if (!profile || !course) return false
  if (profile.role === 'admin') return true
  if (profile.role === `head_${course.stage}`) return true
  return assignments.some(a => a.course_id === course.id && a.kind === 'dept_head')
}

export function canEditCourse(profile, assignments, course) {
  if (!profile || !course || profile.role === 'auditor') return false
  if (isReviewer(profile, assignments, course)) return true
  return assignments.some(a => a.course_id === course.id && a.kind === 'teacher')
}

export function roleChipClass(role) {
  if (role === 'admin') return 'r-admin'
  if (role === 'teacher') return 'r-teacher'
  if (role === 'auditor') return 'r-auditor'
  return 'r-hod'
}

// Sidebar / title label for a course.
export function courseLabel(course, gradeById) {
  return course.name ?? gradeById.get(course.grade_id)?.name ?? 'Course'
}

// A course is hidden from normal use when it, its grade or its department is archived.
export function isCourseArchived(course, gradeById, deptById) {
  return Boolean(
    course.archived_at ||
    gradeById.get(course.grade_id)?.archived_at ||
    deptById.get(course.department_id)?.archived_at
  )
}
