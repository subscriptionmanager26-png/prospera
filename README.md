# SaffronAI Slack Archive

Private Slack export viewer for the SaffronAI Community.

## Security model

- Magic-link email login via Supabase Auth
- Access gated by `allowed_emails` (whitelist)
- Archive data lives in Supabase Postgres (not in this repo)
- Optional private Storage bucket `slack-exports` for ZIP backups
- Full-text search via Postgres `search_slack_messages`

**Do not commit Slack export ZIPs, `data/`, or seed emails.**

## Environment

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_or_publishable_key
```

## Local

```bash
npm install
cp .env.example .env.local   # fill values
npm run dev
```

## Deploy (Vercel)

1. Set the two env vars above
2. In Supabase Auth → URL Configuration, set Site URL to your Vercel domain and add redirect URLs
3. Deploy the app

## Updating archive data

Ingest new Slack exports into Supabase tables (`slack_channels`, `slack_messages`, `slack_users`) and/or upload the ZIP to the private `slack-exports` bucket. Keep private data out of git.
