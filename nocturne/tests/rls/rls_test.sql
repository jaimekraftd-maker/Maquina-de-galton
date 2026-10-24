\set ON_ERROR_STOP 1
\o /dev/null
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:A, 'alice@example.com', '{"display_name":"Alice"}'),
  (:B, 'bob@example.com', '{}');

do $$ begin
  assert (select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'Alice', 'profile trigger uses display_name';
  assert (select display_name from public.profiles where id = 'bbbbbbbb-0000-4000-8000-000000000002') = 'bob', 'profile trigger falls back to email prefix';
end $$;

create temp table ctx (k text primary key, v uuid);
grant all on ctx to anon, authenticated;

-- ---------------------------------------------------------------- Alice
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A)::text, false);

insert into public.characters (name, tagline, description, personality, greeting, categories, visibility)
values ('Secret', 'private one', 'desc', 'pers', 'hi', array['original'], 'private');
insert into ctx select 'private_char', id from public.characters where name = 'Secret';

do $$ begin
  assert (select creator_id from public.characters where name = 'Secret') = auth.uid(), 'creator_id defaults to auth.uid()';
  begin
    insert into public.characters (name, tagline, description, personality, greeting, categories, featured)
    values ('Forged', 't', 'd', 'p', 'g', array['anime'], true);
    raise exception 'FAIL: featured should not be insertable';
  exception when insufficient_privilege then null; end;
  begin
    update public.characters set chat_count = 9999 where name = 'Secret';
    raise exception 'FAIL: chat_count should not be updatable';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.characters (creator_id, name, tagline, description, personality, greeting, categories)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'Impostor', 't', 'd', 'p', 'g', array['anime']);
    raise exception 'FAIL: creator_id should not be writable';
  exception when insufficient_privilege then null; end;
  begin
    update public.characters set name = 'Hacked' where id = '00000000-0000-4000-8000-000000000001';
    if found then raise exception 'FAIL: seed character must not be editable'; end if;
  end;
end $$;

insert into public.conversations (character_id, title) values ('00000000-0000-4000-8000-000000000001', 'Alice and Seraphine');
insert into ctx select 'alice_conv', id from public.conversations;
insert into public.messages (conversation_id, role, content)
  select v, 'user', 'secret dream' from ctx where k = 'alice_conv';
insert into public.favorites (character_id) values ('00000000-0000-4000-8000-000000000001');
update public.conversations set memory_summary = 'Alice likes cats', memory_through_seq = 1;
do $$ begin
  assert (select memory_summary from public.conversations limit 1) = 'Alice likes cats', 'owner can save conversation memory';
end $$;

do $$ begin
  assert (select count(*) from public.messages) = 1, 'alice sees her message';
  assert (select count(*) from public.search_characters('secret')) = 1, 'creator finds own private character';
end $$;

-- ---------------------------------------------------------------- Bob
select set_config('request.jwt.claims', json_build_object('sub', :B)::text, false);

do $$
declare
  private_char uuid := (select v from ctx where k = 'private_char');
  alice_conv uuid := (select v from ctx where k = 'alice_conv');
begin
  assert (select count(*) from public.characters where id = private_char) = 0, 'private character hidden from others';
  assert (select count(*) from public.characters_with_creator where id = private_char) = 0, 'view respects RLS';
  assert (select count(*) from public.characters) = 10, 'bob sees the 10 public seeds';
  assert (select count(*) from public.search_characters('secret')) = 0, 'search hides private characters';
  assert (select count(*) from public.conversations) = 0, 'conversations are private';
  assert (select count(*) from public.messages) = 0, 'messages are private';
  assert (select count(*) from public.favorites) = 0, 'favorites are private';

  update public.characters set name = 'Hacked' where id = private_char;
  assert not found, 'cannot update another user''s character';
  delete from public.characters where id = private_char;
  assert not found, 'cannot delete another user''s character';
  update public.conversations set title = 'Hacked' where id = alice_conv;
  assert not found, 'cannot update another user''s conversation';
  update public.conversations set memory_summary = 'Hacked' where id = alice_conv;
  assert not found, 'cannot overwrite another user''s conversation memory';
  delete from public.messages where conversation_id = alice_conv;
  assert not found, 'cannot delete another user''s messages';

  begin
    insert into public.messages (conversation_id, role, content) values (alice_conv, 'user', 'injected');
    raise exception 'FAIL: inserted into another user''s conversation';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.conversations (character_id, title) values (private_char, 'peek');
    raise exception 'FAIL: started chat with a private character';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.conversations (user_id, character_id, title)
    values ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'spoof');
    raise exception 'FAIL: user_id should not be writable';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.favorites (character_id) values (private_char);
    raise exception 'FAIL: favorited a private character';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- anon
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);
do $$ begin
  assert (select count(*) from public.characters) = 10, 'anon sees public characters only';
  assert (select count(*) from public.search_characters('dream')) >= 1, 'anon can search';
  assert (select name from public.search_characters('dreams library') limit 1) = 'Seraphine Vale', 'multi-term search';
  assert (select count(*) from public.search_characters(null, 'mystery')) = 2, 'category filter';
  begin
    perform 1 from public.conversations;
    raise exception 'FAIL: anon read conversations';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.characters (name, tagline, description, personality, greeting, categories)
    values ('x', 't', 'd', 'p', 'g', array['anime']);
    raise exception 'FAIL: anon created a character';
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------- triggers
reset role;
do $$ begin
  assert (select chat_count from public.characters where id = '00000000-0000-4000-8000-000000000001') = 1, 'chat_count incremented';
  assert (select last_activity_at > created_at or last_activity_at = created_at from public.conversations limit 1), 'activity tracked';
end $$;

-- Alice deletes her conversation: messages cascade and chat_count decrements.
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :A)::text, false);
delete from public.conversations;
reset role;
do $$ begin
  assert (select count(*) from public.messages) = 0, 'messages cascade with conversation';
  assert (select chat_count from public.characters where id = '00000000-0000-4000-8000-000000000001') = 0, 'chat_count decremented';
end $$;

-- Deleting the auth user removes all of their data.
delete from auth.users where id = :A;
do $$ begin
  assert (select count(*) from public.characters where name = 'Secret') = 0, 'user deletion cascades to characters';
  assert (select count(*) from public.favorites) = 0, 'user deletion cascades to favorites';
end $$;

\o
\echo 'RLS tests passed'
