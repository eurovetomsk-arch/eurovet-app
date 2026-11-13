-- Activate only after the v1.82 frontend and production smoke checks pass.
update public.ev_cash_handover_config
set mode = 'shadow', updated_at = now()
where id = 1 and mode = 'off';
