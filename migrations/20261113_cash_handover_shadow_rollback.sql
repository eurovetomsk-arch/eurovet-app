-- Immediate non-destructive rollback: hide and disable the shadow feature.
-- Historical handover evidence stays intact and append-only.
update public.ev_cash_handover_config
set mode = 'off', updated_at = now()
where id = 1;
