-- Shared community passcode (service role only; seed/change via SQL, do not commit real values)
create table if not exists public.community_passcode (
  id int primary key default 1 check (id = 1),
  passcode text not null,
  updated_at timestamptz not null default now()
);

alter table public.community_passcode enable row level security;
