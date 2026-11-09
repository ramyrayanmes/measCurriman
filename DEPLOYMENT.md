# Deployment checklist (CurriMan 6.0.0)

Run in this order. Skip steps already done on your project. `01` and `02` reset data, so run them only on a fresh project.

## 1. Database (Supabase SQL editor, in order)
1. `supabase/sql/01_reset_v5.sql` – deletes v5 data
2. `02_core_structure.sql` – deletes departments, courses, grades and assignments
3. `03_curriculum_and_plans.sql`
4. `04_rls.sql`
5. `05_admin_tools.sql`
6. `06_user_status.sql`
7. `07_manage_courses.sql` – enables permanent course deletion
8. `08_curriculum_review.sql` – adds review submissions and migrates existing non-Official versions to pending (no migration emails)

## 2. Edge functions
```
supabase functions deploy create-user
supabase functions deploy bulk-create-users
supabase functions deploy export-document
supabase functions deploy send-notification-email
supabase functions deploy weekly-compliance-report --no-verify-jwt
```
Secrets (`supabase secrets set NAME=value`): `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `CRON_SECRET`, `WEBHOOK_SECRET`, optional `APP_URL`.

## 3. Database webhook (notification emails)
Database > Webhooks > Create: table `notifications`, event `Insert`, Supabase Edge Function `send-notification-email`, with HTTP header `x-webhook-secret` set to the `WEBHOOK_SECRET` value.

## 4. Weekly report schedule
A cron job must call `weekly-compliance-report` every Saturday morning (Cairo time) with header `x-cron-secret: <CRON_SECRET>` and body `{"mode":"send"}`.

## 5. Web app
```
cd app
npm install
npm run build
```
Deploy the `app/dist` output (Cloudflare). Logo: `app/src/branding.js` (`LOGO_URL`). Version: `app/src/version.js`.

## 6. Smoke test
- Admin: Manage (departments, courses), Users (create, deactivate, delete), Reports (Preview, Send test).
- Manage: edit departments, grades, regular courses and electives. Deleting a grade is blocked while courses use it; deleting a course permanently removes its associated content.
- Teacher: edit a curriculum, save a version, import Word, export Word and PDF, create a weekly plan.
- Reviewer: set a version Official, compare versions, confirm notification emails arrive.
- Teacher and reviewer: submit, return with a comment, resubmit, and approve a version. Approval and setting Official are separate actions.
- Reports: confirm each head sees only their assigned courses and a head's on-demand email is sent only to that head.
- Auditor: sees only Official versions, PDF only, download is logged.
- Inactive user: cannot sign in.
