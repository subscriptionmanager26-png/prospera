import { supabase } from './supabase'

export async function recordSignIn(method = 'unknown') {
  const { error } = await supabase.rpc('record_sign_in', { p_method: method })
  if (error) console.warn('record_sign_in failed', error.message)
}

export async function getMyExpertProfile() {
  const { data, error } = await supabase.rpc('get_my_expert_profile')
  if (error) throw new Error(error.message)
  return data
}

export async function upsertExpertProfile({ displayName, bio, topics }) {
  const { data, error } = await supabase.rpc('upsert_expert_profile', {
    p_display_name: displayName || '',
    p_bio: bio || '',
    p_topics: topics || [],
  })
  if (error) throw new Error(error.message)
  return data
}

export async function searchExperts(query = '', limit = 50) {
  const { data, error } = await supabase.rpc('search_experts', {
    p_query: query,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function listInsightChannels() {
  const { data, error } = await supabase.rpc('insight_channels')
  if (error) throw new Error(error.message)
  return data || []
}

export async function getChannelTopReacted(channelId, limit = 25) {
  const { data, error } = await supabase.rpc('channel_top_reacted', {
    p_channel_id: channelId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getChannelKnowledge(channelId, limit = 12) {
  const { data, error } = await supabase.rpc('channel_knowledge', {
    p_channel_id: channelId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getChannelRecommendations(channelId, limit = 40) {
  const { data, error } = await supabase.rpc('channel_recommendations', {
    p_channel_id: channelId,
    p_limit: limit,
  })
  if (error) throw new Error(error.message)
  return data || []
}

export function detectSignInMethod(session) {
  const provider = session?.user?.app_metadata?.provider
  const providers = session?.user?.app_metadata?.providers
  if (provider === 'slack_oidc' || (Array.isArray(providers) && providers.includes('slack_oidc'))) {
    return 'slack_oidc'
  }
  return 'email_password'
}
