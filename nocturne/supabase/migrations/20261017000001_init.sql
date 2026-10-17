-- Nocturne schema: profiles, characters, conversations, messages, favorites.
-- Every table has Row Level Security enabled; privileges are granted per column
-- so that server-managed columns (featured, chat_count, ids) cannot be forged.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Traveler'), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Characters
-- ---------------------------------------------------------------------------
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles (id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 60),
  tagline text not null check (char_length(tagline) between 1 and 140),
  description text not null check (char_length(description) between 1 and 4000),
  personality text not null check (char_length(personality) between 1 and 4000),
  traits text[] not null default '{}' check (cardinality(traits) <= 10),
  background text not null default '' check (char_length(background) <= 6000),
  greeting text not null check (char_length(greeting) between 1 and 2000),
  scenario text not null default '' check (char_length(scenario) <= 2000),
  example_dialogue text not null default '' check (char_length(example_dialogue) <= 4000),
  speaking_style text not null default '' check (char_length(speaking_style) <= 1000),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  categories text[] not null check (
    cardinality(categories) between 1 and 3
    and categories <@ array['anime','fantasy','adventure','romance','mystery','sci-fi','original','roleplay','friendly']
  ),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  featured boolean not null default false,
  chat_count integer not null default 0 check (chat_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index characters_creator_idx on public.characters (creator_id);
create index characters_public_popular_idx on public.characters (chat_count desc, created_at desc) where visibility = 'public';
create index characters_created_idx on public.characters (created_at desc);
create index characters_tags_idx on public.characters using gin (tags);
create index characters_categories_idx on public.characters using gin (categories);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated_at();

-- Characters joined with their creator's public display name. security_invoker
-- makes the view respect the RLS policies of the querying user.
create view public.characters_with_creator
with (security_invoker = true) as
  select c.*, p.display_name as creator_name
  from public.characters c
  left join public.profiles p on p.id = c.creator_id;

-- ---------------------------------------------------------------------------
-- Conversations & messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index conversations_user_activity_idx on public.conversations (user_id, pinned desc, last_activity_at desc);
create index conversations_user_character_idx on public.conversations (user_id, character_id);
create index conversations_character_idx on public.conversations (character_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  seq bigint generated always as identity,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 32000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index messages_conversation_seq_idx on public.messages (conversation_id, seq);

-- Keep conversations.last_activity_at in sync with new messages.
-- Definer: users may only update (title, pinned) on conversations directly.
create or replace function public.bump_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_activity_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump_activity after insert on public.messages
  for each row execute function public.bump_conversation_activity();

-- Real interaction counts. Runs as definer because users cannot update other
-- people's characters (and chat_count is not user-writable at all).
create or replace function public.track_chat_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.characters set chat_count = chat_count + 1 where id = new.character_id;
  elsif tg_op = 'DELETE' then
    update public.characters set chat_count = greatest(chat_count - 1, 0) where id = old.character_id;
  end if;
  return null;
end;
$$;

create trigger conversations_chat_count after insert or delete on public.conversations
  for each row execute function public.track_chat_count();

-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);

create index favorites_character_idx on public.favorites (character_id);

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
create or replace function public.search_characters(
  q text default null,
  cat text default null,
  sort text default null,
  lim integer default 60
)
returns setof public.characters_with_creator
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select coalesce(array_remove(regexp_split_to_array(lower(trim(coalesce(q, ''))), '\s+'), ''), '{}') as t
  )
  select c.*
  from public.characters_with_creator c, terms
  where (cat is null or cat = any (c.categories))
    and not exists (
      select 1 from unnest(terms.t) as term
      where position(
        ltrim(term, '#') in lower(
          c.name || ' ' || c.tagline || ' ' || c.description || ' ' ||
          array_to_string(c.tags, ' ') || ' ' || array_to_string(c.categories, ' ')
        )
      ) = 0
    )
  order by
    case when sort is null and cardinality(terms.t) > 0
      then (position(terms.t[1] in lower(c.name)) = 0)::int end asc,
    case when sort = 'name' then lower(c.name) end asc,
    case when sort = 'new' then c.created_at end desc,
    c.chat_count desc,
    c.featured desc,
    c.created_at desc
  limit least(greatest(coalesce(lim, 60), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.characters, public.conversations, public.messages, public.favorites
  from anon, authenticated;
revoke all on public.characters_with_creator from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select on public.characters, public.characters_with_creator to anon, authenticated;
grant insert (name, tagline, description, personality, traits, background, greeting, scenario,
              example_dialogue, speaking_style, tags, categories, avatar_url, visibility)
  on public.characters to authenticated;
grant update (name, tagline, description, personality, traits, background, greeting, scenario,
              example_dialogue, speaking_style, tags, categories, avatar_url, visibility)
  on public.characters to authenticated;
grant delete on public.characters to authenticated;

grant select, delete on public.conversations to authenticated;
grant insert (character_id, title) on public.conversations to authenticated;
grant update (title, pinned) on public.conversations to authenticated;

grant select, delete on public.messages to authenticated;
grant insert (conversation_id, role, content, metadata) on public.messages to authenticated;
grant update (content, metadata) on public.messages to authenticated;

grant select, insert (character_id), delete on public.favorites to authenticated;

revoke all on function public.search_characters(text, text, text, integer) from public;
grant execute on function public.search_characters(text, text, text, integer) to anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.track_chat_count() from public, anon, authenticated;
revoke all on function public.bump_conversation_activity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.favorites enable row level security;

-- Display names are public (shown as "created by"); emails live in auth.users only.
create policy "profiles are readable" on public.profiles
  for select using (true);
create policy "users update own profile" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "public or own characters are readable" on public.characters
  for select using (visibility = 'public' or creator_id = (select auth.uid()));
create policy "users create own characters" on public.characters
  for insert to authenticated with check (creator_id = (select auth.uid()));
create policy "users update own characters" on public.characters
  for update to authenticated
  using (creator_id = (select auth.uid()))
  with check (creator_id = (select auth.uid()));
create policy "users delete own characters" on public.characters
  for delete to authenticated using (creator_id = (select auth.uid()));

create policy "users read own conversations" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users start conversations with visible characters" on public.conversations
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.characters c
      where c.id = character_id and (c.visibility = 'public' or c.creator_id = (select auth.uid()))
    )
  );
create policy "users update own conversations" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "users delete own conversations" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "users read messages in own conversations" on public.messages
  for select to authenticated using (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "users add messages to own conversations" on public.messages
  for insert to authenticated with check (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "users edit messages in own conversations" on public.messages
  for update to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy "users delete messages in own conversations" on public.messages
  for delete to authenticated using (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

create policy "users read own favorites" on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users favorite visible characters" on public.favorites
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.characters c
      where c.id = character_id and (c.visibility = 'public' or c.creator_id = (select auth.uid()))
    )
  );
create policy "users remove own favorites" on public.favorites
  for delete to authenticated using (user_id = (select auth.uid()));
