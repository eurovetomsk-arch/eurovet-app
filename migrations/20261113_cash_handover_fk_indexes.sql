-- Cover foreign keys used by the append-only cash handover ledger.
-- Additive and safe while the feature remains off.

begin;
set local ev.allow_ddl = 'on';

create index if not exists ev_cash_handover_accepted_by_idx
  on public.ev_cash_handover_events (accepted_by);

create index if not exists ev_cash_handover_session_id_idx
  on public.ev_cash_handover_events (session_id);

create index if not exists ev_cash_handover_source_report_id_idx
  on public.ev_cash_handover_events (source_report_id);

commit;
