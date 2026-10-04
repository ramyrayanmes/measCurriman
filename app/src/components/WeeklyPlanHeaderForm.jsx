// src/components/WeeklyPlanHeaderForm.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function WeeklyPlanHeaderForm({ subjectId, existing, userId, onSaved, onCancel }) {
  const [semester, setSemester] = useState(existing?.semester ?? 1)
  const [weekNumber, setWeekNumber] = useState(existing?.week_number ?? '')
  const [dateFrom, setDateFrom] = useState(existing?.date_from ?? '')
  const [dateTo, setDateTo] = useState(existing?.date_to ?? '')
  const [gradeLevel, setGradeLevel] = useState(existing?.grade_level ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      subject_id: subjectId,
      teacher_id: userId,
      semester: Number(semester),
      week_number: Number(weekNumber),
      date_from: dateFrom,
      date_to: dateTo,
      grade_level: gradeLevel,
    }

    const result = existing
      ? await supabase.from('weekly_plans').update(payload).eq('id', existing.id).select().single()
      : await supabase.from('weekly_plans').insert(payload).select().single()

    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data)
  }

  return (
    <form onSubmit={handleSubmit} className="curriculum-form">
      <label>
        Semester
        <select value={semester} onChange={e => setSemester(e.target.value)}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>
      <label>
        Week Number
        <input type="number" min="1" value={weekNumber} onChange={e => setWeekNumber(e.target.value)} required />
      </label>
      <label>
        Date From
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} required />
      </label>
      <label>
        Date To
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} required />
      </label>
      <label>
        Grade Level
        <input value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save week details' : 'Create week'}</button>
        <button type="button" onClick={onCancel} className="secondary">Cancel</button>
      </div>
    </form>
  )
}
