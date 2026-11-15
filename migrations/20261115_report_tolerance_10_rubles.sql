begin;

set local ev.allow_ddl = 'on';

-- Михаил, 15.11.2026: абсолютная разница до 10,00 ₽ включительно
-- является допустимой погрешностью. Точные expected/actual/diff сохраняются.
do $migration$
declare
  v_function record;
  v_definition text;
  v_changed integer := 0;
begin
  for v_function in
    select p.oid, p.proname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('ev_cash_handover_accept', 'ev_cash_handover_correct')
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
    if pg_catalog.strpos(v_definition, 'abs(v_diff) <= 0.01') = 0 then
      raise exception 'Expected tolerance was not found in public.%', v_function.proname;
    end if;
    if pg_catalog.strpos(
      pg_catalog.substr(
        v_definition,
        pg_catalog.strpos(v_definition, 'abs(v_diff) <= 0.01') + 1
      ),
      'abs(v_diff) <= 0.01'
    ) > 0 then
      raise exception 'Tolerance occurs more than once in public.%', v_function.proname;
    end if;
    execute pg_catalog.replace(
      v_definition,
      'abs(v_diff) <= 0.01',
      'abs(v_diff) <= 10.00'
    );
    v_changed := v_changed + 1;
  end loop;

  if v_changed <> 2 then
    raise exception 'Expected 2 cash handover functions, found %', v_changed;
  end if;
end
$migration$;

-- Журнал приёмки append-only: старые статусы не переписываем. Клиент 1.89
-- применяет тот же допуск к сохранённому diff при показе исторического события.

commit;
