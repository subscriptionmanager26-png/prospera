-- Pagination + stronger archive search
-- (Also applied via MCP; kept here for the repo)

drop function if exists public.get_channel_messages(text, int, double precision);
drop function if exists public.get_channel_messages(text, int, double precision, double precision);
drop function if exists public.search_slack_messages(text, int);
drop function if exists public.search_slack_messages(text, int, text);

create or replace function public.get_channel_messages(
  p_channel_id text,
  p_limit int default 60,
  p_around_ts double precision default null,
  p_before_ts double precision default null
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
  subtype text,
  reply_count int,
  reactions jsonb,
  hidden boolean,
  msg_ts double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 60), 60));
  half int;
begin
  if not public.is_allowlisted() then
    return;
  end if;

  if p_before_ts is not null then
    return query
    select *
    from (
      select
        m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
        m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
        m.reactions, m.hidden, m.msg_ts
      from public.slack_messages m
      where m.channel_id = p_channel_id
        and coalesce(m.hidden, false) = false
        and m.msg_ts < p_before_ts
      order by m.msg_ts desc
      limit lim
    ) older
    order by older.msg_ts asc;
    return;
  end if;

  if p_around_ts is not null then
    half := greatest(1, lim / 2);
    return query
    with around as (
      (
        select
          m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
          m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
          m.reactions, m.hidden, m.msg_ts
        from public.slack_messages m
        where m.channel_id = p_channel_id
          and coalesce(m.hidden, false) = false
          and m.msg_ts <= p_around_ts
        order by m.msg_ts desc
        limit half
      )
      union all
      (
        select
          m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
          m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
          m.reactions, m.hidden, m.msg_ts
        from public.slack_messages m
        where m.channel_id = p_channel_id
          and coalesce(m.hidden, false) = false
          and m.msg_ts > p_around_ts
        order by m.msg_ts asc
        limit lim - half
      )
    )
    select * from around order by msg_ts asc;
    return;
  end if;

  return query
  select *
  from (
    select
      m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
      m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
      m.reactions, m.hidden, m.msg_ts
    from public.slack_messages m
    where m.channel_id = p_channel_id
      and coalesce(m.hidden, false) = false
    order by m.msg_ts desc
    limit lim
  ) recent
  order by recent.msg_ts asc;
end;
$$;

create or replace function public.search_slack_messages(
  q text,
  lim int default 50,
  p_channel_id text default null
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
  msg_ts double precision,
  rank real
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  query_limit int := greatest(1, least(coalesce(lim, 50), 50));
  tsq tsquery;
  cleaned text := trim(coalesce(q, ''));
begin
  if not public.is_allowlisted() then
    return;
  end if;

  if cleaned = '' then
    return;
  end if;

  begin
    tsq := websearch_to_tsquery('english', cleaned);
  exception when others then
    tsq := plainto_tsquery('english', cleaned);
  end;

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
    m.msg_ts,
    case
      when tsq is not null and tsq <> ''::tsquery and m.search_vector @@ tsq
        then ts_rank(m.search_vector, tsq)
      else 0.1
    end as rank
  from public.slack_messages m
  where coalesce(m.hidden, false) = false
    and (p_channel_id is null or m.channel_id = p_channel_id)
    and (
      (tsq is not null and tsq <> ''::tsquery and m.search_vector @@ tsq)
      or m.text ilike '%' || cleaned || '%'
      or coalesce(m.display_name, '') ilike '%' || cleaned || '%'
    )
  order by rank desc, m.msg_ts desc
  limit query_limit;
end;
$$;

grant execute on function public.get_channel_messages(text, int, double precision, double precision) to authenticated;
grant execute on function public.search_slack_messages(text, int, text) to authenticated;
