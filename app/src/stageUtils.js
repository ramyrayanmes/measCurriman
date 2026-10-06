// src/stageUtils.js

export const GRADE_LEVELS = ['Pre-KG', 'KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export const STAGE_LABELS = {
  kindergarten: 'Kindergarten',
  elementary: 'Elementary',
  middle: 'Middle School',
  high: 'High School',
}

export const STAGE_ROLES = {
  head_kindergarten: 'kindergarten',
  head_elementary: 'elementary',
  head_middle: 'middle',
  head_high: 'high',
}

// Mirrors the grade_to_stage() SQL function — keep these in sync.
export function gradeToStage(grade) {
  if (['Pre-KG', 'KG'].includes(grade)) return 'kindergarten'
  if (['1', '2', '3', '4', '5', '6'].includes(grade)) return 'elementary'
  if (['7', '8', '9'].includes(grade)) return 'middle'
  if (['10', '11', '12'].includes(grade)) return 'high'
  return null
}

export function roleLabel(role) {
  const labels = {
    admin: 'Admin',
    teacher: 'Teacher',
    auditor: 'Auditor',
    head_kindergarten: 'Head of Kindergarten',
    head_elementary: 'Head of Elementary',
    head_middle: 'Head of Middle School',
    head_high: 'Head of High School',
  }
  return labels[role] ?? role
}
