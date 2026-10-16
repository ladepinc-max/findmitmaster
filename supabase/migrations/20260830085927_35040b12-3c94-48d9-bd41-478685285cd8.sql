create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_status_created_at_idx on public.posts (status, created_at desc);
create index if not exists posts_user_created_at_idx on public.posts (user_id, created_at desc);
create index if not exists messages_conversation_created_at_idx on public.messages (conversation_id, created_at);
create index if not exists conversations_last_message_at_idx on public.conversations (last_message_at desc);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);