-- Fix ambiguous "url" in channel_recommendations:
-- RETURNS TABLE OUT param "url" shadowed CTE column "url".

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
      (regexp_matches(m.text, 'https?://[^\s<>\]\|]+', 'gi'))[1] as raw_url
    from public.slack_messages m
    join public.slack_channels c on c.id = m.channel_id
    where m.channel_id = p_channel_id
      and c.name is distinct from 'social-and-watercooler'
      and coalesce(m.hidden, false) = false
      and m.text ~* 'https?://'
  ),
  cleaned as (
    select
      msgs.channel_id,
      msgs.channel_name,
      msgs.ts,
      msgs.display_name,
      msgs.msg_ts,
      msgs.text,
      msgs.reaction_score,
      regexp_replace(msgs.raw_url, '[\)\]>,.]+$', '') as clean_url
    from msgs
    where msgs.raw_url is not null
  ),
  ranked as (
    select distinct on (cleaned.clean_url)
      cleaned.channel_id,
      cleaned.channel_name,
      cleaned.ts,
      cleaned.display_name,
      cleaned.msg_ts,
      cleaned.clean_url,
      coalesce(
        nullif(substring(cleaned.clean_url from 'https?://(?:www\.)?([^/]+)'), ''),
        cleaned.clean_url
      ) as link_title,
      left(regexp_replace(cleaned.text, 'https?://\S+', '', 'g'), 180) as link_snippet,
      cleaned.reaction_score
    from cleaned
    order by cleaned.clean_url, cleaned.reaction_score desc, cleaned.msg_ts desc
  )
  select
    ranked.channel_id,
    ranked.channel_name,
    ranked.ts,
    ranked.display_name,
    ranked.msg_ts,
    ranked.clean_url,
    ranked.link_title,
    ranked.link_snippet,
    ranked.reaction_score
  from ranked
  order by ranked.reaction_score desc, ranked.msg_ts desc
  limit lim;
end;
$$;

grant execute on function public.channel_recommendations(text, int) to authenticated;
