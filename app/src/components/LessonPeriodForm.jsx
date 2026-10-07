// src/components/LessonPeriodForm.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'

const BLOOMS = [
  { value: 1, label: 'Remembering' },
  { value: 2, label: 'Understanding' },
  { value: 3, label: 'Applying' },
  { value: 4, label: 'Analyzing' },
  { value: 5, label: 'Evaluating' },
  { value: 6, label: 'Creating' },
]

export default function LessonPeriodForm({ weeklyPlanId, existing, onSaved, onCancel }) {
  const [classSection, setClassSection] = useState(existing?.class_section ?? '')
  const [lessonDate, setLessonDate] = useState(existing?.lesson_date ?? '')
  const [learningObjectives, setLearningObjectives] = useState(existing?.learning_objectives ?? '')
  const [description, setDescription] = useState(existing?.description_of_lesson ?? '')
  const [bookPages, setBookPages] = useState(existing?.book_pages ?? '')
  const [bloomsLevels, setBloomsLevels] = useState(existing?.blooms_levels ?? [])
  const [materials, setMaterials] = useState(existing?.materials_resources ?? '')
  const [differentiation, setDifferentiation] = useState(existing?.differentiation ?? '')
  const [reflection, setReflection] = useState(existing?.reflection ?? '')
  const [classwork, setClasswork] = useState(existing?.classwork ?? '')
  const [homework, setHomework] = useState(existing?.homework ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function toggleBloom(value) {
    setBloomsLevels(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      weekly_plan_id: weeklyPlanId,
      class_section: classSection,
      lesson_date: lessonDate || null,
      learning_objectives: learningObjectives,
      description_of_lesson: description,
      book_pages: bookPages,
      blooms_levels: bloomsLevels,
      materials_resources: materials,
      differentiation,
      reflection,
      classwork,
      homework,
    }

    const { error } = existing
      ? await supabase.from('lesson_periods').update(payload).eq('id', existing.id)
      : await supabase.from('lesson_periods').insert(payload)

    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="curriculum-form period-form">
      <label>
        Class / Section
        <input value={classSection} onChange={e => setClassSection(e.target.value)} placeholder="e.g. Grade 3B" />
      </label>
      <label>
        Date
        <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} />
      </label>
      <label>
        Learning Objectives
        <textarea rows={3} value={learningObjectives} onChange={e => setLearningObjectives(e.target.value)} />
      </label>
      <label>
        Description of Lesson
        <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <label>
        Book & Pages
        <input value={bookPages} onChange={e => setBookPages(e.target.value)} />
      </label>

      <div>
        <span className="field-label">Bloom's Taxonomy (select all that apply)</span>
        <div className="subject-checkboxes">
          {BLOOMS.map(b => (
            <label key={b.value} className="checkbox-pill">
              <input type="checkbox" checked={bloomsLevels.includes(b.value)} onChange={() => toggleBloom(b.value)} />
              {b.value}. {b.label}
            </label>
          ))}
        </div>
      </div>

      <label>
        Materials/Resources Used
        <textarea rows={2} value={materials} onChange={e => setMaterials(e.target.value)} />
      </label>
      <label>
        Differentiation
        <textarea rows={2} value={differentiation} onChange={e => setDifferentiation(e.target.value)} />
      </label>
      <label>
        Reflection
        <textarea rows={2} value={reflection} onChange={e => setReflection(e.target.value)} />
      </label>
      <label>
        Classwork
        <textarea rows={2} value={classwork} onChange={e => setClasswork(e.target.value)} />
      </label>
      <label>
        Homework
        <textarea rows={2} value={homework} onChange={e => setHomework(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save period' : 'Add period'}</button>
        <button type="button" onClick={onCancel} className="secondary">Cancel</button>
      </div>
    </form>
  )
}
