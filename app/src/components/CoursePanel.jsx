// src/components/CoursePanel.jsx
import { useState } from 'react'
import WeeklyPlansSection from './WeeklyPlansSection'
import CurriculumEditor from './CurriculumEditor'
import { STAGE_LABELS } from '../stageUtils'
import { courseLabel } from '../access'

export default function CoursePanel({ course, department, gradeById, userId, isAdmin, isAuditor, reviewer, canEdit }) {
  const [tab, setTab] = useState('curriculum')
  const grade = gradeById.get(course.grade_id)

  const accessLabel = reviewer ? 'Reviewer' : canEdit ? 'Can edit' : 'Read-only'

  return (
    <div className="cv-wrap">
      <div className="cv-topbar">
        <div>
          <h2 className="cv-title">{department.icon} {department.name}{grade ? ` — ${grade.name}` : ` — ${courseLabel(course, gradeById)}`}</h2>
          <p className="cv-subtitle">{STAGE_LABELS[course.stage]}</p>
        </div>
        <span className={`chip${reviewer ? ' chip-accent' : ''}`}>{accessLabel}</span>
      </div>

      {course.archived_at && <div className="readonly-banner">This course is archived.</div>}

      <div className="tabs">
        <button className={`tab${tab === 'curriculum' ? ' active' : ''}`} onClick={() => setTab('curriculum')}>
          📘 Curriculum
        </button>
        <button className={`tab${tab === 'plans' ? ' active' : ''}`} onClick={() => setTab('plans')}>
          🗓 Weekly Plans
        </button>
      </div>

      {tab === 'curriculum' && (
        <CurriculumEditor
          key={course.id}
          course={course}
          department={department}
          grade={grade}
          userId={userId}
          canEdit={canEdit}
          isAdmin={isAdmin}
          reviewer={reviewer}
        />
      )}

      {tab === 'plans' && (
        <WeeklyPlansSection
          key={course.id}
          course={course}
          gradeName={grade?.name ?? ''}
          userId={userId}
          isAdmin={isAdmin}
          isAuditor={isAuditor}
          canEdit={canEdit && !course.archived_at}
        />
      )}
    </div>
  )
}
