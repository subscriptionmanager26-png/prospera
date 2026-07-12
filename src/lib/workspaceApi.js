import { supabase } from './supabase'

/**
 * Load workspace from Supabase (RLS-gated by allowlist).
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

  const [usersRes, channelsRes, messagesRes] = await Promise.all([
    supabase.from('slack_users').select('id,name,real_name,display_name,email,avatar_72,is_admin,is_bot,deleted'),
    supabase.from('slack_channels').select('id,name,kind,topic,purpose,member_count,is_general'),
    supabase.from('slack_messages').select('channel_id,channel_name,ts,thread_ts,user_id,display_name,avatar,text,subtype,reply_count,reactions,blocks,hidden,msg_ts').order('msg_ts', { ascending: true }),
  ])

  for (const res of [usersRes, channelsRes, messagesRes]) {
    if (res.error) throw new Error(res.error.message)
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
  const messagesByChannel = {}
  for (const m of messagesRes.data || []) {
    if (m.hidden) continue
    const msg = {
      type: 'message',
      ts: m.ts,
      thread_ts: m.thread_ts || undefined,
      user: m.user_id || undefined,
      text: m.text || '',
      subtype: m.subtype || undefined,
      reply_count: m.reply_count || 0,
      reactions: m.reactions || [],
      blocks: m.blocks || undefined,
      channel: m.channel_id,
      channelName: m.channel_name,
      displayName: m.display_name,
      avatar: m.avatar || '',
      timestamp: m.msg_ts,
    }
    if (!messagesByChannel[m.channel_name]) messagesByChannel[m.channel_name] = []
    messagesByChannel[m.channel_name].push(msg)
  }

  const conversations = (channelsRes.data || []).map(ch => {
    const messages = messagesByChannel[ch.name] || []
    return {
      id: ch.id,
      name: ch.name,
      kind: ch.kind || (ch.is_general ? 'general' : 'channel'),
      topic: ch.topic || '',
      purpose: ch.purpose || '',
      messages,
      memberCount: ch.member_count || 0,
      dateRange: dateRangeForMessages(messages),
    }
  })

  conversations.sort((a, b) => {
    if (a.kind === 'general') return -1
    if (b.kind === 'general') return 1
    return b.messages.length - a.messages.length || a.name.localeCompare(b.name)
  })

  const allMessages = conversations.flatMap(c => c.messages)
  const threadParents = new Set(
    allMessages
      .filter(m => m.reply_count > 0 || allMessages.some(r => r.thread_ts === m.ts && r.ts !== m.ts))
      .map(m => m.ts),
  )

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
      messageCount: allMessages.length,
      threadCount: threadParents.size,
      hasMessages: allMessages.length > 0,
      dateRange: dateRangeForMessages(allMessages),
    },
  }
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

function dateRangeForMessages(messages) {
  if (!messages.length) return null
  const min = Math.min(...messages.map(m => m.timestamp))
  const max = Math.max(...messages.map(m => m.timestamp))
  return { from: min, to: max }
}
