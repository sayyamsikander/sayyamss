# ContactScope SaaS

Full-stack B2B contact-intelligence MVP with public search/reveal, signup/login, credits, plans, protected admin panel, CSV imports, contact CRUD, optional Supabase persistence, and demo/Stripe billing hooks.

## Live site

**GitHub Pages demo:** https://sayyamsikander.github.io/sayyamss/

The GitHub Pages version is a browser-only demo using fictional contact data and local browser storage. It includes search, signup/login, reveal credits, pricing, history, and the admin demo without requiring a Node server. For the full server-backed version with real API routes, Supabase persistence, and production authentication, deploy the same repository to Render using the button below.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sayyamsikander/sayyamss)

**Render health check:** `/api/health`


## Project layout

The runnable application files are intentionally at the repository root for easy GitHub access: `index.html`, `app.js`, `styles.css`, `admin.html`, `admin.js`, `admin.css`, `server.js`, `package.json`, `db.json`, and the root test scripts. The `.github/workflows` directory is kept only for GitHub Actions configuration.

## Quality status

- `npm run check` — passed
- `npm test` — passed
- Auth, session security, reveal credits, admin RBAC, contact CRUD, CSV import, settings, CSRF/origin checks, and Supabase restart persistence are covered by the automated tests.
- No runtime npm dependencies are required.

## Run locally

Requires Node.js 20+.

```bash
cp .env.example .env
npm start
```

Open `http://localhost:4173`.

Admin: `http://localhost:4173/admin`

Set these values in `.env`:

```env
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=use-a-long-unique-password
```

## Free deployment

The included `render.yaml` is ready for a free Render web service.

For persistent data on an ephemeral free web service, create a Supabase project, run `supabase.sql`, and configure:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_SERVICE_ROLE_KEY
APP_URL=https://YOUR_RENDER_SERVICE.onrender.com
COOKIE_SECURE=true
DEMO_BILLING=true
```

Never commit real credentials or the Supabase service-role key.

See `DEPLOY_FREE.md` for the deployment steps.

## Admin CSV

Use `sample-contacts.csv` as the import template.

Required contact fields:
- name
- company
- email or phone

## Billing

Keep `DEMO_BILLING=true` for client previews. Real Stripe billing requires the Stripe secret/webhook/price environment variables documented in the deployment guide.

## Security

Passwords use Node.js `scrypt`; session cookies are HttpOnly; only session-token hashes are stored; state-changing requests enforce same-origin checks; request bodies and API rates are limited; security headers are enabled.

Only process contact information you are legally permitted to collect, store, and display.
