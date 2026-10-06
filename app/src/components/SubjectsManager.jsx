// src/components/SubjectsManager.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { GRADE_LEVELS } from '../stageUtils'

export default function SubjectsManager() {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [department, setDepartment] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editGradeLevel, setEditGradeLevel] = useState('')
  const [editDepartment, setEditDepartment] = useState('')

  async function loadSubjects() {
    setLoading(true)
    const { data, error } = await supabase
      .from('subjects')
      .select('*')
      .order('name', { ascending: true })
    if (error) setError(error.message)
    else setSubjects(data)
    setLoading(false)
  }

  useEffect(() => { loadSubjects() }, [])

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase
      .from('subjects')
      .insert({ name, grade_level: gradeLevel || null, department })
    if (error) { setError(error.message); return }
    setName(''); setGradeLevel(''); setDepartment('')
    loadSubjects()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this subject? This also removes any teacher/auditor/head assignments to it.')) return
    const { error } = await supabase.from('subjects').delete().eq('id', id)
    if (error) setError(error.message)
    else loadSubjects()
  }

  function startEditing(s) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditGradeLevel(s.grade_level ?? '')
    setEditDepartment(s.department ?? '')
  }

  async function saveEdit(id) {
    const { error } = await supabase
      .from('subjects')
      .update({ name: editName, grade_level: editGradeLevel || null, department: editDepartment })
      .eq('id', id)
    if (error) { setError(error.message); return }
    setEditingId(null)
    loadSubjects()
  }

  return (
    <div>
      <h2>Subjects</h2>

      <form onSubmit={handleAdd} className="inline-form">
        <input placeholder="Name (e.g. Mathematics)" value={name} onChange={e => setName(e.target.value)} required />
        <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)}>
          <option value="">Grade level…</option>
          {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <input placeholder="Department" value={department} onChange={e => setDepartment(e.target.value)} />
        <button type="submit">Add subject</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading ? <p>Loading…</p> : (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Grade</th><th>Department</th><th></th></tr>
          </thead>
          <tbody>
            {subjects.map(s => (
              <tr key={s.id}>
                {editingId === s.id ? (
                  <>
                    <td><input value={editName} onChange={e => setEditName(e.target.value)} /></td>
                    <td>
                      <select value={editGradeLevel} onChange={e => setEditGradeLevel(e.target.value)}>
                        <option value="">—</option>
                        {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td><input value={editDepartment} onChange={e => setEditDepartment(e.target.value)} /></td>
                    <td>
                      <button onClick={() => saveEdit(s.id)}>Save</button>
                      <button onClick={() => setEditingId(null)} className="secondary">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{s.name}</td>
                    <td>{s.grade_level || <span className="muted">not set</span>}</td>
                    <td>{s.department}</td>
                    <td>
                      <button onClick={() => startEditing(s)} className="secondary">Edit</button>
                      <button onClick={() => handleDelete(s.id)} className="danger">Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {subjects.length === 0 && <tr><td colSpan={4}>No subjects yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
