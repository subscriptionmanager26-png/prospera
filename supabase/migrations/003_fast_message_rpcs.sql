-- Fast counts + channel message fetch for the app (bypass per-row RLS cost)
-- Run in Supabase SQL Editor

create or replace function public.channel_message_counts()
returns table (channel_id text, message_count bigint)
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
  select m.channel_id, count(*)::bigint
  from public.slack_messages m
  where coalesce(m.hidden, false) = false
  group by m.channel_id;
end;
$$;

create or replace function public.get_channel_messages(
  p_channel_id text,
  p_offset int default 0,
  p_limit int default 500
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
    m.subtype,
    m.reply_count,
    m.reactions,
    m.hidden,
    m.msg_ts
  from public.slack_messages m
  where m.channel_id = p_channel_id
    and coalesce(m.hidden, false) = false
  order by m.msg_ts asc
  limit greatest(1, least(coalesce(p_limit, 500), 1000))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

grant execute on function public.channel_message_counts() to authenticated;
grant execute on function public.get_channel_messages(text, int, int) to authenticated;

create index if not exists slack_messages_channel_msg_ts_idx
  on public.slack_messages (channel_id, msg_ts);
