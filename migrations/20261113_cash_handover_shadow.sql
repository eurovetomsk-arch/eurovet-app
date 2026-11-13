-- Cash handover shadow ledger for app v1.82.
-- Additive only: existing reports, payroll, MR collections, safe ledger and Telegram stay unchanged.

begin;
set local ev.allow_ddl = 'on';

create table if not exists public.ev_cash_handover_config (
  id smallint primary key default 1 check (id = 1),
  mode text not null check (mode in ('off', 'shadow', 'required')),
  updated_at timestamptz not null default now()
);

insert into public.ev_cash_handover_config (id, mode)
values (1, 'off')
on conflict (id) do nothing;

alter table public.ev_cash_handover_config enable row level security;
revoke all on table public.ev_cash_handover_config from public, anon, authenticated;

create table if not exists public.ev_cash_handover_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  branch_id text not null references public.ev_branches(id),
  handover_date date not null,
  accepted_by bigint not null references public.ev_people(id),
  session_id bigint not null references public.ev_sessions(id),
  accepted_at timestamptz not null default now(),
  client_time timestamptz,
  device_id text,
  client_uid text not null unique,
  kind text not null default 'accept' check (kind in ('accept', 'correction')),
  mode text not null default 'shadow' check (mode in ('shadow', 'required')),
  expected numeric(14,2),
  actual numeric(14,2) not null check (actual >= 0 and actual <= 10000000),
  diff numeric(14,2),
  status text not null check (status in ('matched', 'discrepancy', 'no_baseline')),
  source_report_id bigint references public.ev_reports(id),
  source_report_date date,
  source_report_version integer,
  source_report_closing numeric(14,2),
  source_fingerprint text,
  supersedes_id bigint references public.ev_cash_handover_events(id),
  reason text,
  constraint ev_cash_handover_source_complete check (
    (source_report_id is null and source_report_date is null and source_report_version is null and source_report_closing is null and source_fingerprint is null)
    or
    (source_report_id is not null and source_report_date is not null and source_report_version is not null and source_report_closing is not null and source_fingerprint is not null)
  ),
  constraint ev_cash_handover_kind_shape check (
    (kind = 'accept' and supersedes_id is null and reason is null)
    or
    (kind = 'correction' and supersedes_id is not null and length(btrim(reason)) >= 3)
  )
);

create unique index if not exists ev_cash_handover_one_root
  on public.ev_cash_handover_events(branch_id, handover_date)
  where supersedes_id is null;

create unique index if not exists ev_cash_handover_one_correction_per_parent
  on public.ev_cash_handover_events(supersedes_id)
  where supersedes_id is not null;

create index if not exists ev_cash_handover_lookup
  on public.ev_cash_handover_events(branch_id, handover_date, created_at desc, id desc);

alter table public.ev_cash_handover_events enable row level security;
revoke all on table public.ev_cash_handover_events from public, anon, authenticated;
revoke all on sequence public.ev_cash_handover_events_id_seq from public, anon, authenticated;

create or replace function public.ev_cash_handover_block_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'cash handover events are append-only';
end
$function$;

revoke execute on function public.ev_cash_handover_block_mutation() from public, anon, authenticated;

drop trigger if exists ev_cash_handover_immutable on public.ev_cash_handover_events;
create trigger ev_cash_handover_immutable
before update or delete on public.ev_cash_handover_events
for each row execute function public.ev_cash_handover_block_mutation();

drop trigger if exists ev_cash_handover_no_truncate on public.ev_cash_handover_events;
create trigger ev_cash_handover_no_truncate
before truncate on public.ev_cash_handover_events
for each statement execute function public.ev_cash_handover_block_mutation();

create or replace function public.ev_cash_handover_context(
  p_token text,
  p_branch text,
  p_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_person bigint;
  v_mode text;
  v_prev record;
  v_current record;
  v_source_fingerprint text;
  v_admin boolean;
  v_head boolean;
begin
  v_person := public.ev_session_person(p_token);
  if v_person is null then
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;

  v_admin := exists (
    select 1 from public.ev_person_roles r
    where r.person_id = v_person
      and r.role = 'admin'
      and public.ev_active_on(r.valid_from, r.valid_to, p_date)
  );
  v_head := public.ev__is_head(v_person);
  if not v_admin and not v_head then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not exists (select 1 from public.ev_branches b where b.id = p_branch and b.active) then
    return jsonb_build_object('ok', false, 'error', 'branch');
  end if;

  select c.mode into v_mode
  from public.ev_cash_handover_config c
  where c.id = 1;
  v_mode := coalesce(v_mode, 'off');

  select r.id, r.report_date, r.version,
         public.ev__num(r.data #> '{cashbox,closing}') as closing
    into v_prev
  from public.ev_reports r
  where r.branch_id = p_branch and r.report_date < p_date
  order by r.report_date desc, r.version desc
  limit 1;

  if v_prev.id is not null then
    v_source_fingerprint := pg_catalog.encode(
      extensions.digest(
          concat_ws('|', p_branch, v_prev.id::text, v_prev.report_date::text, v_prev.version::text, to_char(v_prev.closing, 'FM999999999990.00')),
        'sha256'
      ),
      'hex'
    );
  end if;

  select e.*, p.short_name as accepted_name
    into v_current
  from public.ev_cash_handover_events e
  join public.ev_people p on p.id = e.accepted_by
  where e.branch_id = p_branch and e.handover_date = p_date
  order by e.created_at desc, e.id desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'mode', v_mode,
    'can_accept', v_admin or (v_head and p_branch = 'test'),
    'can_correct', case when v_current.id is null then false else (v_current.accepted_by = v_person or v_head) end,
    'expected', case when v_prev.id is null then null else v_prev.closing end,
    'source', case when v_prev.id is null then null else jsonb_build_object(
      'report_date', v_prev.report_date,
      'report_version', v_prev.version,
      'fingerprint', v_source_fingerprint
    ) end,
    'current', case when v_current.id is null then null else jsonb_build_object(
      'id', v_current.id,
      'actual', v_current.actual,
      'diff', v_current.diff,
      'status', v_current.status,
      'accepted_at', v_current.accepted_at,
      'accepted_by', v_current.accepted_name,
      'accepted_by_me', v_current.accepted_by = v_person,
      'kind', v_current.kind
    ) end
  );
end
$function$;

create or replace function public.ev_cash_handover_accept(
  p_token text,
  p_branch text,
  p_date date,
  p_actual numeric,
  p_source_fingerprint text,
  p_client_uid text,
  p_client_time timestamptz,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_person bigint;
  v_session bigint;
  v_mode text;
  v_prev record;
  v_row public.ev_cash_handover_events%rowtype;
  v_source_fingerprint text;
  v_status text;
  v_diff numeric(14,2);
  v_admin boolean;
begin
  v_person := public.ev_session_person(p_token);
  if v_person is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select s.id into v_session
  from public.ev_sessions s
  where s.person_id = v_person
    and s.token_hash = pg_catalog.encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
  limit 1;
  if v_session is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;

  v_admin := exists (
    select 1 from public.ev_person_roles r
    where r.person_id = v_person
      and r.role = 'admin'
      and public.ev_active_on(r.valid_from, r.valid_to, p_date)
  );
  if not v_admin and not (p_branch = 'test' and public.ev__is_head(v_person)) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not exists (select 1 from public.ev_branches b where b.id = p_branch and b.active) then
    return jsonb_build_object('ok', false, 'error', 'branch');
  end if;
  if p_date < public.ev_today() - 7 or p_date > public.ev_today() then
    return jsonb_build_object('ok', false, 'error', 'date_range');
  end if;
  if p_actual is null or p_actual < 0 or p_actual > 10000000 or round(p_actual, 2) <> p_actual then
    return jsonb_build_object('ok', false, 'error', 'actual');
  end if;
  if p_client_uid is null or length(p_client_uid) < 8 or length(p_client_uid) > 100 then
    return jsonb_build_object('ok', false, 'error', 'client_uid');
  end if;

  select * into v_row from public.ev_cash_handover_events e where e.client_uid = p_client_uid;
  if found then
    if v_row.accepted_by = v_person and v_row.branch_id = p_branch and v_row.handover_date = p_date then
      return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'actual', v_row.actual, 'diff', v_row.diff, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'client_uid_conflict');
  end if;

  select c.mode into v_mode from public.ev_cash_handover_config c where c.id = 1;
  if coalesce(v_mode, 'off') = 'off' then return jsonb_build_object('ok', false, 'error', 'feature_off'); end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_branch || '|' || p_date::text, 0));

  if exists (select 1 from public.ev_cash_handover_events e where e.branch_id = p_branch and e.handover_date = p_date) then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  select r.id, r.report_date, r.version,
         public.ev__num(r.data #> '{cashbox,closing}')::numeric(14,2) as closing
    into v_prev
  from public.ev_reports r
  where r.branch_id = p_branch and r.report_date < p_date
  order by r.report_date desc, r.version desc
  limit 1;

  if v_prev.id is not null then
    v_source_fingerprint := pg_catalog.encode(
      extensions.digest(
        concat_ws('|', p_branch, v_prev.id::text, v_prev.report_date::text, v_prev.version::text, to_char(v_prev.closing, 'FM999999999990.00')),
        'sha256'
      ),
      'hex'
    );
  end if;
  if p_source_fingerprint is distinct from v_source_fingerprint then
    return jsonb_build_object('ok', false, 'error', 'source_changed');
  end if;

  if v_prev.id is null then
    v_diff := null;
    v_status := 'no_baseline';
  else
    v_diff := round(p_actual - v_prev.closing, 2);
    v_status := case when abs(v_diff) <= 0.01 then 'matched' else 'discrepancy' end;
  end if;

  begin
    insert into public.ev_cash_handover_events (
      branch_id, handover_date, accepted_by, session_id, client_time, device_id, client_uid,
      kind, mode, expected, actual, diff, status,
      source_report_id, source_report_date, source_report_version, source_report_closing, source_fingerprint
    ) values (
      p_branch, p_date, v_person, v_session, p_client_time, left(p_device, 120), p_client_uid,
      'accept', v_mode, v_prev.closing, p_actual, v_diff, v_status,
      v_prev.id, v_prev.report_date, v_prev.version, v_prev.closing,
      v_source_fingerprint
    ) returning * into v_row;
  exception when unique_violation then
    select * into v_row
    from public.ev_cash_handover_events e
    where e.branch_id = p_branch and e.handover_date = p_date
    order by e.created_at desc, e.id desc limit 1;
    return jsonb_build_object('ok', false, 'error', 'already_accepted', 'id', v_row.id, 'status', v_row.status);
  end;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'actual', v_row.actual, 'diff', v_row.diff, 'idempotent', false);
end
$function$;

create or replace function public.ev_cash_handover_correct(
  p_token text,
  p_event_id bigint,
  p_actual numeric,
  p_reason text,
  p_client_uid text,
  p_client_time timestamptz,
  p_device text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_person bigint;
  v_session bigint;
  v_mode text;
  v_base public.ev_cash_handover_events%rowtype;
  v_row public.ev_cash_handover_events%rowtype;
  v_status text;
  v_diff numeric(14,2);
begin
  v_person := public.ev_session_person(p_token);
  if v_person is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select s.id into v_session
  from public.ev_sessions s
  where s.person_id = v_person
    and s.token_hash = pg_catalog.encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
  limit 1;
  if v_session is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_actual is null or p_actual < 0 or p_actual > 10000000 or round(p_actual, 2) <> p_actual then
    return jsonb_build_object('ok', false, 'error', 'actual');
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then return jsonb_build_object('ok', false, 'error', 'reason'); end if;
  if p_client_uid is null or length(p_client_uid) < 8 or length(p_client_uid) > 100 then
    return jsonb_build_object('ok', false, 'error', 'client_uid');
  end if;

  select * into v_row from public.ev_cash_handover_events e where e.client_uid = p_client_uid;
  if found then
    if v_row.accepted_by = v_person then
      return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'actual', v_row.actual, 'diff', v_row.diff, 'idempotent', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'client_uid_conflict');
  end if;

  select * into v_base from public.ev_cash_handover_events e where e.id = p_event_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_base.accepted_by <> v_person and not public.ev__is_head(v_person) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not public.ev__is_head(v_person)
     and (now() at time zone 'Asia/Omsk') > (v_base.handover_date + 1)::timestamp + interval '12 hours' then
    return jsonb_build_object('ok', false, 'error', 'window_closed');
  end if;
  if exists (select 1 from public.ev_cash_handover_events e where e.supersedes_id = v_base.id) then
    return jsonb_build_object('ok', false, 'error', 'stale_event');
  end if;

  select c.mode into v_mode from public.ev_cash_handover_config c where c.id = 1;
  if coalesce(v_mode, 'off') = 'off' then return jsonb_build_object('ok', false, 'error', 'feature_off'); end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_base.branch_id || '|' || v_base.handover_date::text, 0));

  if v_base.expected is null then
    v_diff := null;
    v_status := 'no_baseline';
  else
    v_diff := round(p_actual - v_base.expected, 2);
    v_status := case when abs(v_diff) <= 0.01 then 'matched' else 'discrepancy' end;
  end if;

  begin
    insert into public.ev_cash_handover_events (
      branch_id, handover_date, accepted_by, session_id, client_time, device_id, client_uid,
      kind, mode, expected, actual, diff, status,
      source_report_id, source_report_date, source_report_version, source_report_closing, source_fingerprint,
      supersedes_id, reason
    ) values (
      v_base.branch_id, v_base.handover_date, v_person, v_session, p_client_time, left(p_device, 120), p_client_uid,
      'correction', v_mode, v_base.expected, p_actual, v_diff, v_status,
      v_base.source_report_id, v_base.source_report_date, v_base.source_report_version, v_base.source_report_closing, v_base.source_fingerprint,
      v_base.id, btrim(p_reason)
    ) returning * into v_row;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'stale_event');
  end;

  return jsonb_build_object('ok', true, 'id', v_row.id, 'status', v_row.status, 'actual', v_row.actual, 'diff', v_row.diff, 'idempotent', false);
end
$function$;

revoke execute on function public.ev_cash_handover_context(text, text, date) from public, authenticated;
revoke execute on function public.ev_cash_handover_accept(text, text, date, numeric, text, text, timestamptz, text) from public, authenticated;
revoke execute on function public.ev_cash_handover_correct(text, bigint, numeric, text, text, timestamptz, text) from public, authenticated;
grant execute on function public.ev_cash_handover_context(text, text, date) to anon;
grant execute on function public.ev_cash_handover_accept(text, text, date, numeric, text, text, timestamptz, text) to anon;
grant execute on function public.ev_cash_handover_correct(text, bigint, numeric, text, text, timestamptz, text) to anon;

commit;
