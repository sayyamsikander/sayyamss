-- Run this once in Supabase SQL Editor before adding SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY to your hosting environment.
create table if not exists public.contactscope_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Browser clients should not access this state table directly.
alter table public.contactscope_state enable row level security;

-- No public policies are intentionally created. The server-side service-role
-- key bypasses RLS and must never be exposed to browser JavaScript.
