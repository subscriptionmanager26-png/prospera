import { useEffect, useMemo, useRef } from 'react'
import { formatDateLabel } from '../lib/slackExport'
import MessageBubble, { getReplyCount } from './MessageBubble'

export default function MessageList({
  messages,
  userMap,
  activeThreadTs,
  onOpenThread,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  scrollToBottomToken = 0,
  highlightTs = null,
}) {
  const listRef = useRef(null)
  const pendingScrollRestore = useRef(null)
  const didInitialScroll = useRef(false)

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

  // After prepending older messages, keep the viewport stable
  useEffect(() => {
    const el = listRef.current
    if (!el || !pendingScrollRestore.current) return
    const { prevHeight } = pendingScrollRestore.current
    el.scrollTop = el.scrollHeight - prevHeight
    pendingScrollRestore.current = null
  }, [messages])

  // Initial open / channel switch: jump to latest
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    didInitialScroll.current = false
  }, [scrollToBottomToken])

  useEffect(() => {
    const el = listRef.current
    if (!el || !messages.length || didInitialScroll.current) return
    if (highlightTs) {
      const node = el.querySelector(`[data-ts="${CSS.escape(highlightTs)}"]`)
      if (node) {
        node.scrollIntoView({ block: 'center' })
        didInitialScroll.current = true
        return
      }
    }
    el.scrollTop = el.scrollHeight
    didInitialScroll.current = true
  }, [messages, scrollToBottomToken, highlightTs])

  const onScroll = () => {
    const el = listRef.current
    if (!el || !onLoadOlder || !hasMoreOlder || loadingOlder) return
    if (el.scrollTop <= 80) {
      pendingScrollRestore.current = { prevHeight: el.scrollHeight }
      onLoadOlder()
    }
  }

  if (!messages.length) {
    return (
      <div className="empty-state">
        <h2>No messages here</h2>
        <p>This channel has no messages in the current export.</p>
      </div>
    )
  }

  return (
    <div className="message-list" ref={listRef} onScroll={onScroll}>
      <div className="message-list-top">
        {loadingOlder ? (
          <p className="load-older-hint">Loading earlier messages…</p>
        ) : hasMoreOlder ? (
          <button type="button" className="load-older-btn" onClick={() => {
            const el = listRef.current
            if (el) pendingScrollRestore.current = { prevHeight: el.scrollHeight }
            onLoadOlder?.()
          }}>
            Load earlier messages
          </button>
        ) : (
          <p className="load-older-hint">Beginning of channel</p>
        )}
      </div>

      {items.map((item) => {
        if (item.type === 'divider') {
          return <div key={item.key} className="day-divider"><span>{item.day}</span></div>
        }

        const message = item.message
        const replyCount = getReplyCount(messages, message)
        const hasThread = replyCount > 0
        const isActive = activeThreadTs === message.ts
        const isHighlight = highlightTs && highlightTs === message.ts

        return (
          <div
            key={item.key}
            data-ts={message.ts}
            className={`message-wrap ${isActive ? 'message-wrap-active' : ''} ${isHighlight ? 'message-wrap-highlight' : ''}`}
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
