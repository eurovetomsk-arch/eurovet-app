-- Compatibility repair for the already deployed coverage gate.
-- Preserve the former `accepted` flag while keeping coverage findings fail-closed.

begin;
set local ev.allow_ddl = 'on';

do $migration$
begin
  if to_regprocedure('public.ev_flags_overview_v182_base(text,date,date)') is null then
    alter function public.ev_flags_overview(text, date, date)
      rename to ev_flags_overview_v182_base;
  end if;
end
$migration$;

revoke execute on function public.ev_flags_overview_v182_base(text, date, date)
  from public, anon, authenticated;
grant execute on function public.ev_flags_overview_v182_base(text, date, date)
  to service_role;

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
  v_base jsonb;
  v_flags jsonb;
begin
  v_base := public.ev_flags_overview_v182_base(p_token, p_from, p_to);
  if v_base is null or coalesce((v_base ->> 'ok')::boolean, false) is not true then
    return v_base;
  end if;

  select coalesce(jsonb_agg(
    e.value || jsonb_build_object(
      'accepted',
      case
        when e.value ->> 'code' in ('vm_not_checked', 'vm_partial') then false
        else public.ev_is_accepted(
          e.value ->> 'branch',
          (e.value ->> 'date')::date,
          e.value ->> 'code',
          coalesce(nullif(e.value ->> 'version', '')::integer, 0)
        )
      end
    ) order by e.ordinality
  ), '[]'::jsonb)
  into v_flags
  from jsonb_array_elements(coalesce(v_base -> 'flags', '[]'::jsonb))
       with ordinality as e(value, ordinality);

  return jsonb_set(v_base, '{flags}', v_flags, true);
end
$function$;

revoke execute on function public.ev_flags_overview(text, date, date)
  from public, authenticated;
grant execute on function public.ev_flags_overview(text, date, date)
  to anon, service_role;

commit;
