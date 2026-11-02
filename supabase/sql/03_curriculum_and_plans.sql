-- 03_curriculum_and_plans.sql
-- Access helper functions, curriculum working copies, named versions, official
-- version, admin comments, weekly plans, notifications, download log.

-- ------------------------------------------------------------ access helpers
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Reviewer = admin, stage head of the course's stage, or department head of the course.
create or replace function public.can_review(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1 from public.courses c
      join public.profiles p on p.id = auth.uid()
      where c.id = p_course and p.role = 'head_' || c.stage
    )
    or exists (
      select 1 from public.course_assignments a
      where a.user_id = auth.uid() and a.course_id = p_course and a.kind = 'dept_head'
    )
$$;

-- Editor = reviewer or assigned teacher. Auditors are never editors.
create or replace function public.can_edit(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_review(p_course)
    or exists (
      select 1 from public.course_assignments a
      where a.user_id = auth.uid() and a.course_id = p_course and a.kind = 'teacher'
    )
$$;

create or replace function public.can_view(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit(p_course)
    or exists (
      select 1 from public.course_assignments a
      where a.user_id = auth.uid() and a.course_id = p_course and a.kind = 'auditor'
    )
$$;

-- Stage-head / department-head / admin recipients for a course.
create or replace function public.course_reviewer_ids(p_course uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where p.role = 'admin'
      or p.role = 'head_' || (select stage from public.courses where id = p_course)
  union
  select a.user_id from public.course_assignments a
   where a.course_id = p_course and a.kind = 'dept_head'
$$;

-- ------------------------------------------------------ working copy (autosave)
-- One private draft per user per course. Autosave only touches this table.
create table public.curriculum_working_copies (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  content    jsonb not null default '{}'::jsonb,
  based_on   uuid,  -- version this draft was started from (informational)
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- ---------------------------------------------------- named versions (immutable)
create table public.curriculum_versions (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  version_number int  not null,
  name           text not null,
  content        jsonb not null,
  author_id      uuid not null references public.profiles(id),
  change_note    text,                       -- optional author note
  change_summary jsonb not null default '[]'::jsonb,  -- auto field-level summary
  created_at     timestamptz not null default now(),
  unique (course_id, version_number)
);

create index curriculum_versions_course_idx on public.curriculum_versions (course_id, created_at desc);

-- Numbering, auto summary (top-level sections that differ from the previous
-- named version of the same course), and immutability of content.
create or replace function public.curriculum_versions_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare prev jsonb; k text; changed jsonb := '[]'::jsonb;
begin
  select coalesce(max(version_number), 0) + 1 into new.version_number
    from public.curriculum_versions where course_id = new.course_id;

  select content into prev from public.curriculum_versions
    where course_id = new.course_id order by version_number desc limit 1;

  if prev is null then
    changed := '["first version"]'::jsonb;
  else
    for k in select distinct key from (
      select jsonb_object_keys(new.content) as key
      union select jsonb_object_keys(prev)
    ) s
    loop
      if (new.content -> k) is distinct from (prev -> k) then
        changed := changed || to_jsonb(k);
      end if;
    end loop;
  end if;

  new.change_summary := changed;
  return new;
end $$;

create trigger curriculum_versions_before_insert_trg
  before insert on public.curriculum_versions
  for each row execute function public.curriculum_versions_before_insert();

create or replace function public.curriculum_versions_immutable()
returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content
     or new.name is distinct from old.name
     or new.course_id is distinct from old.course_id
     or new.author_id is distinct from old.author_id
     or new.version_number is distinct from old.version_number
     or new.change_summary is distinct from old.change_summary then
    raise exception 'Named versions are immutable; save a new version instead';
  end if;
  return new;
end $$;

create trigger curriculum_versions_immutable_trg
  before update on public.curriculum_versions
  for each row execute function public.curriculum_versions_immutable();

-- ------------------------------------------------------------ official pointer
create table public.official_versions (
  course_id  uuid primary key references public.courses(id) on delete cascade,
  version_id uuid not null references public.curriculum_versions(id) on delete restrict,
  set_by     uuid not null references public.profiles(id),
  set_at     timestamptz not null default now()
);

-- Only reviewers may call this; it is the only way to write official_versions.
create or replace function public.set_official_version(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record; uid uuid := auth.uid();
begin
  select id, course_id, name, author_id into v from public.curriculum_versions where id = p_version;
  if v.id is null then raise exception 'Version not found'; end if;
  if not public.can_review(v.course_id) then raise exception 'Not allowed'; end if;

  insert into public.official_versions (course_id, version_id, set_by)
  values (v.course_id, v.id, uid)
  on conflict (course_id) do update
    set version_id = excluded.version_id, set_by = excluded.set_by, set_at = now();

  -- Tell the author, the other reviewers and every assigned teacher.
  insert into public.notifications (recipient_id, type, title, message, course_id, related_table, related_id)
  select r.id, 'official_set', 'New official curriculum version',
         'Version "' || v.name || '" is now the official curriculum.',
         v.course_id, 'curriculum_versions', v.id
  from (
    select v.author_id as id
    union select * from public.course_reviewer_ids(v.course_id)
    union select user_id from public.course_assignments
           where course_id = v.course_id and kind = 'teacher'
  ) r
  where r.id <> uid;
end $$;

-- ------------------------------------------------------------ admin comments
create table public.version_comments (
  id         uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  author_id  uuid not null references public.profiles(id),
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index version_comments_version_idx on public.version_comments (version_id);

-- ------------------------------------------------------------- weekly plans
create table public.weekly_plans (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id),
  semester    int  not null check (semester in (1, 2)),
  week_number int  not null,
  date_from   date not null,
  date_to     date not null,
  grade_level text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index weekly_plans_course_idx on public.weekly_plans (course_id, date_from);
create index weekly_plans_teacher_idx on public.weekly_plans (teacher_id);

create table public.lesson_periods (
  id                  uuid primary key default gen_random_uuid(),
  weekly_plan_id      uuid not null references public.weekly_plans(id) on delete cascade,
  class_section       text,
  lesson_date         date,
  learning_objectives text,
  description_of_lesson text,
  book_pages          text,
  blooms_levels       int[] not null default '{}',
  materials_resources text,
  differentiation     text,
  reflection          text,
  classwork           text,
  homework            text,
  created_at          timestamptz not null default now()
);

create index lesson_periods_plan_idx on public.lesson_periods (weekly_plan_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger weekly_plans_touch before update on public.weekly_plans
  for each row execute function public.touch_updated_at();
create trigger working_copies_touch before update on public.curriculum_working_copies
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ notifications
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  title         text not null,
  message       text,
  course_id     uuid references public.courses(id) on delete cascade,
  related_table text,
  related_id    uuid,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- New named version -> notify reviewers of that course (not the author).
create or replace function public.notify_new_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select coalesce(full_name, email, 'A user') into who from public.profiles where id = new.author_id;
  insert into public.notifications (recipient_id, type, title, message, course_id, related_table, related_id)
  select r, 'new_version', 'New curriculum version saved',
         who || ' saved version "' || new.name || '".',
         new.course_id, 'curriculum_versions', new.id
  from public.course_reviewer_ids(new.course_id) r
  where r <> new.author_id;
  return new;
end $$;

create trigger curriculum_versions_notify_trg
  after insert on public.curriculum_versions
  for each row execute function public.notify_new_version();

-- ------------------------------------------------------------ downloads log
-- Written by the export-document edge function (service role) for auditors.
create table public.downloads_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.profiles(id) on delete set null,
  user_email         text,
  record_table       text,
  record_id          uuid,
  record_description text,
  format             text,
  created_at         timestamptz not null default now()
);
