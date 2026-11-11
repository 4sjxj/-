-- Between MVP database schema for Supabase.
-- Run this in Supabase SQL Editor. Never put the service_role key in the browser.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '新朋友',
  created_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  anniversary_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mood text not null default '😊',
  note text not null default '',
  checkin_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (couple_id, user_id, checkin_date)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 5000),
  created_at timestamptz not null default now()
);

create or replace function public.is_couple_member(target_couple uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.couple_members m where m.couple_id = target_couple and m.user_id = auth.uid()); $$;

create or replace function public.create_couple_invite()
returns text language plpgsql security definer set search_path = public
as $$
declare new_code text;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then raise exception '你已经加入一个双人空间'; end if;
  loop
    new_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from public.couples where invite_code = new_code);
  end loop;
  insert into public.couples(invite_code, created_by) values (new_code, auth.uid());
  insert into public.couple_members(couple_id, user_id) select id, auth.uid() from public.couples where invite_code = new_code;
  return new_code;
end; $$;

create or replace function public.join_couple_with_invite(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare target_id uuid; member_count integer;
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then raise exception '你已经加入一个双人空间'; end if;
  select id into target_id from public.couples where couples.invite_code = upper(trim(p_invite_code)) for update;
  if target_id is null then raise exception '邀请码无效'; end if;
  select count(*) into member_count from public.couple_members where couple_id = target_id;
  if member_count >= 2 then raise exception '这个空间已经满员'; end if;
  insert into public.couple_members(couple_id, user_id) values (target_id, auth.uid());
  return target_id;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', '新朋友')) on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.journal_entries enable row level security;

create policy "profile self and partner read" on public.profiles for select to authenticated
using (id = auth.uid() or exists (select 1 from public.couple_members mine join public.couple_members theirs on mine.couple_id = theirs.couple_id where mine.user_id = auth.uid() and theirs.user_id = profiles.id));
create policy "profile self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "couple members read" on public.couples for select to authenticated using (public.is_couple_member(id));
create policy "couple members update" on public.couples for update to authenticated using (public.is_couple_member(id)) with check (public.is_couple_member(id));
create policy "members read own couple" on public.couple_members for select to authenticated using (public.is_couple_member(couple_id));
create policy "members read own checkins" on public.daily_checkins for select to authenticated using (public.is_couple_member(couple_id));
create policy "members insert own checkin" on public.daily_checkins for insert to authenticated with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "members update own checkin" on public.daily_checkins for update to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id)) with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "members read journal" on public.journal_entries for select to authenticated using (public.is_couple_member(couple_id));
create policy "members add own journal" on public.journal_entries for insert to authenticated with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "authors edit own journal" on public.journal_entries for update to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id)) with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "authors delete own journal" on public.journal_entries for delete to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id));

grant execute on function public.create_couple_invite() to authenticated;
grant execute on function public.join_couple_with_invite(text) to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.couples to authenticated;
grant select on public.couple_members to authenticated;
grant select, insert, update on public.daily_checkins to authenticated;
grant select, insert, update, delete on public.journal_entries to authenticated;

-- Enable Realtime for shared content.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_checkins') then
    alter publication supabase_realtime add table public.daily_checkins;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'journal_entries') then
    alter publication supabase_realtime add table public.journal_entries;
  end if;
end $$;
