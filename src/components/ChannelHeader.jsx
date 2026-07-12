export default function ChannelHeader({ conversation, search, onSearchChange }) {
  const description = conversation.topic || conversation.purpose

  return (
    <header className="channel-header">
      <div className="channel-header-main">
        <h2>
          <span className="channel-hash-lg">#</span>
          {conversation.name}
        </h2>
        {description && <p className="channel-description">{description}</p>}
        <div className="channel-stats">
          <span>{conversation.memberCount} members</span>
          <span>·</span>
          <span>{conversation.messages.length} messages</span>
        </div>
      </div>
      <input
        type="search"
        className="channel-search"
        placeholder={`Search #${conversation.name}`}
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />
    </header>
  )
}
