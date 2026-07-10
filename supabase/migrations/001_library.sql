create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_recordings (
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_slug text not null,
  title text not null,
  artist text not null,
  artwork_url text,
  saved_at timestamptz not null default now(),
  primary key (user_id, recording_slug)
);

create table if not exists public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  searched_at timestamptz not null default now()
);

create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Music discovery',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.saved_recordings enable row level security;
alter table public.search_history enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;

create policy "profiles are private" on public.profiles using (auth.uid() = id);
create policy "saved recordings are private" on public.saved_recordings using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "search history is private" on public.search_history using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversations are private" on public.agent_conversations using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation messages are private" on public.agent_messages using (
  exists (select 1 from public.agent_conversations where id = conversation_id and user_id = auth.uid())
);

create index if not exists search_history_user_time on public.search_history(user_id, searched_at desc);
create index if not exists agent_messages_conversation_time on public.agent_messages(conversation_id, created_at);
