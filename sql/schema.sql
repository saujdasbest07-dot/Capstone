-- ============================================================
-- StudyPulse — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Profiles (name, phone, notification prefs)
create table if not exists profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  name  text,
  phone text,
  prefs jsonb default '{"sms":true,"email":false,"push":false,"morning":true,"afternoon":true,"evening":true}'
);
alter table profiles enable row level security;
create policy "Own profile" on profiles for all using (auth.uid() = id);

-- 2. Tasks
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete cascade not null,
  name               text not null,
  type               text not null,
  subject            text not null,
  due                date not null,
  priority           text default 'medium',
  notes              text,
  color              text default '#6366f1',
  reminder_morning   boolean default true,
  reminder_afternoon boolean default true,
  reminder_evening   boolean default true,
  completed          boolean default false,
  created_at         timestamptz default now()
);
alter table tasks enable row level security;
create policy "Own tasks" on tasks for all using (auth.uid() = user_id);

-- 3. Notifications
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  message    text not null,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "Own notifications" on notifications for all using (auth.uid() = user_id);

-- 4. Streaks
create table if not exists streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  days    text[] default '{}',
  count   integer default 0
);
alter table streaks enable row level security;
create policy "Own streak" on streaks for all using (auth.uid() = user_id);
