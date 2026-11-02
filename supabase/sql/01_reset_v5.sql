-- 01_reset_v5.sql
-- DESTRUCTIVE: removes the v5 subject-based tables, views and functions.
-- Only run this because the database holds test data only.
-- `profiles` and `auth.users` are NOT touched, so existing logins survive.
-- Run order: 01 -> 02 -> 03 -> 04.

drop view if exists public.curriculum_versions_secure cascade;
drop view if exists public.weekly_plan_versions_secure cascade;

drop table if exists public.lesson_periods cascade;
drop table if exists public.weekly_plan_versions cascade;
drop table if exists public.weekly_plans cascade;
drop table if exists public.curriculum_versions cascade;
drop table if exists public.curricula cascade;
drop table if exists public.notifications cascade;
drop table if exists public.downloads_log cascade;
drop table if exists public.teacher_subjects cascade;
drop table if exists public.auditor_subjects cascade;
drop table if exists public.department_head_subjects cascade;
drop table if exists public.subjects cascade;

drop function if exists public.restore_curriculum_version cascade;
drop function if exists public.restore_weekly_plan_version cascade;
drop function if exists public.grade_to_stage cascade;
