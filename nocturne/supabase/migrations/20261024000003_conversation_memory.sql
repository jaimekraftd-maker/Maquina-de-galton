-- Rolling memory for long conversations: a summary of the messages that no
-- longer fit in the model's context window, and the last message it covers.
alter table public.conversations
  add column memory_summary text check (memory_summary is null or char_length(memory_summary) <= 8000),
  add column memory_through_seq bigint;

grant update (memory_summary, memory_through_seq) on public.conversations to authenticated;
