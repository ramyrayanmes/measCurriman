// src/components/AuditorCurriculumView.jsx
import VersionHistoryAndExport from './VersionHistoryAndExport'

export default function AuditorCurriculumView({ curriculum, onBack }) {
  return (
    <div>
      <button onClick={onBack} className="secondary">&larr; Back</button>
      <h2>{curriculum.title}</h2>
      <p className="muted">Academic Year: {curriculum.academic_year || '—'}</p>

      <h3>Learning Objectives</h3>
      <p>{curriculum.learning_objectives || '—'}</p>

      <h3>Standards</h3>
      <p>{curriculum.standards || '—'}</p>

      <VersionHistoryAndExport
        table="curricula"
        recordId={curriculum.id}
        canRestore={false}
      />
    </div>
  )
}
