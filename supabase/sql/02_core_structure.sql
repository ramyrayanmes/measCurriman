-- 02_core_structure.sql
-- Departments, grades, courses (department/grade pairs), assignments, profiles.
-- A "course" is one department/grade pair (or one elective). Everything in the
-- app (curriculum, versions, weekly plans, access) hangs off a course.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  role       text not null default 'teacher',
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'teacher';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Replace any old role check constraint with the current role list.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check check (role in (
  'admin', 'teacher', 'auditor',
  'head_kindergarten', 'head_elementary', 'head_middle', 'head_high'
));

-- Drop every old policy on profiles; new ones are created in 04_rls.sql.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end $$;

-- Create a profile row whenever an auth user is created (teacher by default).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email, 'teacher')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ grades
create table public.grades (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  stage       text not null check (stage in ('kindergarten', 'elementary', 'middle', 'high')),
  sort_order  int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Default grades follow the v5 stage mapping; admins can rename/add/archive.
insert into public.grades (name, stage, sort_order) values
  ('Pre-KG', 'kindergarten', 0),
  ('KG',     'kindergarten', 1),
  ('Grade 1',  'elementary', 2),  ('Grade 2',  'elementary', 3),
  ('Grade 3',  'elementary', 4),  ('Grade 4',  'elementary', 5),
  ('Grade 5',  'elementary', 6),  ('Grade 6',  'elementary', 7),
  ('Grade 7',  'middle',     8),  ('Grade 8',  'middle',     9),
  ('Grade 9',  'middle',    10),
  ('Grade 10', 'high',      11),  ('Grade 11', 'high',      12),
  ('Grade 12', 'high',      13);

-- ------------------------------------------------------------- departments
-- kind = 'elective' groups elective courses together in the sidebar.
create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  icon        text not null default '📘',
  kind        text not null default 'department' check (kind in ('department', 'elective')),
  sort_order  int  not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- courses
-- Regular course: department + grade (name null, stage copied from the grade).
-- Elective course: department of kind 'elective', its own name, explicit stage.
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  grade_id      uuid references public.grades(id) on delete restrict,
  name          text,
  stage         text not null check (stage in ('kindergarten', 'elementary', 'middle', 'high')),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint courses_grade_or_name check (grade_id is not null or name is not null)
);

create unique index courses_dept_grade_uq on public.courses (department_id, grade_id) where grade_id is not null;
create unique index courses_dept_name_uq  on public.courses (department_id, lower(name)) where name is not null;
create index courses_stage_idx on public.courses (stage);

-- Keep the stage in sync with the grade for regular courses.
create or replace function public.courses_set_stage()
returns trigger language plpgsql as $$
begin
  if new.grade_id is not null then
    select stage into new.stage from public.grades where id = new.grade_id;
  end if;
  return new;
end $$;

create trigger courses_set_stage_trg
  before insert or update of grade_id on public.courses
  for each row execute function public.courses_set_stage();

-- If a grade moves to another stage, its courses follow.
create or replace function public.grades_sync_course_stage()
returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    update public.courses set stage = new.stage where grade_id = new.id;
  end if;
  return new;
end $$;

create trigger grades_sync_course_stage_trg
  after update of stage on public.grades
  for each row execute function public.grades_sync_course_stage();

-- ------------------------------------------------------------- assignments
-- teacher / auditor: normal access to the course.
-- dept_head: reviewer for this specific department/grade pair.
-- (Stage heads need no rows: their profiles.role decides, e.g. head_elementary.)
create table public.course_assignments (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  kind       text not null check (kind in ('teacher', 'auditor', 'dept_head')),
  created_at timestamptz not null default now(),
  primary key (user_id, course_id, kind)
);

create index course_assignments_course_idx on public.course_assignments (course_id);
