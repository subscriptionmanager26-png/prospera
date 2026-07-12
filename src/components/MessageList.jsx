import { useMemo } from 'react'
import { formatDateLabel } from '../lib/slackExport'
import MessageBubble, { getReplyCount } from './MessageBubble'

export default function MessageList({
  messages,
  userMap,
  activeThreadTs,
  onOpenThread,
}) {
  const items = useMemo(() => {
    const visible = messages.filter(m => !(m.thread_ts && m.thread_ts !== m.ts))
    /** @type {Array<{ type: 'divider' | 'message', key: string, day?: string, message?: any }>} */
    const out = []
    let lastDay = ''

    for (const message of visible) {
      const day = new Date(message.timestamp * 1000).toDateString()
      if (day !== lastDay) {
        out.push({ type: 'divider', key: `d-${day}`, day: formatDateLabel(message.timestamp) })
        lastDay = day
      }
      out.push({ type: 'message', key: message.ts, message })
    }
    return out
  }, [messages])

  if (!messages.length) {
    return (
      <div className="empty-state">
        <h2>No messages here</h2>
        <p>This channel has no messages in the current export.</p>
      </div>
    )
  }

  return (
    <div className="message-list">
      {items.map((item) => {
        if (item.type === 'divider') {
          return <div key={item.key} className="day-divider"><span>{item.day}</span></div>
        }

        const message = item.message
        const replyCount = getReplyCount(messages, message)
        const hasThread = replyCount > 0
        const isActive = activeThreadTs === message.ts

        return (
          <div
            key={item.key}
            className={`message-wrap ${isActive ? 'message-wrap-active' : ''}`}
          >
            <MessageBubble message={message} userMap={userMap} />
            {hasThread && (
              <button
                type="button"
                className={`thread-preview ${isActive ? 'thread-preview-active' : ''}`}
                onClick={() => onOpenThread(message.ts)}
              >
                <span className="thread-preview-avatars" aria-hidden>
                  <img src={message.avatar} alt="" />
                </span>
                <span className="thread-preview-text">
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </span>
                <span className="thread-preview-action">View thread →</span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
