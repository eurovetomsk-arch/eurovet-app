-- Vetmanager reconciliation coverage ledger.
-- Additive only: the collector is external and may write only through
-- ev_record_vm_run. Existing reports and payroll remain unchanged.

begin;
set local ev.allow_ddl = 'on';

create table if not exists public.ev_vm_runs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  run_key text not null unique check (length(run_key) between 12 and 200),
  run_id uuid not null default gen_random_uuid(),
  branch_id text not null references public.ev_branches(id),
  report_date date not null,
  report_version integer not null check (report_version > 0),
  status text not null check (status in ('complete', 'partial', 'failed')),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  coverage jsonb not null check (jsonb_typeof(coverage) = 'object'),
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object')
);

create index if not exists ev_vm_runs_lookup_idx
  on public.ev_vm_runs (branch_id, report_date, report_version, created_at desc);

alter table public.ev_vm_runs enable row level security;
revoke all on table public.ev_vm_runs from public, anon, authenticated;
revoke all on sequence public.ev_vm_runs_id_seq from public, anon, authenticated;

create or replace function public.ev_vm_runs_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'ev_vm_runs is append-only';
end
$function$;

revoke execute on function public.ev_vm_runs_immutable() from public, anon, authenticated;

drop trigger if exists ev_vm_runs_immutable_trg on public.ev_vm_runs;
create trigger ev_vm_runs_immutable_trg
before update or delete or truncate on public.ev_vm_runs
for each statement execute function public.ev_vm_runs_immutable();

create or replace function public.ev_record_vm_run(
  p_run_key text,
  p_branch text,
  p_date date,
  p_status text,
  p_source_fingerprint text,
  p_coverage jsonb,
  p_metrics jsonb default '{}'::jsonb,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_version integer;
  v_existing public.ev_vm_runs%rowtype;
  v_complete boolean;
  v_id bigint;
  v_run_id uuid := gen_random_uuid();
begin
  if p_run_key is null or length(p_run_key) not between 12 and 200 then
    return jsonb_build_object('ok', false, 'error', 'run_key');
  end if;
  if p_branch is null or p_branch = 'test' or not exists (
    select 1 from public.ev_branches b where b.id = p_branch and b.active
  ) then
    return jsonb_build_object('ok', false, 'error', 'branch');
  end if;
  if p_date is null or p_date < public.ev_today() - 14 or p_date > public.ev_today() then
    return jsonb_build_object('ok', false, 'error', 'date');
  end if;
  if p_status not in ('complete', 'partial', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'status');
  end if;
  if p_source_fingerprint is null or p_source_fingerprint !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'fingerprint');
  end if;
  if jsonb_typeof(coalesce(p_coverage, 'null'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_metrics, 'null'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_evidence, 'null'::jsonb)) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'payload');
  end if;

  v_complete :=
    coalesce((p_coverage ->> 'invoices_complete')::boolean, false)
    and coalesce((p_coverage ->> 'revenue_summary_complete')::boolean, false)
    and coalesce((p_coverage ->> 'payments_complete')::boolean, false)
    and coalesce((p_coverage ->> 'cashbox_complete')::boolean, false)
    and coalesce((p_coverage ->> 'doctor_lines_complete')::boolean, false);
  if p_status = 'complete' and not v_complete then
    return jsonb_build_object('ok', false, 'error', 'coverage_incomplete');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ev_vm:' || p_branch || ':' || p_date::text, 0));

  select r.version into v_version
  from public.ev_reports r
  where r.branch_id = p_branch and r.report_date = p_date
  order by r.version desc
  limit 1;
  if v_version is null then
    return jsonb_build_object('ok', false, 'error', 'report_missing');
  end if;

  select * into v_existing
  from public.ev_vm_runs r
  where r.run_key = p_run_key;
  if found then
    if v_existing.branch_id = p_branch
       and v_existing.report_date = p_date
       and v_existing.report_version = v_version
       and v_existing.status = p_status
       and v_existing.source_fingerprint = p_source_fingerprint
       and v_existing.coverage = p_coverage
       and v_existing.metrics = p_metrics
       and v_existing.evidence = p_evidence then
      return jsonb_build_object('ok', true, 'idempotent', true, 'id', v_existing.id,
                                'run_id', v_existing.run_id, 'version', v_existing.report_version);
    end if;
    return jsonb_build_object('ok', false, 'error', 'run_key_conflict');
  end if;

  insert into public.ev_vm_runs (
    run_key, run_id, branch_id, report_date, report_version, status,
    source_fingerprint, coverage, metrics, evidence
  ) values (
    p_run_key, v_run_id, p_branch, p_date, v_version, p_status,
    p_source_fingerprint, p_coverage, p_metrics, p_evidence
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'idempotent', false, 'id', v_id,
                            'run_id', v_run_id, 'version', v_version,
                            'status', p_status);
end
$function$;

revoke execute on function public.ev_record_vm_run(
  text, text, date, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.ev_record_vm_run(
  text, text, date, text, text, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.ev_flags_overview(
  p_token text,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pid bigint;
  v_from date;
  v_res jsonb;
  v_cov jsonb;
begin
  v_pid := public.ev_session_person(p_token);
  if v_pid is null then
    return jsonb_build_object('ok', false, 'error', 'session');
  end if;
  if not exists (
    select 1 from public.ev_person_roles r
    where r.person_id = v_pid and r.role = 'head'
      and public.ev_active_on(r.valid_from, r.valid_to, public.ev_today())
  ) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_from := greatest(p_from, p_to - 13);

  with current_reports as (
    select distinct on (r.branch_id, r.report_date)
      r.branch_id, r.report_date, r.version
    from public.ev_reports r
    where r.report_date between v_from and p_to
      and r.branch_id <> 'test'
    order by r.branch_id, r.report_date, r.version desc
  ), coverage as (
    select c.branch_id, b.title as branch_title, c.report_date, c.version,
           x.id as vm_run_id, x.created_at as checked_at,
           coalesce(x.status, 'missing') as status,
           coalesce(x.coverage, '{}'::jsonb) as coverage
    from current_reports c
    join public.ev_branches b on b.id = c.branch_id
    left join lateral (
      select r.*
      from public.ev_vm_runs r
      where r.branch_id = c.branch_id
        and r.report_date = c.report_date
        and r.report_version = c.version
      order by r.created_at desc
      limit 1
    ) x on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branch', branch_id,
    'branch_title', branch_title,
    'date', report_date,
    'version', version,
    'status', status,
    'checked_at', checked_at,
    'coverage', coverage
  ) order by report_date desc, branch_id), '[]'::jsonb)
  into v_cov
  from coverage;

  with current_reports as (
    select distinct on (r.branch_id, r.report_date)
      r.branch_id, r.report_date, r.version
    from public.ev_reports r
    where r.report_date between v_from and p_to
      and r.branch_id <> 'test'
    order by r.branch_id, r.report_date, r.version desc
  ), coverage_missing as (
    select c.branch_id, c.report_date, c.version,
           coalesce(x.status, 'missing') as status
    from current_reports c
    left join lateral (
      select r.id, r.status
      from public.ev_vm_runs r
      where r.branch_id = c.branch_id
        and r.report_date = c.report_date
        and r.report_version = c.version
      order by r.created_at desc
      limit 1
    ) x on true
    where x.id is null or x.status <> 'complete'
  ), findings as (
    select 'db'::text as source, i.branch_id, i.report_date, i.report_version,
           i.code, i.level, i.title, i.expected, i.actual, i.diff, i.detail
    from public.ev_internal_findings(v_from, p_to, null) i
    union all
    select 'vetmanager'::text, c.branch_id, c.report_date, c.report_version,
           c.code, c.level, c.title, c.expected, c.actual, c.diff, c.detail
    from public.ev_checks_current c
    where c.report_date between v_from and p_to
      and c.source = 'vetmanager'
      and c.level in ('red', 'yellow')
    union all
    select 'vetmanager'::text, m.branch_id, m.report_date, m.version,
           case when m.status = 'missing' then 'vm_not_checked' else 'vm_partial' end,
           'red'::text,
           case when m.status = 'missing'
             then 'Нет свежей сверки с Vetmanager'
             else 'Сверка с Vetmanager неполная'
           end,
           null::numeric, null::numeric, null::numeric,
           case when m.status = 'missing'
             then 'Для текущей версии отчёта первичный источник не проверен'
             else 'Не подтверждены все обязательные блоки: счета, выручка, платежи, касса и ответственные строк'
           end
    from coverage_missing m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'branch', f.branch_id,
    'branch_title', b.title,
    'date', f.report_date,
    'version', f.report_version,
    'code', f.code,
    'level', f.level,
    'title', f.title,
    'expected', f.expected,
    'actual', f.actual,
    'diff', f.diff,
    'detail', f.detail,
    'source', f.source,
    'accepted', case
      when f.code in ('vm_not_checked', 'vm_partial') then false
      else public.ev_is_accepted(f.branch_id, f.report_date, f.code, coalesce(f.report_version, 0))
    end
  ) order by f.report_date desc, f.branch_id, f.code), '[]'::jsonb)
  into v_res
  from findings f
  join public.ev_branches b on b.id = f.branch_id
  where f.level in ('red', 'yellow')
    and f.branch_id <> 'test'
    and not (
      f.code = 'no_report'
      and (
        f.report_date < date '2026-10-25'
        or (
          f.report_date = public.ev_today()
          and extract(hour from (now() at time zone 'Asia/Omsk')) < 22
        )
      )
    );

  return jsonb_build_object(
    'ok', true,
    'from', v_from,
    'to', p_to,
    'flags', v_res,
    'coverage', v_cov
  );
end
$function$;

revoke execute on function public.ev_flags_overview(text, date, date)
  from public, authenticated;
grant execute on function public.ev_flags_overview(text, date, date)
  to anon, service_role;

commit;
