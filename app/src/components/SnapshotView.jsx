// src/components/SnapshotView.jsx

const BLOOMS_LABELS = { 1: 'Remembering', 2: 'Understanding', 3: 'Applying', 4: 'Analyzing', 5: 'Evaluating', 6: 'Creating' }

export default function SnapshotView({ table, snapshot }) {
  if (!snapshot) return <p className="muted">No data.</p>

  if (table === 'curricula') {
    return (
      <div className="snapshot-view">
        <p><strong>Title:</strong> {snapshot.title}</p>
        <p><strong>Academic Year:</strong> {snapshot.academic_year}</p>
        <p><strong>Learning Objectives:</strong> {snapshot.learning_objectives}</p>
        <p><strong>Standards:</strong> {snapshot.standards}</p>
      </div>
    )
  }

  const plan = snapshot.plan ?? snapshot
  const periods = snapshot.periods ?? []

  return (
    <div className="snapshot-view">
      <p><strong>Semester:</strong> {plan.semester} &nbsp; <strong>Week:</strong> {plan.week_number} &nbsp; <strong>Grade:</strong> {plan.grade_level}</p>
      <p><strong>Date:</strong> {plan.date_from} to {plan.date_to}</p>
      <h5>Class Periods</h5>
      {periods.map(p => (
        <div key={p.id} className="period-card">
          <strong>{p.class_section || '(no class/section set)'} {p.lesson_date ? `— ${p.lesson_date}` : ''}</strong>
          <p><strong>Objectives:</strong> {p.learning_objectives}</p>
          <p><strong>Description:</strong> {p.description_of_lesson}</p>
          <p><strong>Book & Pages:</strong> {p.book_pages}</p>
          <p><strong>Bloom's:</strong> {(p.blooms_levels ?? []).map(n => BLOOMS_LABELS[n]).join(', ')}</p>
          <p><strong>Materials:</strong> {p.materials_resources}</p>
          <p><strong>Differentiation:</strong> {p.differentiation}</p>
          <p><strong>Reflection:</strong> {p.reflection}</p>
          <p><strong>Classwork:</strong> {p.classwork}</p>
          <p><strong>Homework:</strong> {p.homework}</p>
        </div>
      ))}
      {periods.length === 0 && <p className="muted">No class periods in this version.</p>}
    </div>
  )
}
