-- 06_user_status.sql   (re-runnable)
-- Inactive users: kept in the system (their versions and plans stay) but they
-- cannot sign in, have no access to data, and no longer receive notifications.

alter table public.profiles add column if not exists active boolean not null default true;

create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.can_review(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (public.is_active() and (
      exists (
        select 1 from public.courses c
        join public.profiles p on p.id = auth.uid()
        where c.id = p_course and p.role::text = 'head_' || c.stage
      )
      or exists (
        select 1 from public.course_assignments a
        where a.user_id = auth.uid() and a.course_id = p_course and a.kind = 'dept_head'
      )
    ))
$$;

create or replace function public.can_edit(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_review(p_course)
    or (public.is_active() and exists (
      select 1 from public.course_assignments a
      where a.user_id = auth.uid() and a.course_id = p_course and a.kind = 'teacher'
    ))
$$;

create or replace function public.can_view(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit(p_course)
    or (public.is_active() and exists (
      select 1 from public.course_assignments a
      where a.user_id = auth.uid() and a.course_id = p_course and a.kind = 'auditor'
    ))
$$;

-- Notification recipients: inactive people are skipped.
create or replace function public.course_reviewer_ids(p_course uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where p.active
     and (p.role::text = 'admin'
          or p.role::text = 'head_' || (select stage from public.courses where id = p_course))
  union
  select a.user_id from public.course_assignments a
   join public.profiles p on p.id = a.user_id and p.active
   where a.course_id = p_course and a.kind = 'dept_head'
$$;

select count(*) filter (where active) as active_users,
       count(*) filter (where not active) as inactive_users
from public.profiles;
