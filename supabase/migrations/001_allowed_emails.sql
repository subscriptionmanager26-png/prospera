-- Email allowlist for archive access (seed emails via dashboard/SQL — do not commit seeds)
create table if not exists public.allowed_emails (
  email text primary key,
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

create policy "Users can read own allowlist row"
  on public.allowed_emails
  for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create table if not exists public.slack_users (
  id text primary key,
  name text,
  real_name text,
  display_name text,
  email text,
  avatar_72 text,
  is_admin boolean default false,
  is_bot boolean default false,
  deleted boolean default false,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists public.slack_channels (
  id text primary key,
  name text not null unique,
  kind text not null default 'channel',
  topic text default '',
  purpose text default '',
  member_count int not null default 0,
  is_general boolean default false,
  raw jsonb not null default '{}'::jsonb
);

create table if not exists public.slack_messages (
  id bigint generated always as identity primary key,
  channel_id text not null references public.slack_channels(id) on delete cascade,
  channel_name text not null,
  ts text not null,
  thread_ts text,
  user_id text,
  display_name text,
  avatar text,
  text text default '',
  subtype text,
  reply_count int default 0,
  reactions jsonb default '[]'::jsonb,
  blocks jsonb,
  hidden boolean default false,
  msg_ts double precision not null,
  raw jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(display_name, '')), 'B')
  ) stored,
  unique (channel_id, ts)
);

create index if not exists slack_messages_channel_ts_idx on public.slack_messages (channel_id, msg_ts);
create index if not exists slack_messages_thread_idx on public.slack_messages (thread_ts);
create index if not exists slack_messages_search_idx on public.slack_messages using gin (search_vector);

create or replace function public.is_allowlisted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_emails a
    where a.active = true
      and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.slack_users enable row level security;
alter table public.slack_channels enable row level security;
alter table public.slack_messages enable row level security;

create policy "Allowlisted can read users"
  on public.slack_users for select to authenticated
  using (public.is_allowlisted());

create policy "Allowlisted can read channels"
  on public.slack_channels for select to authenticated
  using (public.is_allowlisted());

create policy "Allowlisted can read messages"
  on public.slack_messages for select to authenticated
  using (public.is_allowlisted());

create or replace function public.search_slack_messages(q text, lim int default 50)
returns table (
  channel_id text,
  channel_name text,
  ts text,
  thread_ts text,
  user_id text,
  display_name text,
  avatar text,
  text text,
  msg_ts double precision,
  rank real
)
language sql
stable
security invoker
as $$
  select
    m.channel_id,
    m.channel_name,
    m.ts,
    m.thread_ts,
    m.user_id,
    m.display_name,
    m.avatar,
    m.text,
    m.msg_ts,
    ts_rank(m.search_vector, websearch_to_tsquery('english', q)) as rank
  from public.slack_messages m
  where m.hidden is not true
    and m.search_vector @@ websearch_to_tsquery('english', q)
    and public.is_allowlisted()
  order by rank desc, m.msg_ts desc
  limit greatest(1, least(lim, 100));
$$;

grant execute on function public.search_slack_messages(text, int) to authenticated;
grant execute on function public.is_allowlisted() to authenticated;

-- Private Storage bucket for future ZIP uploads (manage via dashboard/service role)
insert into storage.buckets (id, name, public, file_size_limit)
values ('slack-exports', 'slack-exports', false, 524288000)
on conflict (id) do update set public = false;
