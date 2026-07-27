import { useEffect, useMemo, useState } from 'react'
import { searchExperts, upsertExpertProfile, getMyExpertProfile } from '../lib/communityApi'

export default function ExpertsPanel({ userEmail, sessionName }) {
  const [query, setQuery] = useState('')
  const [experts, setExperts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [mine, setMine] = useState(null)
  const [displayName, setDisplayName] = useState(sessionName || '')
  const [bio, setBio] = useState('')
  const [topicInput, setTopicInput] = useState('')
  const [topics, setTopics] = useState([])
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    getMyExpertProfile()
      .then((row) => {
        if (cancelled || !row) return
        setMine(row)
        setDisplayName(row.display_name || '')
        setBio(row.bio || '')
        setTopics(row.topics || [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const t = setTimeout(() => {
      searchExperts(query)
        .then((rows) => { if (!cancelled) setExperts(rows) })
        .catch((err) => { if (!cancelled) setError(err.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  const addTopic = () => {
    const next = topicInput.trim().toLowerCase()
    if (!next || topics.includes(next) || topics.length >= 12) return
    setTopics([...topics, next])
    setTopicInput('')
  }

  const removeTopic = (topic) => {
    setTopics(topics.filter(t => t !== topic))
  }

  const onSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setSavedMsg('')
    setError('')
    try {
      const row = await upsertExpertProfile({ displayName, bio, topics })
      setMine(row)
      setSavedMsg('Expert profile saved')
      const rows = await searchExperts(query)
      setExperts(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  const filteredHint = useMemo(() => {
    if (loading) return 'Loading experts…'
    if (!experts.length) return query.trim() ? `No experts match “${query}”.` : 'No experts yet — be the first to list your topics.'
    return null
  }, [loading, experts, query])

  return (
    <div className="discover-panel">
      <header className="panel-header compact">
        <h2>Experts</h2>
        <p className="discover-sub">Find people by the topics they can help with.</p>
      </header>

      <form className="expert-edit-card" onSubmit={onSave}>
        <h3>Your topics</h3>
        <p className="discover-sub">Add keywords others can search — e.g. taxes, visas, mutual funds.</p>
        <label htmlFor="expert-name">Display name</label>
        <input
          id="expert-name"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder={userEmail?.split('@')[0] || 'Your name'}
        />
        <label htmlFor="expert-bio">Short bio (optional)</label>
        <input
          id="expert-bio"
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="One line about how you can help"
        />
        <label htmlFor="expert-topic">Add topic</label>
        <div className="topic-add-row">
          <input
            id="expert-topic"
            value={topicInput}
            onChange={e => setTopicInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTopic()
              }
            }}
            placeholder="Type a keyword and press Enter"
          />
          <button type="button" className="secondary-btn" onClick={addTopic}>Add</button>
        </div>
        <div className="topic-chips">
          {topics.map(topic => (
            <button key={topic} type="button" className="topic-chip" onClick={() => removeTopic(topic)}>
              {topic} ×
            </button>
          ))}
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : mine ? 'Update profile' : 'Publish profile'}
        </button>
        {savedMsg && <p className="form-ok">{savedMsg}</p>}
      </form>

      <div className="discover-search-wrap">
        <input
          type="search"
          className="search-panel-input"
          placeholder="Search experts by topic or name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="search-hint" style={{ color: '#ff8faf' }}>{error}</p>}
      {filteredHint ? (
        <p className="search-hint">{filteredHint}</p>
      ) : (
        <ul className="expert-list">
          {experts.map(ex => (
            <li key={ex.user_id} className="expert-card">
              <div className="expert-card-top">
                <strong>{ex.display_name || 'Member'}</strong>
                {ex.email && <span className="expert-email">{ex.email}</span>}
              </div>
              {ex.bio && <p className="expert-bio">{ex.bio}</p>}
              <div className="topic-chips readonly">
                {(ex.topics || []).map(topic => (
                  <button
                    key={topic}
                    type="button"
                    className="topic-chip"
                    onClick={() => setQuery(topic)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
