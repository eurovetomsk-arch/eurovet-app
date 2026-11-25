-- Тест 20261125_privacy_server_flags.sql. Ничего не сохраняет: в конце всегда raise exception,
-- транзакция откатывается. Результат читается в тексте ошибки: «EV_TEST PASS …» или «EV_TEST FAIL: …».
-- Временные сессии и строка исключения создаются внутри теста и исчезают вместе с откатом.
do $test$
declare
  v_head bigint; v_other bigint; v_sid bigint; v_tok_h text := 'ev-test-head-' || gen_random_uuid();
  v_tok_o text := 'ev-test-other-' || gen_random_uuid();
  v_from date := date_trunc('month', public.ev_today())::date; v_to date;
  r jsonb; v_old jsonb; v_new jsonb; v_n int; v_bad int; v_asst int;
begin
  v_to := (v_from + interval '1 month - 1 day')::date;

  -- 0. функции денег/зарплат не тронуты
  if md5(pg_get_functiondef('public.ev_payroll_statement(text,date,date)'::regprocedure)) <> '439e968ec8f245325e4d4142cb9a5885'
     or md5(pg_get_functiondef('public.ev_cash_on_hand(text,date)'::regprocedure)) <> '1d56299b8e75689210db03e34f6927c1' then
    raise exception 'EV_TEST FAIL: money functions changed';
  end if;

  -- 1. права: таблица закрыта, новая RPC — только anon (+service_role), не authenticated
  if has_table_privilege('anon', 'public.ev_cash_excluded_people', 'select')
     or has_table_privilege('authenticated', 'public.ev_cash_excluded_people', 'select') then
    raise exception 'EV_TEST FAIL: table readable by anon/authenticated'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ev_cash_excluded_people'::regclass) then
    raise exception 'EV_TEST FAIL: RLS off'; end if;
  if not has_function_privilege('anon', 'public.ev_cash_exclusions(text)', 'execute')
     or has_function_privilege('authenticated', 'public.ev_cash_exclusions(text)', 'execute') then
    raise exception 'EV_TEST FAIL: ev_cash_exclusions grants'; end if;
  if not has_function_privilege('anon', 'public.ev_whos_where(text,date,date)', 'execute') then
    raise exception 'EV_TEST FAIL: ev_whos_where lost anon'; end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'ev\_\_%' and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then raise exception 'EV_TEST FAIL: anon can execute % internal ev__ functions', v_bad; end if;

  -- 2. временные сессии: руководитель и не-руководитель (любой другой активный сотрудник)
  select person_id into v_head from public.ev_person_roles
   where role = 'head' and public.ev_active_on(valid_from, valid_to, public.ev_today()) order by person_id limit 1;
  select r2.person_id into v_other from public.ev_person_roles r2
   where r2.role not in ('head', 'outsource') and public.ev_active_on(r2.valid_from, r2.valid_to, public.ev_today())
     and not public.ev__is_head(r2.person_id) order by r2.person_id limit 1;
  if v_head is null or v_other is null then raise exception 'EV_TEST FAIL: no head/other person in DB'; end if;
  insert into public.ev_sessions(token_hash, person_id, expires_at)
  values (encode(extensions.digest(v_tok_h, 'sha256'), 'hex'), v_head, now() + interval '1 hour') returning id into v_sid;
  insert into public.ev_session_scope(session_id, last_seen) values (v_sid, now());
  insert into public.ev_sessions(token_hash, person_id, expires_at)
  values (encode(extensions.digest(v_tok_o, 'sha256'), 'hex'), v_other, now() + interval '1 hour') returning id into v_sid;
  insert into public.ev_session_scope(session_id, last_seen) values (v_sid, now());

  -- 3. ev_cash_exclusions
  r := public.ev_cash_exclusions('nope');
  if r <> '{"ok":false,"error":"session"}'::jsonb then raise exception 'EV_TEST FAIL: bad token -> %', r; end if;
  r := public.ev_cash_exclusions(v_tok_o);
  if r <> '{"ok":false,"error":"forbidden"}'::jsonb then raise exception 'EV_TEST FAIL: non-head -> %', r; end if;
  delete from public.ev_cash_excluded_people;
  r := public.ev_cash_exclusions(v_tok_h);
  if r <> '{"ok":true,"person_ids":[]}'::jsonb then raise exception 'EV_TEST FAIL: empty -> %', r; end if;
  insert into public.ev_cash_excluded_people(person_id, note) values (v_other, 'test');
  r := public.ev_cash_exclusions(v_tok_h);
  if r <> jsonb_build_object('ok', true, 'person_ids', jsonb_build_array(v_other)) then raise exception 'EV_TEST FAIL: one -> %', r; end if;

  -- 4. ev_whos_where: старые поля без изменений + atype
  r := public.ev_whos_where('nope', v_from, v_to);
  if r <> '{"ok":false,"error":"session"}'::jsonb then raise exception 'EV_TEST FAIL: whos bad token -> %', r; end if;
  r := public.ev_whos_where(v_tok_h, v_to, v_from);
  if r <> '{"ok":false,"error":"range"}'::jsonb then raise exception 'EV_TEST FAIL: whos range -> %', r; end if;
  r := public.ev_whos_where(v_tok_h, v_from, v_to);
  if not coalesce((r ->> 'ok')::boolean, false) then raise exception 'EV_TEST FAIL: whos -> %', r; end if;
  select coalesce(jsonb_agg(x - 'atype'), '[]'::jsonb) into v_new from jsonb_array_elements(r -> 'shifts') x;
  select coalesce(jsonb_agg(jsonb_build_object('date', s.shift_date, 'branch', s.branch_id, 'slot', s.slot,
           'name', coalesce(p.short_name, s.raw_name), 'full', coalesce(p.full_name, s.raw_name),
           'mine', (s.person_id is not null and s.person_id = v_head))
           order by s.shift_date, s.branch_id, s.slot, coalesce(p.short_name, s.raw_name)), '[]'::jsonb) into v_old
    from public.ev_sched_shifts s join public.ev__sched_live(v_from, v_to) l on l.version_id = s.version_id
    left join public.ev_people p on p.id = s.person_id where s.shift_date between v_from and v_to;
  if v_new <> v_old then raise exception 'EV_TEST FAIL: old fields changed'; end if;
  select count(*), count(*) filter (where x ->> 'slot' = 'assistant') into v_n, v_asst
    from jsonb_array_elements(r -> 'shifts') x;
  -- у ассистента без роли ассистента на дату atype = null — это допустимо
  select count(*) into v_bad from jsonb_array_elements(r -> 'shifts') x
   where not (x ? 'atype')
      or (x ->> 'slot' <> 'assistant' and x -> 'atype' <> 'null'::jsonb)
      or (x -> 'atype' <> 'null'::jsonb and (x ->> 'atype') not in ('clinical', 'tech'));
  if v_bad > 0 then raise exception 'EV_TEST FAIL: % shifts with bad atype', v_bad; end if;
  select count(*) into v_bad from jsonb_array_elements(r -> 'shifts') x where x ->> 'slot' = 'assistant' and x ->> 'atype' is not null;
  if v_asst > 0 and v_bad = 0 then raise exception 'EV_TEST FAIL: no assistant got atype'; end if;

  raise exception 'EV_TEST PASS shifts=% assistants=% with_atype=%', v_n, v_asst, v_bad;
end $test$;
