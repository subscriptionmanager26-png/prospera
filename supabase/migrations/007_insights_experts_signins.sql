-- Sign-in analytics, expert directory, channel insights RPCs

-- ── Sign-ins ──────────────────────────────────────────────────────────────
create table if not exists public.sign_ins (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  method text not null default 'unknown',
  created_at timestamptz not null default now()
);

create index if not exists sign_ins_created_at_idx on public.sign_ins (created_at desc);
create index if not exists sign_ins_user_id_idx on public.sign_ins (user_id);

alter table public.sign_ins enable row level security;

drop policy if exists "Users can insert own sign_ins" on public.sign_ins;
create policy "Users can insert own sign_ins"
  on public.sign_ins for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own sign_ins" on public.sign_ins;
create policy "Users can read own sign_ins"
  on public.sign_ins for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.record_sign_in(p_method text default 'unknown')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.sign_ins (user_id, email, method)
  values (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', ''),
    coalesce(nullif(trim(p_method), ''), 'unknown')
  );
end;
$$;

grant execute on function public.record_sign_in(text) to authenticated;

-- ── Experts ─────────────────────────────────────────────────────────────
create table if not exists public.expert_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  bio text not null default '',
  topics text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists expert_profiles_topics_gin
  on public.expert_profiles using gin (topics);

alter table public.expert_profiles enable row level security;

drop policy if exists "Allowlisted can read experts" on public.expert_profiles;
create policy "Allowlisted can read experts"
  on public.expert_profiles for select to authenticated
  using (public.is_allowlisted());

drop policy if exists "Users manage own expert profile" on public.expert_profiles;
create policy "Users manage own expert profile"
  on public.expert_profiles for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.upsert_expert_profile(
  p_display_name text,
  p_bio text,
  p_topics text[]
)
returns public.expert_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.expert_profiles;
  cleaned text[];
begin
  if auth.uid() is null or not public.is_allowlisted() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  cleaned := (
    select coalesce(array_agg(distinct lower(trim(t))), '{}')
    from unnest(coalesce(p_topics, '{}')) as t
    where length(trim(t)) between 1 and 40
  );

  insert into public.expert_profiles as e (user_id, display_name, email, bio, topics, updated_at)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_display_name), ''), split_part(coalesce(auth.jwt() ->> 'email', 'member'), '@', 1)),
    coalesce(auth.jwt() ->> 'email', ''),
    coalesce(p_bio, ''),
    cleaned,
    now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    bio = excluded.bio,
    topics = excluded.topics,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

grant execute on function public.upsert_expert_profile(text, text, text[]) to authenticated;

create or replace function public.get_my_expert_profile()
returns public.expert_profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.expert_profiles;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into row from public.expert_profiles where user_id = auth.uid();
  return row;
end;
$$;

grant execute on function public.get_my_expert_profile() to authenticated;

create or replace function public.search_experts(p_query text default '', p_limit int default 50)
returns table (
  user_id uuid,
  display_name text,
  email text,
  bio text,
  topics text[],
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := lower(trim(coalesce(p_query, '')));
  lim int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if not public.is_allowlisted() then
    return;
  end if;

  return query
  select
    e.user_id, e.display_name, e.email, e.bio, e.topics, e.updated_at
  from public.expert_profiles e
  where cardinality(e.topics) > 0
    and (
      q = ''
      or e.display_name ilike '%' || q || '%'
      or e.email ilike '%' || q || '%'
      or e.bio ilike '%' || q || '%'
      or exists (
        select 1 from unnest(e.topics) t
        where t ilike '%' || q || '%'
      )
    )
  order by e.updated_at desc
  limit lim;
end;
$$;

grant execute on function public.search_experts(text, int) to authenticated;

-- ── Channel insights helpers ────────────────────────────────────────────
create or replace function public.insight_channels()
returns table (
  id text,
  name text,
  topic text,
  purpose text,
  member_count int,
  message_count bigint,
  is_recommendations boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_allowlisted() then
    return;
  end if;

  return query
  select
    c.id,
    c.name,
    coalesce(c.topic, ''),
    coalesce(c.purpose, ''),
    coalesce(c.member_count, 0),
    (select count(*) from public.slack_messages m
      where m.channel_id = c.id and coalesce(m.hidden, false) = false),
    (c.name = 'read-watch-listen')
  from public.slack_channels c
  where c.name is distinct from 'social-and-watercooler'
  order by c.name;
end;
$$;

grant execute on function public.insight_channels() to authenticated;

create or replace function public.channel_top_reacted(
  p_channel_id text,
  p_limit int default 25
)
returns table (
  channel_id text,
  channel_name text,
  ts text,
  thread_ts text,
  user_id text,
  display_name text,
  avatar text,
  text text,
  reply_count int,
  reactions jsonb,
  msg_ts double precision,
  reaction_score int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 25), 50));
begin
  if not public.is_allowlisted() then
    return;
  end if;

  return query
  select
    m.channel_id,
    m.channel_name,
    m.ts,
    m.thread_ts,
    m.user_id,
    m.display_name,
    m.avatar,
    m.text,
    m.reply_count,
    m.reactions,
    m.msg_ts,
    coalesce((
      select sum(coalesce((r->>'count')::int, 0))
      from jsonb_array_elements(coalesce(m.reactions, '[]'::jsonb)) r
    ), 0)::int as reaction_score
  from public.slack_messages m
  join public.slack_channels c on c.id = m.channel_id
  where m.channel_id = p_channel_id
    and c.name is distinct from 'social-and-watercooler'
    and coalesce(m.hidden, false) = false
    and coalesce(m.reactions, '[]'::jsonb) <> '[]'::jsonb
    and length(coalesce(m.text, '')) > 0
  order by reaction_score desc, m.msg_ts desc
  limit lim;
end;
$$;

grant execute on function public.channel_top_reacted(text, int) to authenticated;

-- Knowledge snippets = top reacted with enough substance
create or replace function public.channel_knowledge(
  p_channel_id text,
  p_limit int default 12
)
returns table (
  channel_id text,
  channel_name text,
  ts text,
  thread_ts text,
  display_name text,
  text text,
  msg_ts double precision,
  reaction_score int,
  kind text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 12), 30));
  ch_name text;
begin
  if not public.is_allowlisted() then
    return;
  end if;

  select c.name into ch_name from public.slack_channels c where c.id = p_channel_id;
  if ch_name is null or ch_name = 'social-and-watercooler' then
    return;
  end if;

  return query
  select
    t.channel_id,
    t.channel_name,
    t.ts,
    t.thread_ts,
    t.display_name,
    t.text,
    t.msg_ts,
    t.reaction_score,
    case
      when ch_name = 'read-watch-listen' then 'recommendation'
      else 'insight'
    end as kind
  from public.channel_top_reacted(p_channel_id, lim * 2) t
  where length(coalesce(t.text, '')) >= 40
  order by t.reaction_score desc
  limit lim;
end;
$$;

grant execute on function public.channel_knowledge(text, int) to authenticated;

-- URL / title recommendations especially for read-watch-listen
create or replace function public.channel_recommendations(
  p_channel_id text,
  p_limit int default 40
)
returns table (
  channel_id text,
  channel_name text,
  ts text,
  display_name text,
  msg_ts double precision,
  url text,
  title text,
  snippet text,
  reaction_score int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 40), 80));
begin
  if not public.is_allowlisted() then
    return;
  end if;

  return query
  with msgs as (
    select
      m.channel_id,
      m.channel_name,
      m.ts,
      m.display_name,
      m.msg_ts,
      m.text,
      coalesce((
        select sum(coalesce((r->>'count')::int, 0))
        from jsonb_array_elements(coalesce(m.reactions, '[]'::jsonb)) r
      ), 0)::int as reaction_score,
      (regexp_matches(m.text, 'https?://[^\s<>\]\|]+', 'gi'))[1] as url
    from public.slack_messages m
    join public.slack_channels c on c.id = m.channel_id
    where m.channel_id = p_channel_id
      and c.name is distinct from 'social-and-watercooler'
      and coalesce(m.hidden, false) = false
      and m.text ~* 'https?://'
  ),
  cleaned as (
    select
      msgs.*,
      regexp_replace(url, '[\)\]>,.]+$', '') as clean_url
    from msgs
    where url is not null
  ),
  ranked as (
    select distinct on (clean_url)
      cleaned.channel_id,
      cleaned.channel_name,
      cleaned.ts,
      cleaned.display_name,
      cleaned.msg_ts,
      cleaned.clean_url as url,
      coalesce(
        nullif(substring(cleaned.clean_url from 'https?://(?:www\.)?([^/]+)'), ''),
        cleaned.clean_url
      ) as title,
      left(regexp_replace(cleaned.text, 'https?://\S+', '', 'g'), 180) as snippet,
      cleaned.reaction_score
    from cleaned
    order by clean_url, cleaned.reaction_score desc, cleaned.msg_ts desc
  )
  select
    ranked.channel_id,
    ranked.channel_name,
    ranked.ts,
    ranked.display_name,
    ranked.msg_ts,
    ranked.url,
    ranked.title,
    ranked.snippet,
    ranked.reaction_score
  from ranked
  order by ranked.reaction_score desc, ranked.msg_ts desc
  limit lim;
end;
$$;

grant execute on function public.channel_recommendations(text, int) to authenticated;
