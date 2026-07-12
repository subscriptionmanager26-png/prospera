import MessageBubble, { getThreadReplies } from './MessageBubble'
import { formatTimestamp } from '../lib/slackExport'

export default function ThreadPanel({
  channelName,
  parent,
  messages,
  userMap,
  onClose,
}) {
  if (!parent) return null

  const replies = getThreadReplies(messages, parent.ts)

  return (
    <aside className="thread-panel" aria-label="Thread">
      <header className="thread-panel-header">
        <div>
          <h3>Thread</h3>
          <p className="thread-panel-channel">#{channelName}</p>
        </div>
        <button type="button" className="thread-close" onClick={onClose} aria-label="Close thread">
          ✕
        </button>
      </header>

      <div className="thread-panel-body">
        <div className="thread-parent">
          <MessageBubble message={parent} userMap={userMap} />
        </div>

        {replies.length > 0 ? (
          <div className="thread-replies-section">
            <div className="thread-replies-label">
              {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            </div>
            {replies.map(reply => (
              <MessageBubble key={reply.ts} message={reply} userMap={userMap} compact />
            ))}
          </div>
        ) : parent.reply_count > 0 ? (
          <p className="thread-empty-hint">
            {parent.reply_count} {parent.reply_count === 1 ? 'reply' : 'replies'} not included in this export file.
          </p>
        ) : null}
      </div>

      <footer className="thread-panel-footer">
        <span>Started {formatTimestamp(parent.timestamp)}</span>
      </footer>
    </aside>
  )
}
