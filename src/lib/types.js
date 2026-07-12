/**
 * @typedef {object} SlackUser
 * @property {string} id
 * @property {string} name
 * @property {string} real_name
 * @property {boolean} deleted
 * @property {boolean} is_bot
 * @property {boolean} [is_admin]
 * @property {{ display_name?: string, real_name?: string, email?: string, image_72?: string, title?: string }} profile
 */

/**
 * @typedef {object} SlackChannel
 * @property {string} id
 * @property {string} name
 * @property {boolean} [is_general]
 * @property {{ value?: string }} [topic]
 * @property {{ value?: string }} [purpose]
 * @property {string[]} [members]
 */

/**
 * @typedef {object} SlackMessage
 * @property {string} type
 * @property {string} [subtype]
 * @property {string} ts
 * @property {string} [thread_ts]
 * @property {string} [user]
 * @property {string} [text]
 * @property {string} [username]
 * @property {string} [bot_id]
 * @property {boolean} [hidden]
 * @property {number} [reply_count]
 * @property {{ display_name?: string, real_name?: string, image_72?: string }} [user_profile]
 * @property {Array<{ name: string, count: number }>} [reactions]
 * @property {unknown[]} [blocks]
 * @property {unknown[]} [files]
 * @property {string} [channel]
 * @property {string} [channelName]
 * @property {string} [channelId]
 * @property {string} [channelLabel]
 * @property {string} [displayName]
 * @property {string} [avatar]
 * @property {number} [timestamp]
 */

/**
 * @typedef {object} Conversation
 * @property {string} id
 * @property {string} name
 * @property {'general' | 'channel' | 'private' | 'dm' | 'mpim'} kind
 * @property {string} topic
 * @property {string} purpose
 * @property {SlackMessage[]} messages
 * @property {number} memberCount
 * @property {{ from: number, to: number } | null} dateRange
 */

/**
 * @typedef {object} WorkspaceData
 * @property {SlackUser[]} users
 * @property {Map<string, SlackUser>} userMap
 * @property {Map<string, SlackChannel>} channelMap
 * @property {Conversation[]} conversations
 * @property {unknown[]} dms
 * @property {unknown[]} mpims
 * @property {unknown[]} canvases
 * @property {{ userCount: number, channelCount: number, messageCount: number, threadCount: number, hasMessages: boolean, dateRange: { from: number, to: number } | null }} stats
 */

export {}
