begin;

set local ev.allow_ddl = 'on';

drop index if exists public.ev_collection_one_admin_per_branch_day;
drop function if exists public.ev_collection_handoff_correct(text,text,numeric,text,text,text);

-- Вернуть четыре технических дубля в исходный статус, если rollback выполняется
-- после разового ремонта. После восстановления пересчитать состояние так, как
-- его считал прежний trigger (сумма всех не-cancelled строк).
update public.ev_collection_transit
   set status=cancelled_from_status,
       cancelled_at=null,
       cancelled_by=null,
       cancel_reason=null,
       cancelled_from_status=null
 where branch_id='70let' and event_date=date '2026-11-25' and source='admin'
   and status='cancelled'
   and cancel_reason='Технический дубль повторного нажатия; фактическая передача одна — 15 500 ₽';

do $restore_status$
declare
  v_expected numeric;
  v_declared numeric;
  v_version integer;
begin
  select r.version, public.ev__mr_sum(r.data)
    into v_version, v_declared
    from public.ev_reports r
   where r.branch_id='70let' and r.report_date=date '2026-11-25'
   order by r.version desc, r.id desc limit 1;
  if v_version is not null then
    select coalesce(sum(amount),0) into v_expected
      from public.ev_collection_transit
     where branch_id='70let' and event_date=date '2026-11-25' and status<>'cancelled';
    update public.ev_collection_transit
       set status=case when abs(v_expected-v_declared)<=10 then 'matched' else 'mismatch' end,
           confirmed_amount=v_declared, report_version=v_version, confirmed_at=now()
     where branch_id='70let' and event_date=date '2026-11-25' and status<>'cancelled';
  end if;
end $restore_status$;

create or replace function public.ev_collection_handoff(p_token text, p_branch text, p_amount numeric, p_recipient text, p_uid text)
 returns jsonb
 language plpgsql security definer set search_path to ''
as $function$
declare
  v_pid bigint := public.ev_session_person(p_token);
  v_id bigint;
  v_today date := public.ev_today();
  v_amount numeric;
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
  insert into public.ev_collection_transit(branch_id,event_date,amount,source,recipient,created_by,client_uid)
  values(p_branch,v_today,v_amount,'admin',left(trim(p_recipient),80),v_pid,p_uid)
  on conflict(client_uid) do nothing returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'duplicate',v_id is null,'date',v_today,'amount',v_amount,'status','in_transit');
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
   where branch_id=new.branch_id and event_date=new.report_date and status<>'cancelled';
  if v_expected=0 then return new; end if;
  v_declared := public.ev__mr_sum(new.data);
  v_status := case when abs(v_expected-v_declared)<=10 then 'matched' else 'mismatch' end;
  update public.ev_collection_transit
     set status=v_status, confirmed_amount=v_declared, report_version=new.version, confirmed_at=now()
   where branch_id=new.branch_id and event_date=new.report_date and status<>'cancelled';
  return new;
end $function$;

alter table public.ev_collection_transit drop constraint if exists ev_collection_transit_cancel_shape;
alter table public.ev_collection_transit drop constraint if exists ev_collection_transit_cancelled_by_fkey;
alter table public.ev_collection_transit drop constraint if exists ev_collection_transit_supersedes_id_fkey;
drop index if exists public.ev_collection_transit_cancelled_by_idx;
drop index if exists public.ev_collection_transit_supersedes_id_idx;
alter table public.ev_collection_transit
  drop column if exists cancelled_by,
  drop column if exists cancel_reason,
  drop column if exists cancelled_from_status,
  drop column if exists supersedes_id;

commit;
