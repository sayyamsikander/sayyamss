# ContactScope SaaS

Full-stack B2B contact-intelligence MVP with public search/reveal, signup/login with mandatory email verification, password reset, credits, Stripe Checkout billing, protected admin panel, resilient CSV imports, contact CRUD, social links, optional Supabase persistence, and payment audit tools.

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
DEMO_BILLING=false
```

Never commit real credentials or the Supabase service-role key.

See `DEPLOY_FREE.md` for the deployment steps.

## Admin CSV

Use `sample-contacts.csv` as the import template.

Recommended contact fields:
- name or first/last name
- company (can be inferred from email/domain)
- email and/or phone

The importer accepts comma, semicolon, tab, and pipe-delimited exports plus common aliases such as Full Name, First Name, Work Email, Mobile, Organization, Job Title, and Company Size. Rows are not silently discarded: the admin result reports every invalid row and why it failed.

## Production billing & email

**Required integrations:** Stripe for international card/payment processing and Resend for transactional email. The repository contains the integration code, but your own Stripe and Resend accounts must be connected and their secrets added to Render; I cannot charge real cards or send real email without those account credentials.

Customer purchases never grant credits directly from the browser. Real Stripe Checkout is required, and credits are granted only from verified Stripe webhook events. Failed/declined payments are recorded in the admin panel and trigger a rejection email when Resend is configured. Stripe Checkout supports global payment methods and local-currency presentation where enabled in the Stripe account. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_*` IDs, and keep `DEMO_BILLING=false`.

Email verification and password reset require Resend. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` domain before allowing production signups. New users cannot sign in or purchase until their email is verified.

### Stripe setup
1. Create the Starter, Growth, and Business recurring Prices in Stripe and put their IDs in `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, and `STRIPE_PRICE_BUSINESS`.
2. Add a Stripe webhook pointing to `https://YOUR_APP/api/billing/stripe-webhook`.
3. Enable these events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `payment_intent.payment_failed`, `checkout.session.async_payment_failed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Put the webhook signing secret in `STRIPE_WEBHOOK_SECRET` and the secret API key in `STRIPE_SECRET_KEY`.
5. Configure Stripe Customer Portal so paid users can update their payment method/cancel/manage billing. The app exposes `/api/billing/portal` for this.

Stripe Checkout is hosted by Stripe, so raw card numbers never pass through ContactScope. Stripe's payment-failure events are used as the source of truth; a failed card/payment never grants credits. Stripe documents `payment_intent.payment_failed` for failed payment attempts and recommends webhook-driven fulfillment. citeturn6search1turn7search0

## Security

Passwords use Node.js `scrypt`; session cookies are HttpOnly; only session-token hashes are stored; state-changing requests enforce same-origin checks; request bodies and API rates are limited; security headers are enabled.

Only process contact information you are legally permitted to collect, store, and display.
