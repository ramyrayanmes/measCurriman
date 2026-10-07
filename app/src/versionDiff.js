// src/versionDiff.js

const CURRICULUM_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'academic_year', label: 'Academic Year' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'standards', label: 'Standards' },
]

const PLAN_HEADER_FIELDS = [
  { key: 'semester', label: 'Semester' },
  { key: 'week_number', label: 'Week Number' },
  { key: 'date_from', label: 'Date From' },
  { key: 'date_to', label: 'Date To' },
  { key: 'grade_level', label: 'Grade Level' },
]

const PERIOD_FIELDS = [
  { key: 'class_section', label: 'Class/Section' },
  { key: 'lesson_date', label: 'Date' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'description_of_lesson', label: 'Description of Lesson' },
  { key: 'book_pages', label: 'Book & Pages' },
  { key: 'materials_resources', label: 'Materials/Resources' },
  { key: 'differentiation', label: 'Differentiation' },
  { key: 'reflection', label: 'Reflection' },
  { key: 'classwork', label: 'Classwork' },
  { key: 'homework', label: 'Homework' },
]

function periodLabel(p) {
  return p?.class_section || p?.class_and_date || 'period'
}

export function diffCurricula(oldSnap, newSnap) {
  const changes = []
  for (const { key, label } of CURRICULUM_FIELDS) {
    const oldVal = oldSnap?.[key] ?? ''
    const newVal = newSnap?.[key] ?? ''
    if (oldVal !== newVal) {
      changes.push({ label, oldVal, newVal })
    }
  }
  return changes
}

export function diffWeeklyPlan(oldSnap, newSnap) {
  const changes = []
  const oldPlan = oldSnap?.plan ?? oldSnap ?? {}
  const newPlan = newSnap?.plan ?? newSnap ?? {}

  for (const { key, label } of PLAN_HEADER_FIELDS) {
    const oldVal = oldPlan?.[key] ?? ''
    const newVal = newPlan?.[key] ?? ''
    if (String(oldVal) !== String(newVal)) {
      changes.push({ label, oldVal, newVal })
    }
  }

  const oldPeriods = oldSnap?.periods ?? []
  const newPeriods = newSnap?.periods ?? []
  const oldIds = new Set(oldPeriods.map(p => p.id))
  const newIds = new Set(newPeriods.map(p => p.id))

  for (const p of newPeriods) {
    if (!oldIds.has(p.id)) {
      changes.push({ label: `New class period added`, oldVal: '', newVal: periodLabel(p) })
    }
  }
  for (const p of oldPeriods) {
    if (!newIds.has(p.id)) {
      changes.push({ label: `Class period removed`, oldVal: periodLabel(p), newVal: '' })
    }
  }
  for (const newP of newPeriods) {
    const oldP = oldPeriods.find(p => p.id === newP.id)
    if (!oldP) continue
    for (const { key, label } of PERIOD_FIELDS) {
      const oldVal = oldP?.[key] ?? ''
      const newVal = newP?.[key] ?? ''
      if (oldVal !== newVal) {
        changes.push({ label: `[${periodLabel(newP)}] ${label}`, oldVal, newVal })
      }
    }
    const oldBlooms = (oldP?.blooms_levels ?? []).sort().join(',')
    const newBlooms = (newP?.blooms_levels ?? []).sort().join(',')
    if (oldBlooms !== newBlooms) {
      changes.push({
        label: `[${periodLabel(newP)}] Bloom's Levels`,
        oldVal: oldP?.blooms_levels?.join(', ') ?? '',
        newVal: newP?.blooms_levels?.join(', ') ?? '',
      })
    }
  }

  return changes
}

export { CURRICULUM_FIELDS, PLAN_HEADER_FIELDS, PERIOD_FIELDS }
