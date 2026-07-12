import { TextWriter } from '@zip.js/zip.js'

/** @typedef {import('./types').SlackUser} SlackUser */
/** @typedef {import('./types').SlackChannel} SlackChannel */
/** @typedef {import('./types').SlackMessage} SlackMessage */
/** @typedef {import('./types').WorkspaceData} WorkspaceData */

const ROOT_JSON_FILES = new Set([
  'users.json',
  'channels.json',
  'groups.json',
  'dms.json',
  'mpims.json',
  'canvases.json',
  'file_conversations.json',
  'integration_logs.json',
  'huddle_transcripts.json',
  'lists.json',
])

/**
 * @param {import('@zip.js/zip.js').Entry[]} entries
 */
export async function parseZipExport(entries) {
  /** @type {Record<string, any[]>} */
  const rootData = {}
  /** @type {Record<string, SlackMessage[]>} */
  const messagesByChannel = {}

  for (const entry of entries) {
    if (entry.directory || !entry.filename.endsWith('.json')) continue

    const name = entry.filename.replace(/\/$/, '')
    const parts = name.split('/')
    const writer = new TextWriter('utf-8')
    const raw = await entry.getData?.(writer)
    if (!raw) continue

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    if (parts.length === 1 && ROOT_JSON_FILES.has(parts[0])) {
      const key = parts[0].replace('.json', '')
      rootData[key] = Array.isArray(parsed) ? parsed : [parsed]
      continue
    }

    if (parts.length === 2) {
      const [channelName, fileName] = parts
      if (!fileName.match(/^\d{4}-\d{2}-\d{2}\.json$/)) continue
      const msgs = Array.isArray(parsed) ? parsed : []
      if (!messagesByChannel[channelName]) messagesByChannel[channelName] = []
      messagesByChannel[channelName].push(...msgs)
    }
  }

  return buildWorkspace(rootData, messagesByChannel)
}

/**
 * @param {Record<string, any[]>} rootData
 * @param {Record<string, SlackMessage[]>} messagesByChannel
 * @returns {WorkspaceData}
 */
export function buildWorkspace(rootData, messagesByChannel) {
  const users = /** @type {SlackUser[]} */ (rootData.users ?? [])
  const channels = /** @type {SlackChannel[]} */ (rootData.channels ?? [])
  const groups = /** @type {SlackChannel[]} */ (rootData.groups ?? [])
  const dms = rootData.dms ?? []
  const mpims = rootData.mpims ?? []
  const canvases = rootData.canvases ?? []

  const userMap = new Map(users.map(u => [u.id, u]))
  const channelMap = new Map()

  for (const ch of [...channels, ...groups]) {
    channelMap.set(ch.id, ch)
    channelMap.set(ch.name, ch)
  }

  /** @type {import('./types').Conversation[]} */
  const conversations = []

  for (const ch of channels) {
    const messages = normalizeMessages(messagesByChannel[ch.name] ?? [], ch.id, ch.name, userMap)
    conversations.push(makeConversation(ch, messages, ch.is_general ? 'general' : 'channel'))
  }

  for (const ch of groups) {
    const messages = normalizeMessages(messagesByChannel[ch.name] ?? [], ch.id, ch.name, userMap)
    conversations.push(makeConversation(ch, messages, 'private'))
  }

  for (const [folderName, rawMessages] of Object.entries(messagesByChannel)) {
    if (conversations.some(c => c.name === folderName)) continue
    const kind = folderName.startsWith('D') ? 'dm' : folderName.startsWith('G') ? 'mpim' : 'channel'
    conversations.push({
      id: folderName,
      name: folderName,
      kind,
      topic: '',
      purpose: '',
      messages: normalizeMessages(rawMessages, folderName, folderName, userMap),
      memberCount: 0,
      dateRange: dateRangeForMessages(normalizeMessages(rawMessages, folderName, folderName, userMap)),
    })
  }

  conversations.sort((a, b) => {
    if (a.kind === 'general') return -1
    if (b.kind === 'general') return 1
    return b.messages.length - a.messages.length || a.name.localeCompare(b.name)
  })

  const allMessages = conversations.flatMap(c => c.messages)
  const threadParents = new Set(
    allMessages.filter(m => m.reply_count > 0 || allMessages.some(r => r.thread_ts === m.ts && r.ts !== m.ts)).map(m => m.ts),
  )

  return {
    users,
    userMap,
    channelMap,
    conversations,
    dms,
    mpims,
    canvases,
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

/** @param {SlackChannel} ch @param {SlackMessage[]} messages @param {import('./types').Conversation['kind']} kind */
function makeConversation(ch, messages, kind) {
  return {
    id: ch.id,
    name: ch.name,
    kind,
    topic: ch.topic?.value ?? '',
    purpose: ch.purpose?.value ?? '',
    messages,
    memberCount: ch.members?.length ?? 0,
    dateRange: dateRangeForMessages(messages),
  }
}

/** @param {SlackMessage[]} messages */
function dateRangeForMessages(messages) {
  if (!messages.length) return null
  const min = Math.min(...messages.map(m => m.timestamp))
  const max = Math.max(...messages.map(m => m.timestamp))
  return { from: min, to: max }
}

/**
 * @param {SlackMessage[]} raw
 * @param {string} channelId
 * @param {string} channelName
 * @param {Map<string, SlackUser>} userMap
 */
function normalizeMessages(raw, channelId, channelName, userMap) {
  return raw
    .filter(m => m.type === 'message' && m.hidden !== true)
    .map(m => {
      const user = m.user ? userMap.get(m.user) : undefined
      const profile = m.user_profile ?? user?.profile
      const displayName = profile?.display_name || profile?.real_name || user?.real_name || user?.name || m.username || 'Unknown'
      return {
        ...m,
        channel: m.channel ?? channelId,
        channelName,
        displayName,
        avatar: profile?.image_72 || user?.profile?.image_72 || '',
        timestamp: Number.parseFloat(m.ts),
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp)
}

/** Load bundled export from /public/export */
export async function loadBundledExport() {
  const rootFiles = ['users', 'channels', 'groups', 'dms', 'mpims', 'canvases']
  /** @type {Record<string, any[]>} */
  const rootData = {}
  /** @type {Record<string, SlackMessage[]>} */
  const messagesByChannel = {}

  await Promise.all(
    rootFiles.map(async (name) => {
      try {
        const res = await fetch(`/export/${name}.json`)
        if (!res.ok) return
        const data = await res.json()
        rootData[name] = Array.isArray(data) ? data : [data]
      } catch {
        // optional
      }
    }),
  )

  try {
    const indexRes = await fetch('/export/index.json')
    if (indexRes.ok) {
      /** @type {Record<string, string[]>} */
      const index = await indexRes.json()
      await Promise.all(
        Object.entries(index).flatMap(([channel, files]) =>
          files.map(async (file) => {
            const res = await fetch(`/export/${channel}/${file}`)
            if (!res.ok) return
            const data = await res.json()
            const msgs = Array.isArray(data) ? data : []
            if (!messagesByChannel[channel]) messagesByChannel[channel] = []
            messagesByChannel[channel].push(...msgs)
          }),
        ),
      )
    }
  } catch {
    // no index
  }

  return buildWorkspace(rootData, messagesByChannel)
}

/**
 * @param {import('./types').WorkspaceData} workspace
 * @param {string} query
 */
export function searchWorkspace(workspace, query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results = []
  for (const conv of workspace.conversations) {
    for (const msg of conv.messages) {
      if ((msg.text || '').toLowerCase().includes(q) || (msg.displayName || '').toLowerCase().includes(q)) {
        results.push({ ...msg, channelId: conv.id, channelLabel: conv.name })
      }
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50)
}

/**
 * @param {string} text
 * @param {Map<string, SlackUser>} userMap
 */
export function formatMrkdwn(text, userMap) {
  if (!text) return ''

  let html = escapeHtml(text)

  html = html.replace(/&lt;(https?:\/\/[^|>]+)\|([^>]+)&gt;/g, '<a href="$1" target="_blank" rel="noreferrer">$2</a>')
  html = html.replace(/&lt;(https?:\/\/[^>]+)&gt;/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
  html = html.replace(/&lt;@(U[A-Z0-9]+)(?:\|([^>]*))?&gt;/g, (_, id, label) => {
    const user = userMap.get(id)
    const name = label || user?.profile?.display_name || user?.real_name || user?.name || id
    return `<span class="mention">@${escapeHtml(name)}</span>`
  })
  html = html.replace(/&lt;#(C[A-Z0-9]+)(?:\|([^>]*))?&gt;/g, (_, _id, label) => `<span class="channel-ref">#${escapeHtml(label || 'channel')}</span>`)
  html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')
  html = html.replace(/~([^~]+)~/g, '<s>$1</s>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/:([a-z0-9_+-]+):/g, '<span class="emoji">:$1:</span>')

  return html
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatTimestamp(ts, { timeOnly = false } = {}) {
  const d = new Date(ts * 1000)
  if (timeOnly) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDateLabel(ts) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatDateRange(range) {
  if (!range) return '—'
  const fmt = (ts) => new Date(ts * 1000).toLocaleDateString([], { month: 'short', year: 'numeric' })
  return `${fmt(range.from)} – ${fmt(range.to)}`
}
