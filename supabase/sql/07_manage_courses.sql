-- Permanent course deletion, including an official version if present.
-- Safe to re-run after the earlier schema files.
create or replace function public.delete_course(p_course uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete courses';
  end if;

  if not exists (select 1 from public.courses where id = p_course) then
    raise exception 'Course not found';
  end if;

  delete from public.official_versions where course_id = p_course;
  delete from public.courses where id = p_course;
end $$;

revoke all on function public.delete_course(uuid) from public, anon;
grant execute on function public.delete_course(uuid) to authenticated;
