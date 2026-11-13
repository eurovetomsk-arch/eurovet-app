-- Keep clean restores and production on the same least-privilege ACL.

begin;
set local ev.allow_ddl = 'on';

revoke execute on function public.ev_flags_overview_v182_base(text, date, date)
  from public, anon, authenticated;
grant execute on function public.ev_flags_overview_v182_base(text, date, date)
  to service_role;

revoke execute on function public.ev_flags_overview(text, date, date)
  from public, authenticated;
grant execute on function public.ev_flags_overview(text, date, date)
  to anon, service_role;

commit;
