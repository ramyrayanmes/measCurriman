// src/components/CurriculumEditor.jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import ListEditor from './ListEditor'
import TableEditor from './TableEditor'
import { useToast } from '../toastContext'
import {
  GRADING_COLS, OUTLINE_COLS, normalizeCurriculum, toStorable,
} from '../curriculumModel'

const AUTOSAVE_MS = 1500

export default function CurriculumEditor(props) {
  const { course, userId, canEdit } = props
  const [reloadTick, setReloadTick] = useState(0)
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let cancelled = false
    const copyQuery = canEdit
      ? supabase.from('curriculum_working_copies')
          .select('content, based_on, updated_at')
          .eq('user_id', userId).eq('course_id', course.id).maybeSingle()
      : Promise.resolve({ data: null })
    const officialQuery = supabase.from('official_versions')
      .select('version_id, curriculum_versions(content, version_number, name, created_at)')
      .eq('course_id', course.id).maybeSingle()

    Promise.all([copyQuery, officialQuery]).then(([copy, official]) => {
      if (cancelled) return
      const error = copy.error || official.error
      setState({
        loading: false,
        error: error?.message,
        copy: copy.data,
        official: official.data
          ? { id: official.data.version_id, ...official.data.curriculum_versions }
          : null,
      })
    })
    return () => { cancelled = true }
  }, [course.id, userId, canEdit, reloadTick])

  if (state.loading) return <div className="card"><p className="muted">Loading curriculum…</p></div>
  if (state.error) return <div className="card"><p className="error">{state.error}</p></div>

  return (
    <EditorBody
      key={`${course.id}-${reloadTick}`}
      {...props}
      copy={state.copy}
      official={state.official}
      onReset={() => { setState({ loading: true }); setReloadTick(t => t + 1) }}
    />
  )
}

function EditorBody({ course, department, grade, userId, canEdit, copy, official, onReset }) {
  const toast = useToast()
  const readOnly = !canEdit || Boolean(course.archived_at)
  const defaults = { department: department.name, grade: grade?.name ?? course.name ?? '' }

  const [content, setContent] = useState(() =>
    normalizeCurriculum(copy?.content ?? official?.content, defaults)
  )
  const [status, setStatus] = useState(copy ? 'saved' : 'idle')
  const [savedAt, setSavedAt] = useState(copy?.updated_at ?? null)
  const [open, setOpen] = useState(() => new Set([1]))

  const latest = useRef(content)
  const dirty = useRef(false)
  const timer = useRef(null)

  async function save() {
    if (!dirty.current) return
    dirty.current = false
    setStatus('saving')
    const now = new Date().toISOString()
    const { error } = await supabase.from('curriculum_working_copies').upsert({
      user_id: userId,
      course_id: course.id,
      content: toStorable(latest.current),
      based_on: copy?.based_on ?? official?.id ?? null,
      updated_at: now,
    }, { onConflict: 'user_id,course_id' })
    if (error) {
      dirty.current = true
      setStatus('error')
    } else {
      setStatus(dirty.current ? 'dirty' : 'saved')
      setSavedAt(now)
    }
  }

  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })

  // Flush pending edits when leaving the editor.
  useEffect(() => () => {
    clearTimeout(timer.current)
    if (dirty.current) {
      supabase.from('curriculum_working_copies').upsert({
        user_id: userId,
        course_id: course.id,
        content: toStorable(latest.current),
        based_on: copy?.based_on ?? official?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,course_id' }).then(() => {})
    }
  }, [userId, course.id, copy, official])

  const update = useCallback(patch => {
    const next = { ...latest.current, ...patch(latest.current) }
    latest.current = next
    dirty.current = true
    setContent(next)
    setStatus('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(saveRef.current, AUTOSAVE_MS)
  }, [])

  const setMeta = (key, value) => update(c => ({ meta: { ...c.meta, [key]: value } }))
  const setField = (section, key, value) => update(c => ({ [section]: { ...c[section], [key]: value } }))

  async function resetToOfficial() {
    const msg = official
      ? 'Discard your working copy and start again from the Current Official version?'
      : 'Discard your working copy and start from a blank template?'
    if (!window.confirm(msg)) return
    clearTimeout(timer.current)
    dirty.current = false
    const { error } = await supabase.from('curriculum_working_copies')
      .delete().eq('user_id', userId).eq('course_id', course.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Working copy reset')
    onReset()
  }

  const toggle = n => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(n)) next.delete(n); else next.add(n)
    return next
  })

  const c = content
  const list = (section, key = 'items') => (
    <ListEditor
      items={c[section][key]}
      readOnly={readOnly}
      onChange={items => setField(section, key, items)}
    />
  )
  const text = (label, section, key, extra) => (
    <div className="fg">
      <label>{label}</label>
      <textarea
        value={c[section][key]}
        disabled={readOnly}
        style={extra}
        onChange={e => setField(section, key, e.target.value)}
      />
    </div>
  )
  const textInput = (label, section, key) => (
    <div className="fg">
      <label>{label}</label>
      <input type="text" value={c[section][key]} disabled={readOnly}
        onChange={e => setField(section, key, e.target.value)} />
    </div>
  )

  const sections = [
    ['Course Description', text('Description', 'courseDescription', 'text')],
    ['Course Objectives', <>
      {text('Introduction', 'courseObjectives', 'intro')}
      <div className="fg"><label>Items</label>{list('courseObjectives')}</div>
    </>],
    ['Learning Outcomes', <>
      {text('Introduction', 'learningOutcomes', 'intro')}
      <div className="fg"><label>Items</label>{list('learningOutcomes')}</div>
    </>],
    ['Course Materials & Resources', <div className="fg">{list('courseMaterials')}</div>],
    ['Course Content', <>
      {textInput('Semester 1 Title', 'courseContent', 'semesterOneTitle')}
      <div className="fg"><label>Semester 1 Content</label>{list('courseContent', 'semesterOneItems')}</div>
      {textInput('Semester 2 Title', 'courseContent', 'semesterTwoTitle')}
      <div className="fg"><label>Semester 2 Content</label>{list('courseContent', 'semesterTwoItems')}</div>
    </>],
    ['Teaching Methods', <div className="fg">{list('teachingMethods')}</div>],
    ['List of Projects', <div className="fg">{list('projects')}</div>],
    ['List of Trips', <div className="fg">{list('trips')}</div>],
    ['List of Internships & Events', <div className="fg">{list('internships')}</div>],
    ['Grading Criteria', (
      <TableEditor columns={GRADING_COLS} rows={c.gradingCriteria.rows} readOnly={readOnly}
        onChange={rows => setField('gradingCriteria', 'rows', rows)} />
    )],
    ['Curriculum Outline — Semester 1', (
      <TableEditor columns={OUTLINE_COLS} rows={c.curriculumOutlineSemesterOne.rows} readOnly={readOnly}
        onChange={rows => setField('curriculumOutlineSemesterOne', 'rows', rows)} />
    )],
    ['Curriculum Outline — Semester 2', (
      <TableEditor columns={OUTLINE_COLS} rows={c.curriculumOutlineSemesterTwo.rows} readOnly={readOnly}
        onChange={rows => setField('curriculumOutlineSemesterTwo', 'rows', rows)} />
    )],
    ['Notes & Changes', text('Notes', 'notes', 'text', { minHeight: 100 })],
  ]

  const metaFields = [
    ['school', 'School', true],
    ['department', 'Department', true],
    ['grade', 'Grade', true],
    ['creditHours', 'Credit Hrs', false],
    ['hoursPerWeek', 'Annual Instruction Hrs', false],
    ['academicYear', 'Academic Year', false],
  ]

  const officialLabel = official
    ? `v${official.version_number}${official.name ? ` — ${official.name}` : ''}`
    : null

  return (
    <div>
      {readOnly && !course.archived_at && (
        <div className="readonly-banner">
          👁 View-only. {official ? `Showing the Current Official version (${officialLabel}).` : 'No official version has been set yet.'}
        </div>
      )}

      {!readOnly && (
        <div className="cv-timestamp">
          <span className="ts-label">Working copy:</span>
          <span className={`save-status save-${status}`}>
            {status === 'saving' && 'Saving…'}
            {status === 'dirty' && 'Unsaved changes'}
            {status === 'error' && 'Save failed — retrying on next edit'}
            {(status === 'saved' || status === 'idle') && (savedAt
              ? `Saved ${new Date(savedAt).toLocaleString()}`
              : 'Not yet saved')}
          </span>
          <span className="ts-meta">
            {copy ? 'Private to you' : official ? `Started from official ${officialLabel}` : 'Blank template'}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetToOfficial}>
            ↺ {official ? 'Reset to official' : 'Start over'}
          </button>
        </div>
      )}

      <div className="meta-card">
        {metaFields.map(([key, label, locked]) => (
          <div className="meta-field" key={key}>
            <label>{label}</label>
            <input type="text" value={c.meta[key]} disabled={readOnly || locked}
              onChange={e => setMeta(key, e.target.value)} />
          </div>
        ))}
      </div>

      {sections.map(([title, body], i) => {
        const n = i + 1
        const isOpen = open.has(n)
        return (
          <div className="section-card" key={n}>
            <div className={`section-head${isOpen ? ' open' : ''}`} onClick={() => toggle(n)}>
              <div className="section-title"><span className="section-num">{n}</span>{title}</div>
              <svg className="section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            {isOpen && <div className="section-body open">{body}</div>}
          </div>
        )
      })}
    </div>
  )
}
