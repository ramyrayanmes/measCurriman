# CurriMan v5.0.0 — Curriculum & Lesson Plan Management for MEAS — As-Built Specification

Last updated: 19 October 2026. This describes the system **as built and deployed**, not as originally planned.

## 0. How to use this document (for an AI assistant)

- Treat this as the source of truth for the project's architecture, rules and conventions. If the repository and this document disagree, the repository wins; tell the owner so this file can be corrected.
- Section 10 records the owner's business rules. Do not "simplify" them away; many were deliberate decisions.
- Section 12 describes how the owner prefers to work. Read it before proposing changes.
- Section 11 lists known gaps. Check it before reporting something as a bug.

## 1. Purpose and users

**CurriMan** is a web application for Modern Education American School (MEAS; domain `mes.edu.eg`, based in Cairo) to store, version and share **curricula** and **weekly lesson plans** for every subject. It is the successor to an earlier Google Apps Script / Google Sheets prototype also called CurriMan (v4.6.3), whose interface and curriculum template the owner liked; this version keeps the name and the template but runs on a real database with enforced access control. The product name, version number and school name are defined in one file, `app/src/version.js`. Lesson plans follow the school's own Excel template (`weekly_lesson_Plan.xlsx`). Access is strictly role-based and scoped by subject or grade stage.

User types: admins, teachers, auditors, Stage Heads (Kindergarten, Elementary, Middle, High) and Department Heads (a per-subject grant that can be held by anyone).

## 2. Architecture

| Layer | Tool | Notes |
|---|---|---|
| Source control | GitHub | Repo `ramyrayanmes/measCurriman`, `main` branch |
| Frontend | React + Vite (plain JavaScript) | Lives in `app/`. No router; role-based dashboards switch on `profiles.role` |
| Hosting | Cloudflare (Workers static assets, Git-connected) | Auto-builds on every push to `main` |
| Database / Auth / Functions | Supabase (free tier) | Project ref `submjiiyjtuyadrxbdbz`, URL `https://submjiiyjtuyadrxbdbz.supabase.co` |
| Email | Gmail SMTP | Sent from one individual school account using an app password (see 8) |
| Scheduling | Supabase `pg_cron` + `pg_net` | Drives the Saturday report |

Everything runs on free tiers with no credit card.

Design principle: **authorization lives in the database (Row Level Security)**, not in the frontend. The UI hides controls for convenience, but the database and Edge Functions are what enforce access.

## 3. Roles and access model

### 3.1 Primary role (`profiles.role`, enum `user_role`)

`admin`, `teacher`, `auditor`, `head_kindergarten`, `head_elementary`, `head_middle`, `head_high`. Every user has exactly one primary role (new accounts default to `teacher`).

### 3.2 Independent grants

| Table | Meaning |
|---|---|
| `teacher_subjects` | Subjects a teacher may read and edit |
| `auditor_subjects` | Subjects an auditor may view (read-only). Admin-assigned; auditors do **not** get everything by default |
| `department_head_subjects` | Makes any user a Department Head of that subject. Many-to-many: a subject can have several heads, and a person can head several subjects |

Stage Heads need no assignment: their access is derived from each subject's `grade_level`.

### 3.3 Grade levels and stages

`subjects.grade_level` is constrained to: `Pre-KG, KG, 1–12` (or null). Stage mapping (SQL `grade_to_stage()`, mirrored in `app/src/stageUtils.js` — keep both in sync):

- kindergarten: Pre-KG, KG
- elementary: 1–6
- middle: 7–9
- high: 10–12

A subject with no grade level set belongs to no stage and is invisible to Stage Heads.

### 3.4 Capability matrix

| Capability | Admin | Stage Head | Dept Head (for their subject) | Teacher (assigned subject) | Auditor (assigned subject) |
|---|---|---|---|---|---|
| View curricula and weekly plans | All | All in their stage | Yes | Yes | Yes |
| Create / edit / delete curricula and plans | All | In their stage | Yes | Yes | No |
| See full version history | Yes | In their stage | Yes | Only **named** versions and their **own** | Only **named** versions |
| Name a version / write private notes | Yes | In their stage | Yes | No | No |
| See private notes | Yes | Yes | Yes | No (masked in the database) | No |
| Restore an old version | Yes | In their stage | Yes | No | No |
| Preview / compare versions | Yes | Yes | Yes | Yes (of versions they can see) | Yes (of versions they can see) |
| Download Word | Yes | Yes | Yes | Yes | **No** |
| Download PDF | Yes | Yes | Yes | Yes | Yes (logged and emailed, see 5.8) |
| Manage subjects, users, role and subject assignments, bulk upload | **Yes** | No | No | No | No |
| Receive in-app and email notification on saves | Curriculum saves | No | Weekly-plan saves for their subjects | No | No |
| Receive the Saturday report | No | No | Yes (their subjects) | No | No |

Stage Heads and Department Heads have **content access only**. They cannot manage subjects, users or assignments.

## 4. Data model

### 4.1 Tables

- **profiles** — `id` (= auth user id), `full_name`, `role`, `email`, `created_at`. A trigger on `auth.users` creates the row automatically.
- **subjects** — `id`, `name`, `grade_level` (constrained list), `department`, `created_at`. Each grade of a subject is its **own row** (e.g. "English" Grade 3 and "English" Grade 4 are separate subjects).
- **teacher_subjects**, **auditor_subjects**, **department_head_subjects** — grant tables described above.
- **curricula** — `subject_id`, `title`, `academic_year`, `learning_objectives`, `standards`, `created_by`, `updated_by`, timestamps.
- **curriculum_versions** — full JSON `snapshot` of a curriculum row, `version_number` (unique per curriculum), `name` (public label), `notes` (private), `created_by`.
- **weekly_plans** — the shared header: `subject_id`, `teacher_id` (the user who created it), `semester`, `week_number`, `date_from`, `date_to`, `grade_level`.
- **lesson_periods** — one row per class period within a plan: `class_section` (e.g. "Grade 3B"), `lesson_date`, `learning_objectives`, `description_of_lesson`, `book_pages`, `blooms_levels` (int array, values 1–6, multi-select), `materials_resources`, `differentiation`, `reflection`, `classwork`, `homework`. The legacy `class_and_date` text column is retained but unused.
- **weekly_plan_versions** — JSON snapshot `{ plan, periods[] }` taken whenever the header or any period changes; same `name` / `notes` columns.
- **notifications** — in-app notifications (`recipient_id`, `title`, `message`, `related_table`, `related_id`, `is_read`).
- **downloads_log** — one row per auditor PDF download (user, record, description, format, time). Admin-readable only.
- **audit_log** — created early and currently **unused**.

### 4.2 Views

`curriculum_versions_secure` and `weekly_plan_versions_secure` (security-invoker). They join the saver's email (`created_by_email`) and **mask `notes`** for anyone who is not an admin, Stage Head, or the Department Head of that subject. The frontend reads version history through these views.

### 4.3 Key SQL functions

- Access helpers used by RLS: `current_role()`, `owns_subject()`, `can_audit_subject()`, `is_admin_or_head()` (true for admin or any `head_*` role), `grade_to_stage()`, `current_user_stage()`, `is_head_of_subject_stage()`, `is_department_head_of_subject()`.
- Versioning: `snapshot_curriculum()` (trigger), `snapshot_weekly_plan(plan_id, actor)`, `on_weekly_plan_change()`, `on_lesson_period_change()` (triggers).
- Notifications: `notify_admins_curriculum()` and `notify_heads_weekly_plan()` (triggers on the version tables).
- Restore: `restore_curriculum_version()` and `restore_weekly_plan_version()`. These are **privileged**: executable only by the service role (see 11 and migration 08).

## 5. Core behaviours

### 5.1 Versioning
Every insert/update of a curriculum, or of a weekly plan or any of its periods, writes a **full snapshot** as a new numbered version. Nothing is ever overwritten. Restoring creates a *new* version (so a restore is itself logged). During a weekly-plan restore the per-row triggers are briefly disabled so one restore yields exactly one new version and one notification.

### 5.2 Version visibility and naming
Admins, Stage Heads (in stage) and Department Heads (their subject) see all versions and may give a version a public `name` and a private `notes` field. Teachers and auditors see only **named** versions plus (teachers) versions they saved themselves. Notes are masked in the database, not just hidden in the UI.

### 5.3 Preview and compare
Any visible version can be previewed in full. "Compare to current" shows a field-level summary of what changed (old struck through, new highlighted) with a button to expand a full side-by-side view. Weekly plans are diffed per period (added / removed / changed fields, including Bloom's levels).

### 5.4 Notifications
- A **curriculum** save notifies every **admin** (in-app row plus email).
- A **weekly plan** save notifies the **Department Head(s) of that subject** only. Admins no longer receive weekly-plan notifications (deliberately, to avoid email flooding).
- Delivery: a database trigger inserts the `notifications` row; a Supabase **Database Webhook** on `notifications` INSERT calls the `send-notification-email` function, which builds a field diff against the previous version and emails the recipient.

### 5.5 Export
Word (`.docx`, real tables) or PDF (bordered table on landscape pages) for curricula and weekly plans, available directly on each list row and in the detail view. Access is whatever the caller's own login can see (RLS). **Auditors are PDF-only**, enforced server-side.

### 5.6 Admin user management
Admins create users in the UI (the `create-user` function generates a random temporary password and shows it once), change roles, and tick subject / department-head assignments. All users can change their own password from the top bar.

### 5.7 CSV bulk upload
Admin → Users → Bulk upload. A template can be downloaded in the UI. Columns:
`full_name, email, role, stage, subjects, department_head_of`
- `role`: `admin`, `teacher`, `auditor`, or `head`
- `stage`: `kindergarten|elementary|middle|high`, required only when `role` is `head`
- `subjects` and `department_head_of`: semicolon-separated subject names (exact match, case-insensitive). Both may be filled on one row (dual role).
- Existing users (matched by email) are **updated**; their subject and department-head lists are **replaced** by the row. New users are created with a temporary password (shown once in the results).
- A bad row is **skipped**, not fatal; a results table lists created / updated / skipped with reasons.

### 5.8 Auditor download logging
Every auditor PDF download writes a `downloads_log` row and sends an email to the auditor **and** `meas.curricula@mes.edu.eg` stating what was downloaded, the format and a Cairo-time timestamp. A failure to log or email never blocks the download.

### 5.9 Saturday compliance report
Every Saturday around 07:00–08:00 Cairo time (05:00 UTC, so it shifts with Egypt's daylight saving), the `weekly-compliance-report` function emails:
- each **Department Head**: one email covering all the subjects they head;
- `meas.curricula@mes.edu.eg`: one consolidated email covering every subject, with heads listed.

Rules:
- The reporting week is **Sunday to Thursday**; the most recently completed one is used.
- Only teachers listed in `teacher_subjects` for a subject are checked. A teacher is marked ✓ if they have a weekly plan for that subject whose dates **overlap** the week, otherwise ✗.
- **Retroactive** submissions are plans created during the report week (Sunday to Saturday, Cairo time) whose dates fall entirely before that week. They are listed separately below the checklist.
- Subjects with no assigned teachers and no retroactive plans are omitted.

Admins can preview the report, send a test (to themselves only), or send it on demand from **Admin → Reports**.

## 6. Edge Functions (`supabase/functions/`)

| Function | Called by | Who may call | Purpose |
|---|---|---|---|
| `send-notification-email` | Database Webhook on `notifications` insert | Service-role bearer token | Build the diff and email the notification recipient |
| `restore-version` | Frontend | Admin; Stage Head (record must be in their stage); Department Head of that subject | Restore a curriculum or weekly-plan version |
| `export-document` | Frontend | Any user who can see the record via RLS; auditors PDF only | Generate Word/PDF; log and email auditor downloads |
| `create-user` | Frontend | Admin only | Create one user with a random temporary password |
| `bulk-create-users` | Frontend | Admin only | Process a parsed CSV (create/update, assign subjects) |
| `weekly-compliance-report` | Cron (secret header) or admin in the UI | `x-cron-secret` or admin login | Build and send the Saturday report; supports preview/test/send modes |

All browser-callable functions implement CORS (`OPTIONS` preflight). `weekly-compliance-report` must be deployed with `--no-verify-jwt` because the scheduler authenticates with a secret header, not a login token.

## 7. Frontend map (`app/src/`)

- `App.jsx` — login, top bar (notifications bell for admins, change password, sign out), role-based routing.
- `AdminDashboard.jsx` — tabs: Content, Subjects, Users, Reports.
- `TeacherDashboard.jsx` — subjects from `teacher_subjects` **plus** `department_head_subjects`.
- `StageHeadDashboard.jsx` — all subjects whose grade falls in the head's stage.
- `AuditorDashboard.jsx` — read-only lists, PDF buttons only.
- `components/` — `ContentManager` (curricula and weekly-plan tabs; computes per-subject manage rights), `CurriculumForm`, `WeeklyPlansSection`, `WeeklyPlanEditor`, `WeeklyPlanHeaderForm`, `LessonPeriodForm`, `VersionHistoryAndExport` (naming, notes, preview, compare, restore, export; `pdfOnly` prop for auditors), `SnapshotView`, `CompareView`, `AuditorCurriculumView`, `AuditorWeeklyPlanView`, `SubjectsManager`, `UsersManager`, `BulkUserUpload`, `NotificationsPanel`, `ChangePasswordPanel`, `ReportsPanel`.
- Branding — `version.js` (app name, version, school name: the single place to bump the version), `components/Brand.jsx` (two-tone CurriMan wordmark with version tag). Static files in `app/public/`: `favicon.png`, `meas-logo.png` (full size, used for exports), `meas-logo-small.png` (login page).
- Utilities — `supabaseClient.js`, `edgeFunctions.js` (authenticated calls and file downloads), `stageUtils.js`, `versionDiff.js`, `csvTemplate.js`.
- Libraries added beyond the Vite template: `@supabase/supabase-js`, `papaparse`.

## 8. Configuration, secrets and external services

**Supabase Edge Function secrets** (set with `supabase secrets set NAME=value`):
- `GMAIL_ADDRESS` — the individual school mailbox that sends all system email
- `GMAIL_APP_PASSWORD` — a Google app password for it (16 characters, no spaces; requires 2-Step Verification on that account)
- `CRON_SECRET` — random value shared with the scheduled job

Auto-provided to functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Cloudflare build variables** (baked in at build time; changing them requires a redeploy):
`VITE_SUPABASE_URL` (a single `https://`, no trailing path) and `VITE_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` key).

**Local development**: `app/.env.local` with the same two variables (git-ignored). Restart `npm run dev` after editing it.

**Supabase API keys**: this project uses the new key system. Publishable = `sb_publishable_…` (browser-safe); secret = `sb_secret_…` (used in the webhook's `Authorization: Bearer …` header). Never put the secret key in the frontend.

**Google Workspace**: the school's account is a shared free Education edition. The owner cannot create mailboxes, administer domain-wide delegation, or edit DNS. This is why email goes through one individual account's app password.

## 9. Deployment and operations runbook

### 9.1 Database migrations (run in the Supabase SQL Editor, in this order)
1. `schema.sql` — core tables, versioning triggers, RLS (original)
2. `restore_functions.sql` — restore functions (original)
3. `add_email_to_profiles.sql`
4. `01_version_naming.sql` — version name/notes, secure views, scoped version visibility
5. `02_stage_heads.sql` — grade-level constraint, Stage Head roles and policies
6. `03_department_heads.sql` — department-head grants, notification redirect
7. `04_class_section_split.sql` — `class_section` and `lesson_date`
8. `05_restore_function_update.sql` — restore handles the new period columns
9. `06_downloads_log.sql`
10. `07_weekly_report_cron.sql` — schedule (replace the secret placeholder first)
11. `08_lock_down_functions.sql` — security hardening

If an `ALTER TYPE … ADD VALUE` in step 5 errors, run those four lines on their own first.

### 9.2 Deploying Edge Functions
`supabase functions deploy <name>` from the repo root. For the report function: `supabase functions deploy weekly-compliance-report --no-verify-jwt` (always include the flag). Commit the code to Git as well; deploying and pushing are separate steps.

### 9.3 Deploying the frontend
`git add . && git commit -m "…" && git push`. Cloudflare builds automatically (root directory `app`, build command `npm run build`, config in `app/wrangler.jsonc`, static assets directory `./dist`, single-page-app fallback). The public `workers.dev` URL must be enabled in the Cloudflare project's settings. After a build, hard-refresh (Ctrl+F5).

### 9.4 Database Webhook
Supabase → Integrations → Database Webhooks: table `notifications`, event Insert, target the `send-notification-email` function (or an HTTP request with header `Authorization: Bearer <sb_secret key>`).

### 9.5 Local setup notes (Windows)
- Do **not** keep the project in a Google Drive–synced folder; npm installs fail there. Working copy: `C:\Users\user\Projects\measCurriman`.
- Supabase CLI installed via Scoop (global npm install is blocked by Supabase). Git commits use the GitHub no-reply address (GitHub blocks pushes that expose a private email).
- Run `npm` commands from inside `app/`.

### 9.5b Releasing a new version
Change `APP_VERSION` in `app/src/version.js` (header, login page and browser tab title all read from it), commit and push. Email subjects say "CurriMan" without a version number, so Edge Functions do not need redeploying for a version bump.

### 9.6 Bootstrapping
Create the first user in Supabase → Authentication → Users, then promote it in SQL: `update profiles set role = 'admin' where id = '<user uuid>';`. After that, admins manage everyone through the UI.

### 9.7 Free-tier behaviour
Supabase pauses an inactive project after about a week (it wakes on the next visit). Cloudflare and Supabase free-tier quotas are ample for a single school.

## 10. Business rules and decisions (do not undo without asking the owner)

- Teachers edit only their assigned subjects. Auditors are read-only and scoped per subject by an admin.
- Heads have **read and write** content access, not user/subject administration.
- A person may combine roles: a primary role plus any number of department-head grants (and teacher assignments).
- Department Head is a **per-subject grant**, because subjects (and their heads) change; it is not a fixed role. Several heads per subject are allowed (the owner's example: separate English heads for Grades 1–3, 4–6 and 7–9, modelled as separate subject rows).
- Weekly plans are **per subject per week**, each containing multiple class periods. Bloom's taxonomy allows multiple levels per period. Class/Section and Date are separate fields.
- Teachers and auditors do not see the full version history, only named and own versions; private notes are for admins and heads.
- Admins are not notified about weekly-plan changes (email flooding). They are notified of curriculum changes.
- Stage Heads do **not** receive the Saturday report.
- Auditors: PDF only; every download is logged and emailed to the auditor and `meas.curricula@mes.edu.eg`.
- Exports: "close enough" to the Excel template layout; the PDF has bordered tables.
- Weeks run Sunday to Thursday; reports go out on Saturday.

## 11. Known limitations and backlog

**Needs attention**
- **Arabic and other non-Latin text will probably not render in PDF exports.** The PDF library is using a built-in Latin font. This has not been tested, but expect failure or missing characters. Word export is unaffected. Fixing this means embedding a Unicode font; right-to-left shaping needs extra work. **Test with real Arabic content before relying on PDFs.**
- **No backups or monitoring.** The free tier has no automated backups; export data periodically. There are no automated tests; everything was verified by hand.
- **Email depends on one person's account.** If that account's password, 2-Step Verification or app password changes, or the person leaves, all system emails stop. Gmail also caps daily sending volume.

**Functional gaps**
- The notifications bell is only shown to admins. Department Heads receive notification **emails** (and rows are created), but there is no in-app panel for them yet.
- Department-head grants only appear in the **Teacher** dashboard. An auditor who is also a department head, or a Stage Head who heads a subject outside their stage, cannot reach that subject.
- The compliance report matches plans to teachers by `weekly_plans.teacher_id`, which is whoever **created** the plan. A plan created by a head or admin on a teacher's behalf counts for the creator, not the teacher. Heads who are also assigned as teachers appear in their own checklist.
- CSV re-uploads replace teacher/auditor/department-head lists for that user; if someone changes from teacher to a head role, old `teacher_subjects` rows are not cleaned up.
- `audit_log` is unused; `lesson_periods.class_and_date` is a retained legacy column.
- Deleting a subject cascades to its curricula, plans and assignments.
- Export PDF layout uses character-count estimates for wrapping; very long unbroken text may overflow a cell.

**Resolved security items (migration 08 and `restore-version` v4)**
- The privileged restore/snapshot SQL functions are executable by the service role only.
- `restore-version` enforces a role check (admin, head, or Department Head of that subject) in addition to record visibility.
- Stage Heads can only name versions within their own stage.

## 12. How the owner prefers to work

- Not a professional developer; comfortable with copy/paste and step-by-step instructions on **Windows PowerShell**. Give exact commands, and say which folder to run them in.
- **Provide complete replacement files** rather than "edit these lines" instructions; partial manual edits have repeatedly gone wrong.
- Work **incrementally**: one feature at a time, owner tests locally, then pushes and verifies on the live site before the next piece.
- For larger changes the owner wants **questions and a written plan first, with no code** until the plan is confirmed.
- Be candid about limitations and risks; the owner values knowing what is untested.
- When something fails, ask for the exact error text, browser console output or the Network-tab request status instead of guessing.

## 13. Roadmap (agreed with the owner, not yet built)

Source material: the old CurriMan v4.6.3 (`Code.gs`, `index.html`) and the Word template `Curriculum_Template.docx`.

**Curriculum template.** Header: school, grade and department title, credit hours, annual instruction, academic year. Twelve sections numbered with Roman numerals: I Course Description; II Course Objectives (nested list); III Learning Outcomes (nested list); IV Course Materials and Resources (list); V Course Content (title plus numbered list for each semester); VI Teaching Methods/Strategies; VII List of projects for each Semester; VIII List of trips; IX List of Internships and events; X Grading Criteria (table: Category, Percentage, Approximate no. of items to be assigned, Grade % per assignment, preceded by a fixed explanatory sentence); XI Curriculum Outline (Semester One and Semester Two tables: Month & Hrs, Standard, Learning Objective, Teaching Strategies, Materials and Resources, Assignments, Method of Evaluation); XII Curriculum Changes. The "Hrs/Week" field is renamed "Annual Instruction" to match the template.

**Word export layout (from the template).** A4, narrow margins, Palatino Linotype, bold underlined Roman-numeral headings, blue-shaded table header rows, page 1 portrait, sections X and XI on a landscape page, section XII portrait again. Footer on every page: "MEAS- Curriculum {grade} {department}, {academicYear}" and "Page X of Y". Logo top left, school name top right. Mixed Arabic/English text needs right-to-left handling. A reliable Arabic-capable PDF route must be tested before committing to one.

**Version model (decided).**
- Each teacher works on **their own copy** of a curriculum (per subject per academic year); every save is a version. A new copy starts from the current official version.
- A Department Head, Stage Head or admin **approves** a version by naming it (private notes remain). The **official** curriculum is the most recently approved version.
- Teachers of the subject see the official version plus their own copy. Heads see every copy for their subjects. **Auditors see and download only the official version**; if none is approved they see "No approved version yet". Heads and admins may approve their own work.
- This rule applies to **curricula only**; lesson-plan visibility stays as built.
- Heads are alerted in-app, and by one daily email summary of versions awaiting approval, rather than an email per save.
- Header fields: teachers edit only the academic year; heads everything except school and department; admins everything.

**Electives.** Shown under an "Electives" category in the sidebar. Each elective course is a subject with its own heads, offered to grades 11 and 12 (treated as High School for Stage Head access); its header reads "Grade Level: 11 & 12".

**Interface (from old CurriMan).** Dark header, left sidebar (department, then grade, plus search), Cormorant Garamond and Outfit typography, collapsible numbered section cards, nested-list editor with drag, Enter and indent, table editors, status banners, slide-in version panels, Word (.docx) import with a preview and a skipped-sections report. Not carried over: the statistics panel (it showed placeholder random numbers).

**Also planned.** Archiving of subjects (today a delete permanently removes a subject's curricula and plans). Migration of existing CurriMan v4 curricula is undecided; if wanted, a one-time export script would be run inside the old Apps Script project.

