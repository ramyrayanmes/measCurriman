// src/components/SubjectsManager.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function SubjectsManager() {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState(null)

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
      .insert({ name, grade_level: gradeLevel, department })
    if (error) { setError(error.message); return }
    setName(''); setGradeLevel(''); setDepartment('')
    loadSubjects()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this subject? This also removes any teacher/auditor assignments to it.')) return
    const { error } = await supabase.from('subjects').delete().eq('id', id)
    if (error) setError(error.message)
    else loadSubjects()
  }

  return (
    <div>
      <h2>Subjects</h2>

      <form onSubmit={handleAdd} className="inline-form">
        <input placeholder="Name (e.g. Mathematics)" value={name} onChange={e => setName(e.target.value)} required />
        <input placeholder="Grade level" value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} />
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
                <td>{s.name}</td>
                <td>{s.grade_level}</td>
                <td>{s.department}</td>
                <td><button onClick={() => handleDelete(s.id)} className="danger">Delete</button></td>
              </tr>
            ))}
            {subjects.length === 0 && <tr><td colSpan={4}>No subjects yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}
