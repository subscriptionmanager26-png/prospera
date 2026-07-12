import { formatMrkdwn, formatTimestamp } from '../lib/slackExport'

const SYSTEM_SUBTYPES = new Set([
  'channel_join', 'channel_leave', 'channel_topic', 'channel_purpose',
  'channel_name', 'channel_archive', 'channel_unarchive', 'group_join', 'group_leave',
])

export function avatarFallback(name, size = 72) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=350d36&color=fff&size=${size}`
}

export default function MessageBubble({ message, userMap, compact = false }) {
  if (message.subtype && SYSTEM_SUBTYPES.has(message.subtype)) {
    return (
      <div className="system-message">
        <span dangerouslySetInnerHTML={{ __html: formatMrkdwn(message.text, userMap) }} />
      </div>
    )
  }

  const body = message.text
    ? formatMrkdwn(message.text, userMap)
    : message.blocks?.length
      ? '<em>[Rich message]</em>'
      : ''

  return (
    <article className={`message-row ${compact ? 'message-row-compact' : ''}`}>
      <img
        className={`avatar ${compact ? 'avatar-sm' : ''}`}
        src={message.avatar || avatarFallback(message.displayName, compact ? 48 : 72)}
        alt=""
        loading="lazy"
      />
      <div className="message-body">
        <header className="message-meta">
          <strong>{message.displayName}</strong>
          <time dateTime={new Date(message.timestamp * 1000).toISOString()}>
            {formatTimestamp(message.timestamp)}
          </time>
        </header>
        {body && <div className="message-text" dangerouslySetInnerHTML={{ __html: body }} />}
        {message.reactions?.length > 0 && (
          <div className="reactions">
            {message.reactions.map(r => (
              <span key={r.name} className="reaction">:{r.name}: {r.count}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * @param {import('../lib/types').SlackMessage[]} messages
 * @param {import('../lib/types').SlackMessage} parent
 */
export function getReplyCount(messages, parent) {
  const replies = messages.filter(m => m.thread_ts === parent.ts && m.ts !== parent.ts)
  return replies.length || parent.reply_count || 0
}

/**
 * @param {import('../lib/types').SlackMessage[]} messages
 * @param {string} parentTs
 */
export function getThreadReplies(messages, parentTs) {
  return messages
    .filter(m => m.thread_ts === parentTs && m.ts !== parentTs)
    .sort((a, b) => a.timestamp - b.timestamp)
}
