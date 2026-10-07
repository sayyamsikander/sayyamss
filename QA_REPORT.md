# ContactScope v2 — QA report

Checked on 2026-10-07 with Node.js 22.16.0. The project requires Node.js 20+.

## Automated checks passed

- `node --check server.js`
- `node --check app.js`
- `node --check admin.js`
- `npm audit --omit=dev` → 0 known dependency vulnerabilities (the app has no runtime npm dependencies)
- Duplicate-ID scan on root admin HTML → no duplicate element IDs
- JavaScript-to-HTML selector scan → all static referenced IDs exist; the only public exception is `logoutBtn`, which is created dynamically after login

## API / workflow smoke test passed

`npm test` verifies:

- health endpoint
- public search returns masked contact values
- signup and login
- HttpOnly + SameSite session cookie
- server stores only a SHA-256 hash of the session token
- email reveal charges the expected credit amount
- repeating the same reveal does not charge twice
- normal users cannot call administrator APIs
- administrator login and dashboard stats
- administrator CSV export
- contact create/delete
- CSV upsert import
- site/reveal/pricing settings update
- changed signup-credit amount applies to new users
- administrator credit adjustments
- cross-origin state-changing request rejection
- password-length validation
- invalid CSV row rejection

## Persistence regression passed

A mock Supabase REST service is started, the app writes state to it, the Node application is stopped/restarted, and the previously-created user successfully logs in after restart.

This verifies the optional Supabase persistence adapter independently of the local JSON filesystem.

## Important limits

- No software can be guaranteed to be bug-free. The checks above found no failures in the covered flows.
- The included Supabase adapter intentionally stores MVP state in one JSONB row. It is appropriate for a client preview / early MVP but should be migrated to normalized Postgres tables for large datasets, high concurrency, or multiple app instances.
- The Stripe integration creates checkout sessions and verifies `checkout.session.completed`. A full commercial subscription system should additionally implement subscription renewals, cancellations, failed-payment handling, customer-portal flows, taxes where applicable, and billing reconciliation.
- A visual browser automation run was attempted in the build environment, but Chromium navigation is blocked by the environment's administrator policy. API and JavaScript syntax tests do not depend on that browser environment restriction.
