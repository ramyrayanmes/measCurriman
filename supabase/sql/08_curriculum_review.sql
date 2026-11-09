-- Explicit review submissions. Run after 01-07; safe to re-run.
create table if not exists public.curriculum_reviews (
  version_id uuid primary key references public.curriculum_versions(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'returned')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  migrated boolean not null default false
);

create table if not exists public.curriculum_review_events (
  id bigint generated always as identity primary key,
  version_id uuid not null references public.curriculum_versions(id) on delete cascade,
  action text not null check (action in ('submitted', 'approved', 'returned')),
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists curriculum_review_events_version_idx
  on public.curriculum_review_events (version_id, created_at desc);

-- A dedicated marker prevents a subsequent re-run from submitting new drafts.
create table if not exists public.curriculum_review_migration (
  id boolean primary key default true check (id),
  applied_at timestamptz not null default now()
);
revoke all on public.curriculum_review_migration from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from public.curriculum_review_migration where id) then
    insert into public.curriculum_reviews (version_id, status, submitted_at, migrated)
    select v.id, 'pending', v.created_at, true
    from public.curriculum_versions v
    where not exists (select 1 from public.official_versions o where o.version_id = v.id)
    on conflict (version_id) do nothing;
    insert into public.curriculum_review_migration (id) values (true);
  end if;
end $$;

alter table public.curriculum_reviews enable row level security;
alter table public.curriculum_review_events enable row level security;
drop policy if exists curriculum_reviews_read on public.curriculum_reviews;
create policy curriculum_reviews_read on public.curriculum_reviews for select to authenticated
  using (public.is_active() and exists (
    select 1 from public.curriculum_versions v where v.id = version_id
      and (v.author_id = auth.uid() or public.can_review(v.course_id))
  ));
drop policy if exists curriculum_review_events_read on public.curriculum_review_events;
create policy curriculum_review_events_read on public.curriculum_review_events for select to authenticated
  using (public.is_active() and exists (
    select 1 from public.curriculum_versions v where v.id = version_id
      and (v.author_id = auth.uid() or public.can_review(v.course_id))
  ));
revoke all on public.curriculum_reviews, public.curriculum_review_events from anon, authenticated;
grant select on public.curriculum_reviews, public.curriculum_review_events to authenticated;

create or replace function public.submit_curriculum_review(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.curriculum_versions%rowtype; r public.curriculum_reviews%rowtype;
begin
  select * into v from public.curriculum_versions where id = p_version for update;
  if not found then raise exception 'Version not found'; end if;
  if v.author_id <> auth.uid() or not public.can_edit(v.course_id) then
    raise exception 'Only the author with edit access can submit this version';
  end if;
  if exists (select 1 from public.courses where id = v.course_id and archived_at is not null) then
    raise exception 'Cannot submit an archived course';
  end if;
  select * into r from public.curriculum_reviews where version_id = p_version;
  if found and r.status <> 'returned' then raise exception 'Version is already submitted or approved'; end if;
  insert into public.curriculum_reviews (version_id, status, submitted_at, reviewed_at, reviewer_id, review_note, migrated)
    values (p_version, 'pending', now(), null, null, null, false)
    on conflict (version_id) do update set status = 'pending', submitted_at = now(),
      reviewed_at = null, reviewer_id = null, review_note = null, migrated = false;
  insert into public.curriculum_review_events (version_id, action, actor_id)
    values (p_version, 'submitted', auth.uid());
  insert into public.notifications (recipient_id, type, title, message, course_id, related_table, related_id)
    select id, 'review_submitted', 'Curriculum submitted for review',
      'Version "' || v.name || '" is ready for review.', v.course_id, 'curriculum_versions', v.id
    from public.course_reviewer_ids(v.course_id) id where id <> auth.uid();
end $$;

create or replace function public.decide_curriculum_review(p_version uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.curriculum_versions%rowtype; r public.curriculum_reviews%rowtype;
begin
  if p_decision not in ('approved', 'returned') or p_decision is null then raise exception 'Invalid review decision'; end if;
  if p_decision = 'returned' and nullif(trim(p_note), '') is null then raise exception 'A return comment is required'; end if;
  select * into v from public.curriculum_versions where id = p_version for update;
  if not found then raise exception 'Version not found'; end if;
  if not public.can_review(v.course_id) then raise exception 'Not allowed to review this course'; end if;
  if exists (select 1 from public.courses where id = v.course_id and archived_at is not null) then
    raise exception 'Cannot review an archived course';
  end if;
  select * into r from public.curriculum_reviews where version_id = p_version for update;
  if not found or r.status <> 'pending' then raise exception 'Version is not awaiting review'; end if;
  update public.curriculum_reviews set status = p_decision, reviewed_at = now(),
    reviewer_id = auth.uid(), review_note = nullif(trim(p_note), '') where version_id = p_version;
  insert into public.curriculum_review_events (version_id, action, actor_id, note)
    values (p_version, p_decision, auth.uid(), nullif(trim(p_note), ''));
  insert into public.notifications (recipient_id, type, title, message, course_id, related_table, related_id)
    select v.author_id, 'review_' || p_decision,
      case when p_decision = 'approved' then 'Curriculum review approved' else 'Curriculum returned for changes' end,
      'Version "' || v.name || '" was ' || p_decision || '.' ||
        case when nullif(trim(p_note), '') is null then '' else ' Comment: ' || trim(p_note) end,
      v.course_id, 'curriculum_versions', v.id
    where v.author_id <> auth.uid()
      and exists (select 1 from public.profiles where id = v.author_id and active);
end $$;

revoke all on function public.submit_curriculum_review(uuid) from public, anon;
revoke all on function public.decide_curriculum_review(uuid, text, text) from public, anon;
grant execute on function public.submit_curriculum_review(uuid) to authenticated;
grant execute on function public.decide_curriculum_review(uuid, text, text) to authenticated;
