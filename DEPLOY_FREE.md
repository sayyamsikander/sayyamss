# Free deployment — Render + Supabase

This is the recommended no-cost preview stack for ContactScope.

## Why two services?

Render can run the Node.js backend for free, but a free Render web service has an ephemeral local filesystem. ContactScope therefore supports Supabase as persistent storage so administrator CSV imports, users, credits, and settings survive web-service restarts.

## A. Create Supabase persistence

1. Create a free Supabase account/project.
2. Open **SQL Editor**.
3. Paste and run the entire `supabase.sql` file from this project.
4. Open project settings / API settings.
5. Copy the project URL.
6. Copy the **service role** key. Keep it secret; never put it in `public/` files or GitHub.

You will use:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_SERVICE_ROLE_KEY
```

## B. Upload the code to GitHub

1. Create a GitHub repository.
2. Upload all project files/folders.
3. Do not upload a real `.env` file. `.gitignore` already excludes it.
4. Confirm `render.yaml` is at the repository root.

## C. Create the Render service

1. Sign in to Render.
2. Choose **New → Web Service**.
3. Connect the GitHub repository.
4. Select the **Free** compute plan.
5. Render can use `render.yaml`; if configuring manually use:

```text
Build command: npm install
Start command: npm start
Health check path: /api/health
```

6. Add these environment variables:

```text
ADMIN_NAME=Administrator
ADMIN_EMAIL=YOUR_ADMIN_EMAIL
ADMIN_PASSWORD=YOUR_UNIQUE_LONG_PASSWORD
DEMO_BILLING=true
COOKIE_SECURE=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_SERVICE_ROLE_KEY
APP_URL=https://YOUR_RENDER_SERVICE.onrender.com
```

7. Deploy.

## D. Verify the live service

Open:

```text
https://YOUR_RENDER_SERVICE.onrender.com/api/health
```

Expected:

```json
{
  "ok": true,
  "storage": "supabase"
}
```

If `storage` says `local-json`, do not rely on administrator uploads yet; check the two Supabase environment variables.

Then open:

```text
https://YOUR_RENDER_SERVICE.onrender.com
https://YOUR_RENDER_SERVICE.onrender.com/admin
```

Log in with the administrator credentials from the Render environment variables.

## E. Client-preview mode

Keep:

```text
DEMO_BILLING=true
```

This lets the client test plan upgrades without a real card charge.

## F. Before real payments

Set:

```text
DEMO_BILLING=false
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_STARTER=...
STRIPE_PRICE_GROWTH=...
STRIPE_PRICE_BUSINESS=...
```

Add Stripe webhook:

```text
https://YOUR_DOMAIN/api/billing/stripe-webhook
```

For a full commercial billing implementation, also add renewal, cancellation, failed-payment, customer-portal, and reconciliation logic.

## G. Custom domain

After Render gives you a working `onrender.com` URL, add your domain in Render's Custom Domains settings, apply the requested DNS records at your registrar, wait for HTTPS verification, then change:

```text
APP_URL=https://yourdomain.com
```

## Free-tier caveats

- Render free web services sleep when idle, so the first request after inactivity can take longer.
- Supabase free projects have usage/storage limits.
- Free hosting is appropriate for a client preview or low-traffic MVP, not a reliability-guaranteed production service.
