-- 04_rls.sql
-- Row level security. Edge functions use the service role and bypass RLS.

alter table public.profiles                  enable row level security;
alter table public.grades                    enable row level security;
alter table public.departments               enable row level security;
alter table public.courses                   enable row level security;
alter table public.course_assignments        enable row level security;
alter table public.curriculum_working_copies enable row level security;
alter table public.curriculum_versions       enable row level security;
alter table public.official_versions         enable row level security;
alter table public.version_comments          enable row level security;
alter table public.weekly_plans              enable row level security;
alter table public.lesson_periods            enable row level security;
alter table public.notifications             enable row level security;
alter table public.downloads_log             enable row level security;

-- profiles: everyone signed in can read names (needed to show authors);
-- only admins change roles/profiles. Password changes go through Supabase Auth.
create policy profiles_read  on public.profiles for select to authenticated using (true);
create policy profiles_admin on public.profiles for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- grades / departments: names are readable by any signed-in user; admin writes.
create policy grades_read  on public.grades for select to authenticated using (true);
create policy grades_admin on public.grades for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy departments_read  on public.departments for select to authenticated using (true);
create policy departments_admin on public.departments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- courses: only what the user may view; admin sees and manages all.
create policy courses_read  on public.courses for select to authenticated
  using (public.is_admin() or public.can_view(id));
create policy courses_admin on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- assignments: own rows, reviewers of the course, admin.
create policy assignments_read on public.course_assignments for select to authenticated
  using (user_id = auth.uid() or public.can_review(course_id));
create policy assignments_admin on public.course_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- working copies: strictly private to their owner (who must still be an editor).
create policy working_copies_own on public.curriculum_working_copies for all to authenticated
  using (user_id = auth.uid() and public.can_edit(course_id))
  with check (user_id = auth.uid() and public.can_edit(course_id));

-- named versions: private to author + reviewers, but the official version is
-- visible to everyone who can view the course. Insert as yourself. Admin deletes.
create policy versions_read on public.curriculum_versions for select to authenticated
  using (
    author_id = auth.uid()
    or public.can_review(course_id)
    or (public.can_view(course_id) and exists (
          select 1 from public.official_versions o
          where o.course_id = curriculum_versions.course_id and o.version_id = curriculum_versions.id))
  );
create policy versions_insert on public.curriculum_versions for insert to authenticated
  with check (author_id = auth.uid() and public.can_edit(course_id));
create policy versions_update_note on public.curriculum_versions for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy versions_admin_delete on public.curriculum_versions for delete to authenticated
  using (public.is_admin());

-- official pointer: readable by viewers; written only via set_official_version().
create policy official_read on public.official_versions for select to authenticated
  using (public.can_view(course_id));

-- admin comments: admin only.
create policy comments_admin on public.version_comments for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and author_id = auth.uid());

-- weekly plans: owner teacher, reviewers and admin read/write; auditors read.
create policy plans_read on public.weekly_plans for select to authenticated
  using (teacher_id = auth.uid() or public.can_review(course_id) or public.can_view(course_id)
         and public.my_role() = 'auditor');
create policy plans_write on public.weekly_plans for all to authenticated
  using (public.is_admin() or (teacher_id = auth.uid() and public.can_edit(course_id)))
  with check (public.is_admin() or (teacher_id = auth.uid() and public.can_edit(course_id)));

create policy periods_read on public.lesson_periods for select to authenticated
  using (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id));
create policy periods_write on public.lesson_periods for all to authenticated
  using (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id
         and (public.is_admin() or (p.teacher_id = auth.uid() and public.can_edit(p.course_id)))))
  with check (exists (select 1 from public.weekly_plans p where p.id = weekly_plan_id
         and (public.is_admin() or (p.teacher_id = auth.uid() and public.can_edit(p.course_id)))));

-- notifications: only the recipient reads and marks as read.
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_mark on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- downloads log: admin reads; inserts come from the service role only.
create policy downloads_admin_read on public.downloads_log for select to authenticated
  using (public.is_admin());

-- RPC permissions
revoke all on function public.set_official_version(uuid) from public, anon;
grant execute on function public.set_official_version(uuid) to authenticated;
