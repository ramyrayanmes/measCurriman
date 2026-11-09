export function isCourseInReviewScope(course, scope, assignments) {
  return scope.role === `head_${course.stage}` || assignments.some(assignment =>
    assignment.user_id === scope.userId && assignment.course_id === course.id && assignment.kind === 'dept_head')
}

export function teacherCompliance(reports) {
  const plans = new Map()
  for (const report of reports) {
    for (const plan of report.course_plans) {
      plans.set(plan.teacher_id, [...(plans.get(plan.teacher_id) ?? []), plan])
    }
  }
  return reports.map(({ course_plans: _coursePlans, ...report }) => ({
    ...report,
    teachers: report.teachers.map(teacher => ({
      ...teacher,
      submitted: (plans.get(teacher.id) ?? []).length > 0,
      plans: plans.get(teacher.id) ?? [],
    })),
  }))
}
