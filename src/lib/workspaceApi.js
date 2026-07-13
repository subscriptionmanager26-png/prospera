import { supabase } from './supabase'

/**
 * Load workspace metadata from Supabase (RLS-gated by allowlist).
 * Messages are loaded per-channel via loadChannelMessages().
 */
export async function loadWorkspaceFromSupabase() {
  const { data: allowed, error: allowErr } = await supabase
    .from('allowed_emails')
    .select('email')
    .maybeSingle()

  if (allowErr) throw new Error(allowErr.message)
  if (!allowed) {
    const err = new Error('Your email is not on the access list')
    err.code = 'FORBIDDEN'
    throw err
  }

  const [usersRes, channelsRes, countsRes] = await Promise.all([
    supabase.from('slack_users').select('id,name,real_name,display_name,email,avatar_72,is_admin,is_bot,deleted'),
    supabase.from('slack_channels').select('id,name,kind,topic,purpose,member_count,is_general'),
    supabase.rpc('channel_message_counts'),
  ])

  if (usersRes.error) throw new Error(usersRes.error.message)
  if (channelsRes.error) throw new Error(channelsRes.error.message)

  // Fallback if RPC missing: empty counts
  const countMap = new Map()
  if (!countsRes.error && countsRes.data) {
    for (const row of countsRes.data) {
      countMap.set(row.channel_id, Number(row.message_count) || 0)
    }
  }

  const users = (usersRes.data || []).map(u => ({
    id: u.id,
    name: u.name,
    real_name: u.real_name,
    profile: {
      display_name: u.display_name,
      real_name: u.real_name,
      email: u.email,
      image_72: u.avatar_72,
    },
    is_admin: u.is_admin,
    is_bot: u.is_bot,
    deleted: u.deleted,
  }))

  const userMap = new Map(users.map(u => [u.id, u]))

  const conversations = (channelsRes.data || []).map(ch => {
    const messageCount = countMap.get(ch.id) || 0
    return {
      id: ch.id,
      name: ch.name,
      kind: ch.kind || (ch.is_general ? 'general' : 'channel'),
      topic: ch.topic || '',
      purpose: ch.purpose || '',
      messages: [],
      messagesLoaded: false,
      messageCount,
      memberCount: ch.member_count || 0,
      dateRange: null,
    }
  })

  conversations.sort((a, b) => {
    if (a.kind === 'general') return -1
    if (b.kind === 'general') return 1
    return b.messageCount - a.messageCount || a.name.localeCompare(b.name)
  })

  const totalMessages = conversations.reduce((n, c) => n + c.messageCount, 0)

  return {
    users,
    userMap,
    channelMap: new Map(conversations.flatMap(c => [[c.id, c], [c.name, c]])),
    conversations,
    canvases: [],
    dms: [],
    mpims: [],
    stats: {
      userCount: users.length,
      channelCount: conversations.length,
      messageCount: totalMessages,
      threadCount: 0,
      hasMessages: totalMessages > 0,
      dateRange: null,
    },
  }
}

/**
 * Load all messages for one channel via security-definer RPC (avoids RLS timeouts).
 */
export async function loadChannelMessages(channelId) {
  const pageSize = 500
  let offset = 0
  const rows = []

  for (;;) {
    const { data, error } = await supabase.rpc('get_channel_messages', {
      p_channel_id: channelId,
      p_offset: offset,
      p_limit: pageSize,
    })

    if (error) throw new Error(error.message)
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return rows.map(m => ({
    type: 'message',
    ts: m.ts,
    thread_ts: m.thread_ts || undefined,
    user: m.user_id || undefined,
    text: m.text || '',
    subtype: m.subtype || undefined,
    reply_count: m.reply_count || 0,
    reactions: m.reactions || [],
    channel: m.channel_id,
    channelName: m.channel_name,
    displayName: m.display_name,
    avatar: m.avatar || '',
    timestamp: m.msg_ts,
  }))
}

export async function searchMessages(query) {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_slack_messages', { q, lim: 50 })
  if (error) throw new Error(error.message)
  return (data || []).map(m => ({
    channelId: m.channel_id,
    channelLabel: m.channel_name,
    ts: m.ts,
    thread_ts: m.thread_ts,
    text: m.text,
    displayName: m.display_name,
    avatar: m.avatar,
    timestamp: m.msg_ts,
  }))
}
