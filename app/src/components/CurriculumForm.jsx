// src/components/CurriculumForm.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import VersionHistoryAndExport from './VersionHistoryAndExport'

export default function CurriculumForm({ subjectId, existing, userId, canRestore, onSaved, onCancel }) {
  const [title, setTitle] = useState(existing?.title ?? '')
  const [academicYear, setAcademicYear] = useState(existing?.academic_year ?? '')
  const [learningObjectives, setLearningObjectives] = useState(existing?.learning_objectives ?? '')
  const [standards, setStandards] = useState(existing?.standards ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      subject_id: subjectId,
      title,
      academic_year: academicYear,
      learning_objectives: learningObjectives,
      standards,
      updated_by: userId,
    }

    const { error } = existing
      ? await supabase.from('curricula').update(payload).eq('id', existing.id)
      : await supabase.from('curricula').insert({ ...payload, created_by: userId })

    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="curriculum-form">
        <label>
          Title
          <input value={title} onChange={e => setTitle(e.target.value)} required />
        </label>
        <label>
          Academic Year
          <input value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="e.g. 2026-2027" />
        </label>
        <label>
          Learning Objectives
          <textarea rows={4} value={learningObjectives} onChange={e => setLearningObjectives(e.target.value)} />
        </label>
        <label>
          Standards
          <textarea rows={4} value={standards} onChange={e => setStandards(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Create curriculum'}</button>
          <button type="button" onClick={onCancel} className="secondary">Cancel</button>
        </div>
      </form>

      {existing && (
        <VersionHistoryAndExport
          table="curricula"
          recordId={existing.id}
          canRestore={canRestore}
          onRestored={onSaved}
        />
      )}
    </div>
  )
}
