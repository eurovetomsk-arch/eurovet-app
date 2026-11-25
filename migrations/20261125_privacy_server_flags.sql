begin;

set local ev.allow_ddl = 'on';

-- Приватность (ТЗ 25.11.2026, Б1): данные, которые раньше лежали в публичном клиенте,
-- теперь отдаёт сервер.
--   1) ev_whos_where: к каждой смене добавлено поле atype ('clinical' / 'tech' / null)
--      из ev_person_roles на дату смены. Остальные поля и порядок — без изменений.
--   2) Список «не входит в наличные сейфа» хранится в таблице ev_cash_excluded_people
--      (RLS, без политик, без прав anon/authenticated) и читается новой входной RPC
--      ev_cash_exclusions(p_token) — только руководитель.
-- Функции денег, отчётов и зарплат НЕ меняются.
-- Наполнение таблицы — отдельным файлом вне репозитория (номера людей в публичный код не кладём).

do $guard$
begin
  if md5(pg_catalog.pg_get_functiondef('public.ev_whos_where(text,date,date)'::regprocedure))
     <> 'fbefa0ae697e6cbabc347496ab71a91b' then
    raise exception 'ev_whos_where differs from the expected version; stop';
  end if;
end $guard$;

create table public.ev_cash_excluded_people (
  person_id  bigint primary key references public.ev_people(id),
  note       text,
  created_at timestamptz not null default now()
);
alter table public.ev_cash_excluded_people enable row level security;
revoke all on table public.ev_cash_excluded_people from public, anon, authenticated;

create or replace function public.ev_whos_where(p_token text, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v bigint := public.ev__sched_viewer(p_token);
begin
  if v is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if v = -1 then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then return jsonb_build_object('ok', false, 'error', 'range'); end if;
  return jsonb_build_object('ok', true, 'shifts', coalesce((
    select jsonb_agg(jsonb_build_object('date', s.shift_date, 'branch', s.branch_id, 'slot', s.slot,
                     'name', coalesce(p.short_name, s.raw_name),
                     'full', coalesce(p.full_name, s.raw_name),
                     'mine', (s.person_id is not null and s.person_id = v),
                     'atype', case when s.slot = 'assistant' and s.person_id is not null then (
                        select case r.role when 'assistant_clinical' then 'clinical' when 'assistant_tech' then 'tech' end
                          from public.ev_person_roles r
                         where r.person_id = s.person_id
                           and r.role in ('assistant_clinical', 'assistant_tech')
                           and public.ev_active_on(r.valid_from, r.valid_to, s.shift_date)
                         order by r.valid_from desc nulls last, r.id desc
                         limit 1) end)
                     order by s.shift_date, s.branch_id, s.slot, coalesce(p.short_name, s.raw_name))
    from public.ev_sched_shifts s join public.ev__sched_live(p_from, p_to) l on l.version_id = s.version_id
    left join public.ev_people p on p.id = s.person_id
    where s.shift_date between p_from and p_to), '[]'::jsonb));
end $function$;

create function public.ev_cash_exclusions(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare v_pid bigint := public.ev_session_person(p_token);
begin
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not public.ev__is_head(v_pid) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return jsonb_build_object('ok', true, 'person_ids', coalesce((
    select jsonb_agg(e.person_id order by e.person_id) from public.ev_cash_excluded_people e), '[]'::jsonb));
end $function$;

revoke all on function public.ev_cash_exclusions(text) from public, anon, authenticated;
grant execute on function public.ev_cash_exclusions(text) to anon, service_role;

commit;
