import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCourseInReviewScope, teacherCompliance } from './compliance.mjs'

test('stage and department heads see only their own courses', () => {
  const course = { id: 'one', stage: 'middle' }
  const assignments = [{ user_id: 'head', course_id: 'one', kind: 'dept_head' }]
  assert.equal(isCourseInReviewScope(course, { userId: 'head', role: 'head_department' }, assignments), true)
  assert.equal(isCourseInReviewScope(course, { userId: 'other', role: 'head_department' }, assignments), false)
  assert.equal(isCourseInReviewScope(course, { userId: 'other', role: 'head_middle' }, assignments), true)
  assert.equal(isCourseInReviewScope(course, { userId: 'other', role: 'head_high' }, assignments), false)
})

test('one plan counts for a teacher only within the supplied scope', () => {
  const reports = [
    { course_id: 'one', teachers: [{ id: 'teacher' }], course_plans: [] },
    { course_id: 'two', teachers: [{ id: 'teacher' }], course_plans: [{ teacher_id: 'teacher', course_title: 'Course two' }] },
  ]
  const one = teacherCompliance(reports.slice(0, 1))
  assert.equal(one[0].teachers[0].submitted, false)
  assert.deepEqual(one[0].teachers[0].plans, [])
  const both = teacherCompliance(reports)
  assert.equal(both[0].teachers[0].submitted, true)
  assert.equal(both[1].teachers[0].submitted, true)
  assert.equal(both[0].teachers[0].plans[0].course_title, 'Course two')
  assert.equal('course_plans' in both[0], false)
  assert.equal(reports[0].teachers[0].submitted, undefined)
})
