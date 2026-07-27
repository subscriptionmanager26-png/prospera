import { useEffect, useState } from 'react'
import {
  listInsightChannels,
  getChannelTopReacted,
  getChannelKnowledge,
  getChannelRecommendations,
} from '../lib/communityApi'
import { formatMrkdwn, formatTimestamp } from '../lib/slackExport'

export default function DiscoverPanel({ onOpenMessage, onOpenChannel }) {
  const [channels, setChannels] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [tab, setTab] = useState('knowledge')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [knowledge, setKnowledge] = useState([])
  const [reacted, setReacted] = useState([])
  const [recs, setRecs] = useState([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listInsightChannels()
      .then((rows) => {
        if (cancelled) return
        setChannels(rows)
        const preferred = rows.find(c => c.name === 'read-watch-listen') || rows[0]
        setActiveId(preferred?.id || null)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const active = channels.find(c => c.id === activeId) || null
  const isRecsChannel = active?.name === 'read-watch-listen' || active?.is_recommendations

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    setDetailLoading(true)
    setError('')
    Promise.all([
      getChannelKnowledge(activeId),
      getChannelTopReacted(activeId),
      getChannelRecommendations(activeId),
    ])
      .then(([k, r, rec]) => {
        if (cancelled) return
        setKnowledge(k)
        setReacted(r)
        setRecs(rec)
        setTab(active?.name === 'read-watch-listen' ? 'recs' : 'knowledge')
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [activeId, active?.name])

  if (loading) return <div className="boot">Loading discover…</div>

  return (
    <div className="discover-panel">
      <header className="panel-header compact">
        <h2>Discover</h2>
        <p className="discover-sub">
          Channel knowledge and most-loved posts — excluding social & watercooler.
        </p>
      </header>

      <div className="discover-channel-scroll">
        {channels.map(ch => (
          <button
            key={ch.id}
            type="button"
            className={`discover-channel-chip ${activeId === ch.id ? 'active' : ''}`}
            onClick={() => setActiveId(ch.id)}
          >
            #{ch.name}
          </button>
        ))}
      </div>

      {active && (
        <div className="discover-channel-meta">
          <div className="discover-channel-meta-top">
            <h3>#{active.name}</h3>
            <button type="button" className="text-link-btn" onClick={() => onOpenChannel?.(active.id)}>
              Open channel
            </button>
          </div>
          {(active.purpose || active.topic) && (
            <p className="discover-sub">{active.purpose || active.topic}</p>
          )}
          <p className="discover-sub">
            {Number(active.message_count || 0).toLocaleString()} messages · {active.member_count} members
          </p>
        </div>
      )}

      <div className="discover-tabs">
        {isRecsChannel ? (
          <button type="button" className={tab === 'recs' ? 'active' : ''} onClick={() => setTab('recs')}>
            Recommendations
          </button>
        ) : (
          <button type="button" className={tab === 'knowledge' ? 'active' : ''} onClick={() => setTab('knowledge')}>
            Knowledge
          </button>
        )}
        <button type="button" className={tab === 'reacted' ? 'active' : ''} onClick={() => setTab('reacted')}>
          Most reacted
        </button>
        {!isRecsChannel && (
          <button type="button" className={tab === 'recs' ? 'active' : ''} onClick={() => setTab('recs')}>
            Links
          </button>
        )}
      </div>

      {error && <p className="search-hint" style={{ color: '#ff8faf' }}>{error}</p>}
      {detailLoading ? (
        <p className="search-hint">Loading…</p>
      ) : tab === 'knowledge' ? (
        <InsightList
          empty="No knowledge highlights yet for this channel."
          items={knowledge}
          onOpen={onOpenMessage}
        />
      ) : tab === 'reacted' ? (
        <InsightList
          empty="No reacted messages in this channel."
          items={reacted}
          onOpen={onOpenMessage}
          showScore
        />
      ) : (
        <RecList items={recs} empty="No shared links found in this channel." onOpen={onOpenMessage} />
      )}
    </div>
  )
}

function InsightList({ items, empty, onOpen, showScore }) {
  if (!items?.length) return <p className="search-hint">{empty}</p>
  return (
    <ul className="insight-list">
      {items.map(item => (
        <li key={`${item.channel_id}-${item.ts}`}>
          <button
            type="button"
            className="insight-card"
            onClick={() => onOpen?.({
              channelId: item.channel_id,
              ts: item.ts,
              msg_ts: item.msg_ts,
              timestamp: item.msg_ts,
              thread_ts: item.thread_ts,
            })}
          >
            <div className="insight-meta">
              <span>{item.display_name}</span>
              <time>{formatTimestamp(item.msg_ts)}</time>
              {showScore && <span className="reaction-score">{item.reaction_score} reactions</span>}
            </div>
            <div
              className="insight-text"
              dangerouslySetInnerHTML={{ __html: formatMrkdwn(item.text || '', new Map()) }}
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

function RecList({ items, empty, onOpen }) {
  if (!items?.length) return <p className="search-hint">{empty}</p>
  return (
    <ul className="rec-list">
      {items.map(item => (
        <li key={`${item.url}-${item.ts}`} className="rec-card">
          <a href={item.url} target="_blank" rel="noreferrer" className="rec-title">
            {item.title || item.url}
          </a>
          {item.snippet?.trim() && <p className="rec-snippet">{item.snippet.trim()}</p>}
          <div className="rec-meta">
            <span>{item.display_name}</span>
            {item.reaction_score > 0 && <span>{item.reaction_score} reactions</span>}
            <button
              type="button"
              className="text-link-btn"
              onClick={() => onOpen?.({
                channelId: item.channel_id,
                ts: item.ts,
                msg_ts: item.msg_ts,
                timestamp: item.msg_ts,
              })}
            >
              View in archive
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
