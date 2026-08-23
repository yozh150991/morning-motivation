-- ═══════════════════════════════════════════════════════════
-- «Ранкова мотивація» — схема бази даних
-- Виконай цей файл цілком у Supabase: SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════

-- Пул цитат. used = чи випадала цитата в поточному циклі shuffle bag
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  author text,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ранкові добірки: одна на день, quotes = [{"text": "...", "author": "..."}]
create table if not exists public.daily_selections (
  day date primary key,
  quotes jsonb not null,
  created_at timestamptz not null default now()
);

-- Push-підписки пристроїв
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Налаштування застосунку (pin_hash, track_version)
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────
-- Доступ з anon-ключа дозволено: застосунок захищений PIN на клієнті,
-- а розсилка на ВМ працює через service-ключ (RLS його не обмежує).

alter table public.quotes enable row level security;
alter table public.daily_selections enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "anon full access" on public.quotes;
create policy "anon full access" on public.quotes
  for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.daily_selections;
create policy "anon full access" on public.daily_selections
  for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.push_subscriptions;
create policy "anon full access" on public.push_subscriptions
  for all to anon using (true) with check (true);

drop policy if exists "anon full access" on public.app_settings;
create policy "anon full access" on public.app_settings
  for all to anon using (true) with check (true);

-- ── Storage: бакет для музичного треку ─────────────────────
insert into storage.buckets (id, name, public)
values ('music', 'music', true)
on conflict (id) do nothing;

drop policy if exists "anon read music" on storage.objects;
create policy "anon read music" on storage.objects
  for select to anon using (bucket_id = 'music');

drop policy if exists "anon insert music" on storage.objects;
create policy "anon insert music" on storage.objects
  for insert to anon with check (bucket_id = 'music');

drop policy if exists "anon update music" on storage.objects;
create policy "anon update music" on storage.objects
  for update to anon using (bucket_id = 'music') with check (bucket_id = 'music');

drop policy if exists "anon delete music" on storage.objects;
create policy "anon delete music" on storage.objects
  for delete to anon using (bucket_id = 'music');
