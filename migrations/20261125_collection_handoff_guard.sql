begin;

set local ev.allow_ddl = 'on';

-- Инкассация: одна активная передача администратора на филиал/день.
-- Исправление не переписывает сумму старой строки: старая строка становится
-- cancelled с причиной, новая ссылается на неё через supersedes_id.

do $guard$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='ev_collection_transit'
       and column_name='cancel_reason'
  ) and md5(pg_catalog.pg_get_functiondef(
       'public.ev_collection_handoff(text,text,numeric,text,text)'::regprocedure
     )) <> '3ca9d681eeb3c585fc13bf3d3c0afabc' then
    raise exception 'ev_collection_handoff differs from reviewed source; stop';
  end if;
end $guard$;

alter table public.ev_collection_transit
  add column if not exists cancelled_by bigint,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_from_status text,
  add column if not exists supersedes_id bigint;

do $ddl$
begin
  if not exists (select 1 from pg_constraint where conname='ev_collection_transit_cancelled_by_fkey') then
    alter table public.ev_collection_transit
      add constraint ev_collection_transit_cancelled_by_fkey
      foreign key(cancelled_by) references public.ev_people(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='ev_collection_transit_supersedes_id_fkey') then
    alter table public.ev_collection_transit
      add constraint ev_collection_transit_supersedes_id_fkey
      foreign key(supersedes_id) references public.ev_collection_transit(id);
  end if;
  if not exists (select 1 from pg_constraint where conname='ev_collection_transit_cancel_shape') then
    alter table public.ev_collection_transit
      add constraint ev_collection_transit_cancel_shape check (
        (status <> 'cancelled' and cancelled_at is null and cancel_reason is null and cancelled_from_status is null)
        or
        (status = 'cancelled' and cancelled_at is not null
          and length(btrim(cancel_reason)) between 5 and 300
          and cancelled_from_status in ('in_transit','matched','mismatch'))
      );
  end if;
end $ddl$;

create index if not exists ev_collection_transit_cancelled_by_idx
  on public.ev_collection_transit(cancelled_by) where cancelled_by is not null;
create index if not exists ev_collection_transit_supersedes_id_idx
  on public.ev_collection_transit(supersedes_id) where supersedes_id is not null;

-- Разовое исправление подтверждённого инцидента 70let 25.11.2026.
-- Выполняется только при точной форме: 5 активных admin-строк по 15 500 ₽,
-- созданных одним человеком. Иное состояние останавливает транзакцию.
do $repair$
declare
  v_count integer;
  v_amount_min numeric;
  v_amount_max numeric;
  v_people integer;
  v_keep bigint;
  v_report_version integer;
  v_declared numeric;
begin
  select count(*), min(amount), max(amount), count(distinct created_by)
    into v_count, v_amount_min, v_amount_max, v_people
    from public.ev_collection_transit
   where branch_id='70let' and event_date=date '2026-11-25'
     and source='admin' and status<>'cancelled';

  if v_count = 0 then
    return; -- тестовая/повторный запуск без этого инцидента
  end if;
  if v_count <> 5 or v_amount_min <> 15500 or v_amount_max <> 15500 or v_people <> 1 then
    raise exception 'unexpected 70let 2026-11-25 collection shape: count %, min %, max %, people %',
      v_count, v_amount_min, v_amount_max, v_people;
  end if;

  select id into v_keep
    from public.ev_collection_transit
   where branch_id='70let' and event_date=date '2026-11-25'
     and source='admin' and status<>'cancelled'
   order by created_at, id
   limit 1;

  update public.ev_collection_transit
     set cancelled_from_status=status,
         status='cancelled',
         cancelled_at=now(),
         cancel_reason='Технический дубль повторного нажатия; фактическая передача одна — 15 500 ₽'
   where branch_id='70let' and event_date=date '2026-11-25'
     and source='admin' and status<>'cancelled' and id<>v_keep;

  select r.version, public.ev__mr_sum(r.data)
    into v_report_version, v_declared
    from public.ev_reports r
   where r.branch_id='70let' and r.report_date=date '2026-11-25'
   order by r.version desc, r.id desc
   limit 1;

  if v_report_version is not null then
    update public.ev_collection_transit
       set status=case when abs(amount-v_declared)<=10 then 'matched' else 'mismatch' end,
           confirmed_amount=v_declared,
           report_version=v_report_version,
           confirmed_at=now()
     where id=v_keep;
  end if;
end $repair$;

create unique index if not exists ev_collection_one_admin_per_branch_day
  on public.ev_collection_transit(branch_id,event_date)
  where source='admin' and status<>'cancelled';

create or replace function public.ev_collection_handoff(
  p_token text, p_branch text, p_amount numeric, p_recipient text, p_uid text
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_pid bigint := public.ev_session_person(p_token);
  v_id bigint;
  v_today date := public.ev_today();
  v_amount numeric;
  v_recipient text;
  v_old public.ev_collection_transit%rowtype;
begin
  if v_pid is null then return jsonb_build_object('ok',false,'error','session'); end if;
  if not public.ev__can_report(v_pid) or not public.ev__access_scope(p_token,p_branch,v_today) then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;
  if p_branch is null or p_branch='test' or p_amount is null or p_amount < 0.01 or p_amount > 5000000
     or nullif(trim(p_recipient),'') is null or length(trim(p_recipient)) > 80
     or p_uid is null or length(p_uid) < 8 then
    return jsonb_build_object('ok',false,'error','input');
  end if;
  v_amount := round(p_amount,2);
  v_recipient := left(trim(p_recipient),80);

  select * into v_old from public.ev_collection_transit where client_uid=p_uid;
  if found then
    if v_old.branch_id<>p_branch or v_old.event_date<>v_today or v_old.source<>'admin' then
      return jsonb_build_object('ok',false,'error','uid_conflict');
    end if;
    return jsonb_build_object('ok',true,'id',v_old.id,'idempotent',true,
      'already_recorded',true,'date',v_old.event_date,'amount',v_old.amount,
      'recipient',v_old.recipient,'status',v_old.status);
  end if;

  select * into v_old
    from public.ev_collection_transit
   where branch_id=p_branch and event_date=v_today and source='admin' and status<>'cancelled'
   order by id limit 1;
  if found then
    if v_old.amount=v_amount and v_old.recipient=v_recipient then
      return jsonb_build_object('ok',true,'id',v_old.id,'already_recorded',true,
        'date',v_old.event_date,'amount',v_old.amount,'recipient',v_old.recipient,'status',v_old.status);
    end if;
    return jsonb_build_object('ok',false,'error','handoff_exists','id',v_old.id,
      'date',v_old.event_date,'amount',v_old.amount,'recipient',v_old.recipient,'status',v_old.status);
  end if;

  begin
    insert into public.ev_collection_transit(branch_id,event_date,amount,source,recipient,created_by,client_uid)
    values(p_branch,v_today,v_amount,'admin',v_recipient,v_pid,p_uid)
    returning id into v_id;
  exception when unique_violation then
    select * into v_old
      from public.ev_collection_transit
     where branch_id=p_branch and event_date=v_today and source='admin' and status<>'cancelled'
     order by id limit 1;
    if found then
      return jsonb_build_object('ok',true,'id',v_old.id,'already_recorded',true,
        'date',v_old.event_date,'amount',v_old.amount,'recipient',v_old.recipient,'status',v_old.status);
    end if;
    raise;
  end;
  return jsonb_build_object('ok',true,'id',v_id,'date',v_today,'amount',v_amount,
    'recipient',v_recipient,'status','in_transit');
end $function$;

create or replace function public.ev_collection_handoff_correct(
  p_token text, p_branch text, p_amount numeric, p_recipient text,
  p_reason text, p_uid text
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_pid bigint := public.ev_session_person(p_token);
  v_today date := public.ev_today();
  v_amount numeric;
  v_recipient text;
  v_reason text;
  v_old public.ev_collection_transit%rowtype;
  v_retry public.ev_collection_transit%rowtype;
  v_id bigint;
  v_report_version integer;
  v_declared numeric;
  v_status text := 'in_transit';
begin
  if v_pid is null then return jsonb_build_object('ok',false,'error','session'); end if;
  if not public.ev__can_report(v_pid) or not public.ev__access_scope(p_token,p_branch,v_today) then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;
  if p_branch is null or p_branch='test' or p_amount is null or p_amount < 0.01 or p_amount > 5000000
     or nullif(trim(p_recipient),'') is null or length(trim(p_recipient)) > 80
     or p_uid is null or length(p_uid) < 8
     or length(trim(coalesce(p_reason,''))) < 5 or length(trim(p_reason)) > 300 then
    return jsonb_build_object('ok',false,'error','input');
  end if;
  v_amount := round(p_amount,2);
  v_recipient := left(trim(p_recipient),80);
  v_reason := left(trim(p_reason),300);

  select * into v_retry from public.ev_collection_transit where client_uid=p_uid;
  if found then
    if v_retry.branch_id<>p_branch or v_retry.event_date<>v_today or v_retry.source<>'admin'
       or v_retry.supersedes_id is null then
      return jsonb_build_object('ok',false,'error','uid_conflict');
    end if;
    return jsonb_build_object('ok',true,'id',v_retry.id,'idempotent',true,'corrected',true,
      'date',v_retry.event_date,'amount',v_retry.amount,'recipient',v_retry.recipient,'status',v_retry.status);
  end if;

  select * into v_old
    from public.ev_collection_transit
   where branch_id=p_branch and event_date=v_today and source='admin' and status<>'cancelled'
   order by id limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'error','handoff_not_found'); end if;
  if v_old.amount=v_amount and v_old.recipient=v_recipient then
    return jsonb_build_object('ok',false,'error','no_change','id',v_old.id,'amount',v_old.amount);
  end if;

  update public.ev_collection_transit
     set cancelled_from_status=status,
         status='cancelled', cancelled_at=now(), cancelled_by=v_pid, cancel_reason=v_reason
   where id=v_old.id;

  select r.version, public.ev__mr_sum(r.data)
    into v_report_version, v_declared
    from public.ev_reports r
   where r.branch_id=p_branch and r.report_date=v_today
   order by r.version desc, r.id desc limit 1;
  if v_report_version is not null then
    v_status := case when abs(v_amount-v_declared)<=10 then 'matched' else 'mismatch' end;
  end if;

  insert into public.ev_collection_transit(
    branch_id,event_date,amount,source,recipient,status,confirmed_amount,report_version,
    created_by,confirmed_at,client_uid,supersedes_id
  ) values (
    p_branch,v_today,v_amount,'admin',v_recipient,v_status,
    case when v_report_version is null then null else v_declared end,
    v_report_version,v_pid,case when v_report_version is null then null else now() end,p_uid,v_old.id
  ) returning id into v_id;

  return jsonb_build_object('ok',true,'id',v_id,'corrected',true,'supersedes_id',v_old.id,
    'date',v_today,'amount',v_amount,'recipient',v_recipient,'status',v_status);
end $function$;

create or replace function public.ev_collection_reconcile_report()
 returns trigger
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_expected numeric;
  v_declared numeric;
  v_status text;
begin
  if new.branch_id='test' then return new; end if;
  select coalesce(sum(amount),0) into v_expected
    from public.ev_collection_transit
   where branch_id=new.branch_id and event_date=new.report_date
     and source='admin' and status<>'cancelled';
  if v_expected=0 then return new; end if;
  v_declared := public.ev__mr_sum(new.data);
  v_status := case when abs(v_expected-v_declared)<=10 then 'matched' else 'mismatch' end;
  update public.ev_collection_transit
     set status=v_status, confirmed_amount=v_declared, report_version=new.version, confirmed_at=now()
   where branch_id=new.branch_id and event_date=new.report_date
     and source='admin' and status<>'cancelled';
  return new;
end $function$;

revoke all on function public.ev_collection_handoff_correct(text,text,numeric,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.ev_collection_handoff_correct(text,text,numeric,text,text,text)
  to anon, authenticated, service_role;

commit;
