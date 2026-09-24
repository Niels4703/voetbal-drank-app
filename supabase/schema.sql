-- Run this once in Supabase SQL Editor.
create table public.players (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  name text not null,
  matches integer not null default 0,
  drinks integer not null default 0,
  last_drink timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table public.attendance (
  group_id text not null,
  round_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  assigned_player_id uuid references public.players(id),
  primary key (group_id, round_date, player_id)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  played_at timestamptz not null default now(),
  player_id uuid not null references public.players(id),
  player_name text not null,
  attendee_count integer not null
);

alter table public.players enable row level security;
alter table public.attendance enable row level security;
alter table public.rounds enable row level security;

create policy "public group players" on public.players for all using (true) with check (true);
create policy "public group attendance" on public.attendance for all using (true) with check (true);
create policy "public group rounds" on public.rounds for select using (true);

create or replace function public.complete_round(p_group_id text, p_round_date date, p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare total_attendees integer;
declare selected_name text;
begin
  select count(*) into total_attendees from attendance where group_id = p_group_id and round_date = p_round_date;
  select name into selected_name from players where id = p_player_id and group_id = p_group_id;
  if selected_name is null then raise exception 'Speler bestaat niet in deze groep'; end if;
  insert into rounds(group_id, player_id, player_name, attendee_count) values (p_group_id, p_player_id, selected_name, total_attendees);
  update players set drinks = drinks + 1, last_drink = now(), matches = matches + 1 where id = p_player_id and group_id = p_group_id;
  delete from attendance where group_id = p_group_id and round_date = p_round_date;
end;
$$;

grant execute on function public.complete_round(text, date, uuid) to anon, authenticated;
