// src/curriculumModel.js
//
// Shape of a curriculum document plus pure helpers for the nested list editor.
// List items are trees: { id, text, children: [] } with a maximum depth of 4 levels (0..3).

export const SCHOOL_NAME = 'Modern Education American School'
export const MAX_DEPTH = 3

export const GRADING_COLS = [
  { key: 'category', label: 'Category' },
  { key: 'maxGrade', label: 'Maximum Grade' },
  { key: 'items', label: 'Approx. No. of Items' },
  { key: 'percent', label: 'Grade % per Assignment' },
]

export const OUTLINE_COLS = [
  { key: 'month', label: 'Month & Hrs' },
  { key: 'standard', label: 'Standard' },
  { key: 'objective', label: 'Learning Objective' },
  { key: 'strategies', label: 'Teaching Strategies' },
  { key: 'materials', label: 'Materials & Resources' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'evaluation', label: 'Method of Evaluation' },
]

let counter = 0
export function newId() {
  counter += 1
  return `n${Date.now().toString(36)}${counter}`
}

export function newNode(text = '') {
  return { id: newId(), text, children: [] }
}

export function blankCurriculum({ department = '', grade = '' } = {}) {
  return {
    meta: {
      school: SCHOOL_NAME,
      department,
      grade,
      creditHours: '',
      hoursPerWeek: '',
      academicYear: '',
    },
    courseDescription: { text: '' },
    courseObjectives: { intro: '', items: [] },
    learningOutcomes: { intro: '', items: [] },
    courseMaterials: { items: [] },
    courseContent: {
      semesterOneTitle: 'Semester One',
      semesterOneItems: [],
      semesterTwoTitle: 'Semester Two',
      semesterTwoItems: [],
    },
    teachingMethods: { items: [] },
    projects: { items: [] },
    trips: { items: [] },
    internships: { items: [] },
    gradingCriteria: { rows: [] },
    curriculumOutlineSemesterOne: { rows: [] },
    curriculumOutlineSemesterTwo: { rows: [] },
    notes: { text: '' },
  }
}

// Fills gaps so older or partial documents always render, and gives every node an id.
export function normalizeCurriculum(content, defaults) {
  const base = blankCurriculum(defaults)
  const src = content && typeof content === 'object' ? content : {}
  const out = {}
  for (const key of Object.keys(base)) {
    out[key] = { ...base[key], ...(src[key] || {}) }
  }
  out.meta = { ...base.meta, ...(src.meta || {}), department: defaults?.department ?? src.meta?.department ?? '', grade: defaults?.grade ?? src.meta?.grade ?? '' }
  for (const key of ['courseObjectives', 'learningOutcomes', 'courseMaterials', 'teachingMethods', 'projects', 'trips', 'internships']) {
    out[key].items = normalizeItems(out[key].items)
  }
  out.courseContent.semesterOneItems = normalizeItems(out.courseContent.semesterOneItems)
  out.courseContent.semesterTwoItems = normalizeItems(out.courseContent.semesterTwoItems)
  for (const key of ['gradingCriteria', 'curriculumOutlineSemesterOne', 'curriculumOutlineSemesterTwo']) {
    out[key].rows = Array.isArray(out[key].rows) ? out[key].rows : []
  }
  return out
}

export function normalizeItems(items, depth = 0) {
  if (!Array.isArray(items)) return []
  return items.map(item => {
    const node = typeof item === 'string' ? { text: item } : item || {}
    return {
      id: node.id || newId(),
      text: String(node.text ?? ''),
      children: depth < MAX_DEPTH ? normalizeItems(node.children, depth + 1) : [],
    }
  })
}

// ---------- tree helpers (all return new trees) ----------

export function flatten(items, depth = 0, parentPath = []) {
  const out = []
  items.forEach((node, i) => {
    const path = [...parentPath, i]
    out.push({ node, depth, path })
    out.push(...flatten(node.children, depth + 1, path))
  })
  return out
}

function siblingsAt(items, path) {
  let cur = items
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children
  return cur
}

function mapAt(items, path, fn) {
  if (path.length === 1) return fn(items, path[0])
  const [head, ...rest] = path
  return items.map((n, i) => (i === head ? { ...n, children: mapAt(n.children, rest, fn) } : n))
}

export function getNode(items, path) {
  return siblingsAt(items, path)[path[path.length - 1]]
}

export function updateText(items, path, text) {
  return mapAt(items, path, (list, idx) => list.map((n, i) => (i === idx ? { ...n, text } : n)))
}

export function insertAfter(items, path, node) {
  return mapAt(items, path, (list, idx) => [...list.slice(0, idx + 1), node, ...list.slice(idx + 1)])
}

export function removeAt(items, path) {
  return mapAt(items, path, (list, idx) => list.filter((_, i) => i !== idx))
}

function subtreeDepth(node) {
  return 1 + Math.max(0, ...node.children.map(subtreeDepth))
}

function samePrefix(a, b) {
  return a.length <= b.length && a.every((v, i) => v === b[i])
}

// Make the item a last child of its previous sibling.
export function indent(items, path) {
  const idx = path[path.length - 1]
  if (idx === 0) return items
  const node = getNode(items, path)
  if (path.length + subtreeDepth(node) > MAX_DEPTH + 1) return items
  const prevPath = [...path.slice(0, -1), idx - 1]
  const removed = removeAt(items, path)
  return mapAt(removed, prevPath, (list, i) =>
    list.map((n, k) => (k === i ? { ...n, children: [...n.children, node] } : n))
  )
}

// Move the item to sit right after its parent.
export function unindent(items, path) {
  if (path.length <= 1) return items
  const node = getNode(items, path)
  const removed = removeAt(items, path)
  return insertAfter(removed, path.slice(0, -1), node)
}

// Drop `from` just below `to`, or as the last child of `to` when nest is true.
export function move(items, from, to, nest) {
  if (samePrefix(from, to)) return items
  const node = getNode(items, from)
  const targetDepth = to.length + (nest ? 1 : 0)
  if (targetDepth - 1 + subtreeDepth(node) > MAX_DEPTH + 1) return items
  const removed = removeAt(items, from)
  // Removing the source can shift the target's path when they share a parent list.
  const adjusted = [...to]
  const depthIdx = from.length - 1
  if (
    from.length <= to.length &&
    from.slice(0, depthIdx).every((v, i) => v === to[i]) &&
    from[depthIdx] < to[depthIdx]
  ) {
    adjusted[depthIdx] -= 1
  }
  if (nest) {
    return mapAt(removed, adjusted, (list, i) =>
      list.map((n, k) => (k === i ? { ...n, children: [...n.children, node] } : n))
    )
  }
  return insertAfter(removed, adjusted, node)
}

// Strip ids and empty rows so saved content stays compact and comparable.
export function toStorable(content) {
  const strip = items =>
    items
      .filter(n => n.text.trim() !== '' || n.children.length > 0)
      .map(n => ({ text: n.text, children: strip(n.children) }))
  const out = JSON.parse(JSON.stringify(content))
  for (const key of ['courseObjectives', 'learningOutcomes', 'courseMaterials', 'teachingMethods', 'projects', 'trips', 'internships']) {
    out[key].items = strip(content[key].items)
  }
  out.courseContent.semesterOneItems = strip(content.courseContent.semesterOneItems)
  out.courseContent.semesterTwoItems = strip(content.courseContent.semesterTwoItems)
  return out
}
