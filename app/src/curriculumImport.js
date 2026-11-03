// src/curriculumImport.js
// Reads a curriculum Word file that follows the school template (the same layout the
// Word export produces) and turns it into curriculum content.
import JSZip from 'jszip'
import { MAX_DEPTH } from './curriculumModel'

const HEADINGS = [
  ['courseDescription', /^course description/],
  ['courseObjectives', /^course objectives?/],
  ['learningOutcomes', /^learning outcomes?/],
  ['courseMaterials', /^course materials/],
  ['courseContent', /^course content/],
  ['teachingMethods', /^teaching methods/],
  ['projects', /^list of projects/],
  ['trips', /^list of trips/],
  ['internships', /^list of internships/],
  ['gradingCriteria', /^grading criteria/],
  ['outline', /^curriculum outline/],
  ['notes', /^curriculum changes/],
]

const GRADING_KEYS = ['category', 'maxGrade', 'items', 'percent']
const OUTLINE_KEYS = ['month', 'standard', 'objective', 'strategies', 'materials', 'assignments', 'evaluation']

const clean = s => s.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
const isPlaceholder = s => /^\{\{.*\}\}$/.test(s.trim())
const isDash = s => /^[—–-]$/.test(s.trim())

function children(el, name) {
  return Array.from(el.childNodes).filter(n => n.nodeType === 1 && n.localName === name)
}

// Text of a paragraph, honouring line breaks.
function paragraphText(p) {
  let out = ''
  const walk = node => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType !== 1) continue
      if (n.localName === 't') out += n.textContent
      else if (n.localName === 'br') out += '\n'
      else if (n.localName === 'tab') out += ' '
      else walk(n)
    }
  }
  walk(p)
  return out
}

function readParagraph(p) {
  const numPr = children(p, 'pPr')[0] && children(children(p, 'pPr')[0], 'numPr')[0]
  const ilvlEl = numPr && children(numPr, 'ilvl')[0]
  const numIdEl = numPr && children(numPr, 'numId')[0]
  const numId = numIdEl ? numIdEl.getAttribute('w:val') : null
  return {
    type: 'p',
    text: clean(paragraphText(p)),
    listed: Boolean(numPr) && numId !== '0',
    level: ilvlEl ? Number(ilvlEl.getAttribute('w:val')) || 0 : 0,
  }
}

function readTable(tbl) {
  return {
    type: 'tbl',
    rows: children(tbl, 'tr').map(tr =>
      children(tr, 'tc').map(tc =>
        clean(children(tc, 'p').map(p => paragraphText(p)).join('\n'))
      )
    ),
  }
}

function buildTree(lines) {
  const root = []
  const stack = [] // stack[d] = children array at depth d
  stack[0] = root
  let prev = -1
  for (const { text, depth: wanted } of lines) {
    const depth = Math.max(0, Math.min(wanted, prev + 1, MAX_DEPTH))
    const node = { text, children: [] }
    stack[depth].push(node)
    stack[depth + 1] = node.children
    prev = depth
  }
  return root
}

function listFrom(blocks, { intro = false } = {}) {
  const lines = []
  const introParts = []
  for (const b of blocks) {
    if (b.type !== 'p' || !b.text || isDash(b.text) || isPlaceholder(b.text)) continue
    if (b.listed) lines.push({ text: b.text, depth: b.level })
    else if (intro && lines.length === 0) introParts.push(b.text)
    else lines.push({ text: b.text, depth: 0 })
  }
  return { items: buildTree(lines), intro: introParts.join('\n') }
}

function plainText(blocks) {
  return blocks
    .filter(b => b.type === 'p' && b.text && !isDash(b.text) && !isPlaceholder(b.text))
    .map(b => b.text)
    .join('\n')
}

function tableRows(table, keys) {
  if (!table) return []
  return table.rows.slice(1)
    .filter(cells => !isPlaceholder(cells[0] ?? ''))
    .map(cells => Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ''])))
    .filter(row => keys.some(k => row[k] !== ''))
}

function parseMeta(top) {
  const meta = {}
  const lines = top.filter(b => b.type === 'tbl').flatMap(t => t.rows.flat()).flatMap(c => c.split('\n'))
  for (const line of lines) {
    let m
    if ((m = line.match(/^no\.? of credit hours:?\s*(.*)$/i))) meta.creditHours = m[1].trim()
    else if ((m = line.match(/^annual instruction[^:]*:?\s*(.*)$/i))) meta.hoursPerWeek = m[1].trim()
    else if (/^\d{4}\s*[-–/]\s*\d{2,4}$/.test(line.trim())) meta.academicYear = line.trim()
  }
  return meta
}

export async function parseCurriculumDocx(arrayBuffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(arrayBuffer)
  } catch {
    throw new Error('This file is not a valid .docx document.')
  }
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('This file is not a valid .docx document.')

  const xml = new DOMParser().parseFromString(await file.async('string'), 'application/xml')
  const body = xml.getElementsByTagNameNS('*', 'body')[0]
  if (!body) throw new Error('The document has no content.')

  const blocks = []
  for (const el of Array.from(body.childNodes)) {
    if (el.nodeType !== 1) continue
    if (el.localName === 'p') blocks.push(readParagraph(el))
    else if (el.localName === 'tbl') blocks.push(readTable(el))
  }

  // Split into sections at the template's headings.
  const top = []
  const sections = {}
  let current = null
  for (const b of blocks) {
    if (b.type === 'p' && b.text.length < 70) {
      const norm = b.text.toLowerCase().replace(/[:\s]+$/g, '').replace(/\s+/g, ' ')
      const hit = HEADINGS.find(([key, re]) => !(key in sections) && re.test(norm))
      if (hit) {
        current = hit[0]
        sections[current] = []
        continue
      }
    }
    if (current) sections[current].push(b)
    else top.push(b)
  }

  if (Object.keys(sections).length < 3) {
    throw new Error('This does not look like the curriculum template: its section headings were not found.')
  }

  const s = key => sections[key] ?? []
  const tablesIn = key => s(key).filter(b => b.type === 'tbl')

  const objectives = listFrom(s('courseObjectives'), { intro: true })
  const outcomes = listFrom(s('learningOutcomes'), { intro: true })

  // Course content: unnumbered lines are the semester titles, numbered ones the topics.
  const content = { semesterOneTitle: '', semesterTwoTitle: '', one: [], two: [] }
  let semester = 0
  for (const b of s('courseContent')) {
    if (b.type !== 'p' || !b.text || isDash(b.text) || isPlaceholder(b.text)) continue
    if (!b.listed) {
      semester += 1
      if (semester === 1) content.semesterOneTitle = b.text
      else if (semester === 2) content.semesterTwoTitle = b.text
    } else {
      (semester >= 2 ? content.two : content.one).push({ text: b.text, depth: b.level })
    }
  }

  const outlines = tablesIn('outline')
  const imported = {
    meta: parseMeta(top),
    courseDescription: { text: plainText(s('courseDescription')) },
    courseObjectives: objectives,
    learningOutcomes: outcomes,
    courseMaterials: { items: listFrom(s('courseMaterials')).items },
    courseContent: {
      ...(content.semesterOneTitle && { semesterOneTitle: content.semesterOneTitle }),
      semesterOneItems: buildTree(content.one),
      ...(content.semesterTwoTitle && { semesterTwoTitle: content.semesterTwoTitle }),
      semesterTwoItems: buildTree(content.two),
    },
    teachingMethods: { items: listFrom(s('teachingMethods')).items },
    projects: { items: listFrom(s('projects')).items },
    trips: { items: listFrom(s('trips')).items },
    internships: { items: listFrom(s('internships')).items },
    gradingCriteria: { rows: tableRows(tablesIn('gradingCriteria')[0], GRADING_KEYS) },
    curriculumOutlineSemesterOne: { rows: tableRows(outlines[0], OUTLINE_KEYS) },
    curriculumOutlineSemesterTwo: { rows: tableRows(outlines[1], OUTLINE_KEYS) },
    notes: { text: plainText(s('notes')) },
  }

  const missing = HEADINGS.filter(([key]) => !(key in sections)).map(([key]) => key)
  return { content: imported, missing }
}
