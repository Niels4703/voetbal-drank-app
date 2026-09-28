-- Run this once in the Supabase SQL editor.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  name text not null,
  matches integer not null default 0,
  drinks integer not null default 0,
  last_drink timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table if not exists public.attendance (
  group_id text not null,
  round_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  assigned_player_id uuid references public.players(id),
  created_at timestamptz not null default now(),
  primary key (group_id, round_date, player_id)
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  round_date date not null,
  played_at timestamptz not null default now(),
  player_id uuid not null references public.players(id),
  player_name text not null,
  attendee_count integer not null,
  attendee_ids uuid[] not null,
  unique (group_id, round_date)
);

create table if not exists public.match_settings (
  group_id text primary key,
  next_match_date date not null default current_date,
  current_drink_person_id uuid references public.players(id),
  current_status text not null default 'open' check (current_status in ('open','selected','closed')),
  updated_at timestamptz not null default now(),
  last_schedule_run_at timestamptz
);

alter table public.players enable row level security;
alter table public.attendance enable row level security;
alter table public.rounds enable row level security;
alter table public.match_settings enable row level security;

create policy "players readable and writable for friend group" on public.players
for all using (true) with check (true);

create policy "attendance readable and writable for friend group" on public.attendance
for all using (true) with check (true);

create policy "rounds readable for friend group" on public.rounds
for select using (true);

create policy "match settings readable and writable for friend group" on public.match_settings
for all using (true) with check (true);

create or replace function public.pick_drink_person(p_group_id text, p_round_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_player_id uuid;
begin
  select a.player_id into v_player_id
  from public.attendance a
  join public.players p on p.id = a.player_id and p.group_id = p_group_id
  where a.group_id = p_group_id
    and a.round_date = p_round_date
  order by
    case when p.matches > 0 then (p.drinks::numeric / p.matches) else 0 end asc,
    p.drinks asc,
    coalesce(p.last_drink, '1970-01-01'::timestamptz) asc,
    p.name asc
  limit 1;

  return v_player_id;
end;
$$;

create or replace function public.close_match_round(p_group_id text, p_round_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_selected_id uuid;
declare v_attendee_ids uuid[];
declare v_count integer;
begin
  select array_agg(player_id order by player_id) into v_attendee_ids
  from public.attendance
  where group_id = p_group_id and round_date = p_round_date;

  if v_attendee_ids is null or array_length(v_attendee_ids, 1) is null then
    raise exception 'Geen deelnemers gevonden voor deze datum';
  end if;

  v_count := array_length(v_attendee_ids, 1);

  v_selected_id := (
    select a.assigned_player_id
    from public.attendance a
    where a.group_id = p_group_id
      and a.round_date = p_round_date
      and a.assigned_player_id is not null
    order by a.created_at asc
    limit 1
  );

  if v_selected_id is null then
    v_selected_id := public.pick_drink_person(p_group_id, p_round_date);
  end if;

  if v_selected_id is null then
    raise exception 'Er kon geen drankverantwoordelijke worden gekozen';
  end if;

  update public.players
  set matches = matches + 1
  where id = any(v_attendee_ids);

  update public.players
  set drinks = drinks + 1,
      last_drink = now()
  where id = v_selected_id and group_id = p_group_id;

  insert into public.rounds(group_id, round_date, player_id, player_name, attendee_count, attendee_ids)
  values (
    p_group_id,
    p_round_date,
    v_selected_id,
    (select name from public.players where id = v_selected_id and group_id = p_group_id),
    v_count,
    v_attendee_ids
  )
  on conflict (group_id, round_date)
  do update set
    player_id = excluded.player_id,
    player_name = excluded.player_name,
    attendee_count = excluded.attendee_count,
    attendee_ids = excluded.attendee_ids,
    played_at = now();

  update public.match_settings
  set current_drink_person_id = v_selected_id,
      current_status = 'closed',
      updated_at = now()
  where group_id = p_group_id;

  delete from public.attendance
  where group_id = p_group_id and round_date = p_round_date;
end;
$$;

create or replace function public.assign_drink_person(p_group_id text, p_round_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_selected_id uuid;
begin
  v_selected_id := public.pick_drink_person(p_group_id, p_round_date);

  if v_selected_id is null then
    return null;
  end if;

  update public.attendance
  set assigned_player_id = v_selected_id
  where group_id = p_group_id
    and round_date = p_round_date
    and player_id = v_selected_id;

  update public.match_settings
  set current_drink_person_id = v_selected_id,
      current_status = 'selected',
      updated_at = now()
  where group_id = p_group_id;

  return v_selected_id;
end;
$$;

grant execute on function public.pick_drink_person(text, date) to anon, authenticated;
grant execute on function public.close_match_round(text, date) to anon, authenticated;
grant execute on function public.assign_drink_person(text, date) to anon, authenticated;

create index if not exists idx_players_group on public.players(group_id);
create index if not exists idx_attendance_group_date on public.attendance(group_id, round_date);
create index if not exists idx_rounds_group_date on public.rounds(group_id, round_date);
create index if not exists idx_match_settings_group on public.match_settings(group_id);

alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.match_settings;
