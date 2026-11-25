begin;

set local ev.allow_ddl = 'on';

-- Откат 20261125_privacy_server_flags.sql: ev_whos_where — точная прежняя версия
-- (md5 pg_get_functiondef = fbefa0ae697e6cbabc347496ab71a91b), новая RPC и таблица удаляются.
-- Тело прежней версии хранится в базе с переводами строк CRLF; здесь оно записано с LF
-- и переводится обратно в CRLF при создании, чтобы версия совпала байт в байт.
-- ВНИМАНИЕ: содержимое ev_cash_excluded_people теряется; наполнение хранится вне репозитория.

drop function if exists public.ev_cash_exclusions(text);
drop table if exists public.ev_cash_excluded_people;

do $restore$
begin
  execute 'create or replace function public.ev_whos_where(p_token text, p_from date, p_to date)'
       || ' returns jsonb language plpgsql stable security definer set search_path to '''' as '
       || pg_catalog.quote_literal(pg_catalog.replace($body$
declare v bigint := public.ev__sched_viewer(p_token);
begin
  if v is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if v = -1 then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then return jsonb_build_object('ok', false, 'error', 'range'); end if;
  return jsonb_build_object('ok', true, 'shifts', coalesce((
    select jsonb_agg(jsonb_build_object('date', s.shift_date, 'branch', s.branch_id, 'slot', s.slot,
                     'name', coalesce(p.short_name, s.raw_name),
                     'full', coalesce(p.full_name, s.raw_name),
                     'mine', (s.person_id is not null and s.person_id = v))
                     order by s.shift_date, s.branch_id, s.slot, coalesce(p.short_name, s.raw_name))
    from public.ev_sched_shifts s join public.ev__sched_live(p_from, p_to) l on l.version_id = s.version_id
    left join public.ev_people p on p.id = s.person_id
    where s.shift_date between p_from and p_to), '[]'::jsonb));
end $body$, chr(10), chr(13) || chr(10)));
  if md5(pg_catalog.pg_get_functiondef('public.ev_whos_where(text,date,date)'::regprocedure))
     <> 'fbefa0ae697e6cbabc347496ab71a91b' then
    raise exception 'rollback did not restore ev_whos_where exactly';
  end if;
end $restore$;

commit;
