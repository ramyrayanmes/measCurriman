-- 05_admin_tools.sql
-- Head of Department role, permanent department deletion, and profile backfill.
-- Safe to re-run.

-- 1. Head of Department is a role of its own; the departments/grades it oversees
--    are still granted through course_assignments (kind = 'dept_head').
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in (
  'admin', 'teacher', 'auditor', 'head_department',
  'head_kindergarten', 'head_elementary', 'head_middle', 'head_high'
));

-- 2. Permanently delete a department with all its courses and everything under them
--    (curriculum versions, working copies, weekly plans, assignments, notifications).
create or replace function public.delete_department(p_dept uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete departments';
  end if;

  delete from public.official_versions
   where course_id in (select id from public.courses where department_id = p_dept);
  delete from public.courses where department_id = p_dept;
  delete from public.departments where id = p_dept;
end $$;

revoke all on function public.delete_department(uuid) from public;
grant execute on function public.delete_department(uuid) to authenticated;

-- 3. Auth users that have no profile row (created while the schema was being rebuilt)
--    could not sign in and did not show on the Users screen.
insert into public.profiles (id, full_name, email, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', ''), u.email, 'teacher'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

select count(*) as profiles_now from public.profiles;
