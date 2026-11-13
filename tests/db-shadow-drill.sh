#!/bin/bash
set -euo pipefail

ROOT="${EV_ROOT:-/Users/agent/ЕВРОВЕТ_копия}"
. "$ROOT/scripts/env.sh"
: "${DB_HOST:?missing DB_HOST}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-backup_ro}"
DR="$(mktemp -d /private/tmp/ev-handover-drill.XXXXXX)"
PORT=54333
T0="$(date +%s)"

cleanup() {
  "$PGBIN/pg_ctl" -D "$DR/pg" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$DR"
}
trap cleanup EXIT

PW="$(security find-generic-password -a backup_ro -s evrovet-backup-ro -w)"
PGPASSWORD="$PW" PGSSLMODE=require "$PGBIN/pg_dump" \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  --schema=public \
  --exclude-table=public.ev_sessions \
  --exclude-table=public.ev_cash_handover_config \
  --exclude-table=public.ev_cash_handover_events \
  --exclude-table=public.ev_vm_runs \
  --no-owner -Fc -f "$DR/prod.dump"
unset PW

"$PGBIN/initdb" -D "$DR/pg" -U postgres --auth-local=trust --auth-host=trust -E UTF8 --locale="${EV_LOCALE:-en_US.UTF-8}" >/dev/null
printf "listen_addresses = '127.0.0.1'\nport = %s\nunix_socket_directories = '%s'\nmax_connections = 20\n" "$PORT" "$DR" >> "$DR/pg/postgresql.conf"
"$PGBIN/pg_ctl" -D "$DR/pg" -l "$DR/pg.log" -w start >/dev/null
Q=("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)

"${Q[@]}" >/dev/null <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role backup_ro nologin;
create role audit_ro nologin;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;
create role supabase_admin nologin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select nullif(current_setting('request.jwt.claim.role', true), '') $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated, service_role;
create schema if not exists ev_guard;
create or replace function ev_guard.on_truncate() returns trigger language plpgsql as $g$ begin raise exception 'TRUNCATE forbidden'; end $g$;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto schema extensions;
SQL

"${Q[@]}" -c "drop schema if exists public cascade" >/dev/null
"$PGBIN/pg_restore" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres --no-owner --exit-on-error "$DR/prod.dump" 2>"$DR/restore.err"
"${Q[@]}" >/dev/null <<'SQL'
create table if not exists public.ev_sessions (
  id bigint primary key,
  token_hash text not null unique,
  person_id bigint not null references public.ev_people(id),
  device_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
SQL
"${Q[@]}" -f migrations/20261113_cash_handover_shadow.sql >/dev/null
"${Q[@]}" -f migrations/20261113_cash_handover_fk_indexes.sql >/dev/null
"${Q[@]}" -f migrations/20261113_vetmanager_coverage_gate.sql >/dev/null
"${Q[@]}" -f migrations/20261113_vetmanager_coverage_accepted_fix.sql >/dev/null
"${Q[@]}" -f migrations/20261113_vetmanager_coverage_gate_acl_fix.sql >/dev/null

"${Q[@]}" <<'SQL'
do $test$
declare
  d date := public.ev_today();
  prev_d date := public.ev_today() - 1;
  ctx jsonb;
  fp text;
  a jsonb;
  event_id bigint;
  c jsonb;
begin
  if (select mode from public.ev_cash_handover_config where id=1) <> 'off' then raise exception 'flag not off by default'; end if;
  if has_table_privilege('anon','public.ev_cash_handover_events','select') then raise exception 'anon table select leak'; end if;
  if not has_function_privilege('anon','public.ev_cash_handover_context(text,text,date)','execute') then raise exception 'context rpc unavailable'; end if;
  if to_regclass('public.ev_cash_handover_accepted_by_idx') is null
     or to_regclass('public.ev_cash_handover_session_id_idx') is null
     or to_regclass('public.ev_cash_handover_source_report_id_idx') is null then
    raise exception 'cash handover foreign-key indexes missing';
  end if;

  set local session_replication_role = replica;
  delete from public.ev_reports where branch_id='test' and report_date in (prev_d,d);
  delete from public.ev_person_roles where id between -98120 and -98100;
  delete from public.ev_sessions where id between -98120 and -98100;
  delete from public.ev_people where id between -98120 and -98100;
  set local session_replication_role = origin;

  insert into public.ev_branches(id,title,vetmanager_clinic_id,active)
  values ('test','TEST',10,true)
  on conflict (id) do update set active=true;

  insert into public.ev_people(id,full_name,short_name) overriding system value values
    (-98101,'Test Admin','Admin T.'),
    (-98102,'Test Doctor','Doctor T.'),
    (-98103,'Test Assistant','Assistant T.'),
    (-98104,'Test Head','Head T.');
  insert into public.ev_person_roles(id,person_id,role,valid_from) overriding system value values
    (-98101,-98101,'admin',prev_d),
    (-98111,-98101,'doctor',prev_d),
    (-98102,-98102,'doctor',prev_d),
    (-98103,-98103,'assistant_clinical',prev_d),
    (-98104,-98104,'head',prev_d);
  insert into public.ev_sessions(id,token_hash,person_id,device_id,expires_at) values
    (-98101,encode(extensions.digest('admin-token','sha256'),'hex'),-98101,'test-admin',now()+interval '1 hour'),
    (-98102,encode(extensions.digest('doctor-token','sha256'),'hex'),-98102,'test-doctor',now()+interval '1 hour'),
    (-98103,encode(extensions.digest('assistant-token','sha256'),'hex'),-98103,'test-assistant',now()+interval '1 hour'),
    (-98104,encode(extensions.digest('head-token','sha256'),'hex'),-98104,'test-head',now()+interval '1 hour');
  insert into public.ev_reports(id,branch_id,report_date,version,submitted_by,submitted_at,client_time,device_id,is_correction,correction_reason,data,client_uid) overriding system value
  values (-98101,'test',prev_d,1,-98101,now(),now(),'test-admin',false,null,'{"cashbox":{"closing":1000}}'::jsonb,'handover-test-prev');

  ctx := public.ev_cash_handover_context('doctor-token','test',d);
  if ctx->>'error' <> 'forbidden' then raise exception 'doctor role leak: %',ctx; end if;
  ctx := public.ev_cash_handover_context('assistant-token','test',d);
  if ctx->>'error' <> 'forbidden' then raise exception 'assistant role leak: %',ctx; end if;

  update public.ev_cash_handover_config set mode='shadow',updated_at=now() where id=1;
  ctx := public.ev_cash_handover_context('admin-token','test',d);
  if not (ctx->>'ok')::boolean or (ctx->>'expected')::numeric <> 1000 then raise exception 'bad admin context: %',ctx; end if;
  fp := ctx#>>'{source,fingerprint}';
  if fp is null or length(fp)<>64 then raise exception 'bad fingerprint: %',fp; end if;

  a := public.ev_cash_handover_accept('admin-token','test',d,1000,fp,'accept-uid-0001',now(),'test-admin');
  if not (a->>'ok')::boolean or a->>'status'<>'matched' then raise exception 'accept failed: %',a; end if;
  event_id := (a->>'id')::bigint;
  a := public.ev_cash_handover_accept('admin-token','test',d,1000,fp,'accept-uid-0001',now(),'test-admin');
  if not (a->>'idempotent')::boolean or (a->>'id')::bigint<>event_id then raise exception 'idempotency failed: %',a; end if;
  a := public.ev_cash_handover_accept('admin-token','test',d,1000,fp,'accept-uid-0002',now(),'test-admin');
  if a->>'error'<>'already_accepted' then raise exception 'duplicate root accepted: %',a; end if;

  c := public.ev_cash_handover_correct('head-token',event_id,999.98,'test correction','correct-uid-001',now(),'test-head');
  if not (c->>'ok')::boolean or c->>'status'<>'discrepancy' then raise exception 'head correction failed: %',c; end if;
  if (select count(*) from public.ev_cash_handover_events where branch_id='test' and handover_date=d)<>2 then raise exception 'append-only chain wrong'; end if;
  if (select actual from public.ev_cash_handover_events where id=event_id)<>1000 then raise exception 'original event changed'; end if;

  begin
    update public.ev_cash_handover_events set actual=0 where id=event_id;
    raise exception 'immutable update unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm='immutable update unexpectedly succeeded' then raise; end if;
  end;
end
$test$;

select 'db-shadow-drill: ok' as result,
       (select count(*) from public.ev_cash_handover_events) as handover_rows,
       (select count(*) from pg_tables where schemaname='public') as restored_tables;
SQL

"${Q[@]}" <<'SQL'
do $test$
declare
  d date;
  v_version integer;
  r jsonb;
  o jsonb;
  row_id bigint;
begin
  if has_table_privilege('anon','public.ev_vm_runs','select') then
    raise exception 'anon vm coverage table select leak';
  end if;
  if has_function_privilege('anon','public.ev_record_vm_run(text,text,date,text,text,jsonb,jsonb,jsonb)','execute') then
    raise exception 'anon vm recorder execution leak';
  end if;
  if not has_function_privilege('service_role','public.ev_record_vm_run(text,text,date,text,text,jsonb,jsonb,jsonb)','execute') then
    raise exception 'service vm recorder unavailable';
  end if;
  if has_function_privilege('anon','public.ev_flags_overview_v182_base(text,date,date)','execute')
     or has_function_privilege('authenticated','public.ev_flags_overview_v182_base(text,date,date)','execute') then
    raise exception 'base overview execution leak';
  end if;
  if not has_function_privilege('service_role','public.ev_flags_overview_v182_base(text,date,date)','execute')
     or not has_function_privilege('anon','public.ev_flags_overview(text,date,date)','execute') then
    raise exception 'overview ACL mismatch';
  end if;

  select max(report_date) into d
  from public.ev_reports
  where branch_id='70let' and report_date <= public.ev_today();
  if d is null then raise exception 'no source report for vm drill'; end if;
  select max(version) into v_version
  from public.ev_reports
  where branch_id='70let' and report_date=d;

  insert into public.ev_checks(run_id,source,branch_id,report_date,report_version,code,level,title,detail)
  values (gen_random_uuid(),'vetmanager','70let',d,v_version,'accept-compat-drill','red','Accepted compatibility drill','synthetic drill');
  insert into public.ev_check_accept(branch_id,report_date,code,report_version,accepted_by,note,fingerprint)
  values ('70let',d,'accept-compat-drill',v_version,-98104,'synthetic drill',null);

  o := public.ev_flags_overview('head-token',d,d);
  if not exists (
    select 1 from jsonb_array_elements(o->'flags') f
    where f->>'branch'='70let' and f->>'date'=d::text and f->>'code'='accept-compat-drill'
      and (f->>'accepted')::boolean
  ) then raise exception 'accepted finding compatibility missing: %',o; end if;

  r := public.ev_record_vm_run(
    'vm-drill-partial-0001','70let',d,'partial',repeat('a',64),
    '{"invoices_complete":true,"revenue_summary_complete":true,"payments_complete":true,"cashbox_complete":true,"doctor_lines_complete":false}'::jsonb,
    '{"invoice_count":1}'::jsonb,
    '{"source":"synthetic-drill"}'::jsonb
  );
  if not (r->>'ok')::boolean or r->>'status'<>'partial' then raise exception 'partial vm record failed: %',r; end if;
  row_id := (r->>'id')::bigint;

  r := public.ev_record_vm_run(
    'vm-drill-partial-0001','70let',d,'partial',repeat('a',64),
    '{"invoices_complete":true,"revenue_summary_complete":true,"payments_complete":true,"cashbox_complete":true,"doctor_lines_complete":false}'::jsonb,
    '{"invoice_count":1}'::jsonb,
    '{"source":"synthetic-drill"}'::jsonb
  );
  if not (r->>'idempotent')::boolean or (r->>'id')::bigint<>row_id then raise exception 'vm idempotency failed: %',r; end if;

  r := public.ev_record_vm_run(
    'vm-drill-invalid-0002','70let',d,'complete',repeat('b',64),
    '{"invoices_complete":true,"revenue_summary_complete":true,"payments_complete":true,"cashbox_complete":true,"doctor_lines_complete":false}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb
  );
  if r->>'error'<>'coverage_incomplete' then raise exception 'incomplete vm promoted: %',r; end if;

  o := public.ev_flags_overview('head-token',d,d);
  if not (o->>'ok')::boolean then raise exception 'coverage overview failed: %',o; end if;
  if jsonb_array_length(o->'coverage')<1 then raise exception 'coverage missing from overview'; end if;
  if not exists (
    select 1 from jsonb_array_elements(o->'flags') f
    where f->>'branch'='70let' and f->>'date'=d::text and f->>'code'='vm_partial'
      and coalesce((f->>'accepted')::boolean, false) = false
  ) then raise exception 'partial vm finding missing: %',o; end if;

  r := public.ev_record_vm_run(
    'vm-drill-complete-0003','70let',d,'complete',repeat('c',64),
    '{"invoices_complete":true,"revenue_summary_complete":true,"payments_complete":true,"cashbox_complete":true,"doctor_lines_complete":true}'::jsonb,
    '{"invoice_count":1}'::jsonb,
    '{"source":"synthetic-drill"}'::jsonb
  );
  if not (r->>'ok')::boolean or r->>'status'<>'complete' then raise exception 'complete vm record failed: %',r; end if;

  begin
    update public.ev_vm_runs set status='failed' where id=row_id;
    raise exception 'vm immutable update unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm='vm immutable update unexpectedly succeeded' then raise; end if;
  end;
end
$test$;

select 'vm-coverage-drill: ok' as result,
       (select count(*) from public.ev_vm_runs) as coverage_rows;
SQL

echo "db-shadow-drill completed in $(( $(date +%s) - T0 ))s"
