// src/curriculumDiff.js
import { GRADING_COLS, OUTLINE_COLS, flatten, normalizeCurriculum } from './curriculumModel'

export const SECTION_LABELS = {
  meta: 'Details',
  courseDescription: 'Course Description',
  courseObjectives: 'Course Objectives',
  learningOutcomes: 'Learning Outcomes',
  courseMaterials: 'Materials & Resources',
  courseContent: 'Course Content',
  teachingMethods: 'Teaching Methods',
  projects: 'Projects',
  trips: 'Trips',
  internships: 'Internships & Events',
  gradingCriteria: 'Grading Criteria',
  curriculumOutlineSemesterOne: 'Outline — Semester 1',
  curriculumOutlineSemesterTwo: 'Outline — Semester 2',
  notes: 'Notes & Changes',
}

const SECTION_KEYS = Object.keys(SECTION_LABELS)

const listLines = items =>
  flatten(items).map(({ node, depth }) => `${'    '.repeat(depth)}• ${node.text}`)

const tableLines = (cols, rows) =>
  rows.map((r, i) => `${i + 1}. ${cols.map(c => `${c.label}: ${r[c.key] ?? ''}`).join(' | ')}`)

const textLines = (label, value) =>
  value ? [`${label}: ${value}`.split('\n').join(' ⏎ ')] : []

// Readable lines for one section, used for side-by-side comparison.
export function sectionLines(content, key) {
  const c = normalizeCurriculum(content)
  switch (key) {
    case 'meta':
      return Object.entries(c.meta).map(([k, v]) => `${k}: ${v}`)
    case 'courseDescription':
      return textLines('Description', c.courseDescription.text)
    case 'courseObjectives':
    case 'learningOutcomes':
      return [...textLines('Introduction', c[key].intro), ...listLines(c[key].items)]
    case 'courseContent':
      return [
        c.courseContent.semesterOneTitle, ...listLines(c.courseContent.semesterOneItems),
        c.courseContent.semesterTwoTitle, ...listLines(c.courseContent.semesterTwoItems),
      ]
    case 'gradingCriteria':
      return tableLines(GRADING_COLS, c.gradingCriteria.rows)
    case 'curriculumOutlineSemesterOne':
    case 'curriculumOutlineSemesterTwo':
      return tableLines(OUTLINE_COLS, c[key].rows)
    case 'notes':
      return textLines('Notes', c.notes.text)
    default:
      return listLines(c[key].items)
  }
}

// Compares two documents section by section; marks lines missing from the other side.
export function compareContents(a, b) {
  return SECTION_KEYS.map(key => {
    const left = sectionLines(a, key)
    const right = sectionLines(b, key)
    const inRight = new Set(right)
    const inLeft = new Set(left)
    return {
      key,
      label: SECTION_LABELS[key],
      changed: JSON.stringify(left) !== JSON.stringify(right),
      left: left.map(text => ({ text, diff: !inRight.has(text) })),
      right: right.map(text => ({ text, diff: !inLeft.has(text) })),
    }
  })
}
