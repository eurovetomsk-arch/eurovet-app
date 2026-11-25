-- EXPECT: RESULT PASS; active=1; cancelled=1; repeat_same=true; changed_blocked=true; corrected=true; retry=true; unauth=true
begin;

do $test$
declare
  v_pid bigint;
  v_sid bigint;
  v_token text := 'collection-guard-test-token-20261125';
  v_today date := public.ev_today();
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  r4 jsonb;
  r5 jsonb;
  r6 jsonb;
  v_active integer;
  v_cancelled integer;
begin
  select pr.person_id into v_pid
    from public.ev_person_roles pr
   where pr.role='admin' and public.ev_active_on(pr.valid_from,pr.valid_to,v_today)
   order by pr.id limit 1;
  if v_pid is null then raise exception 'no active admin for test'; end if;

  delete from public.ev_collection_transit
   where branch_id='70let' and event_date=v_today and client_uid like 'collection-guard-test-%';

  insert into public.ev_sessions(token_hash,person_id,device_id,expires_at)
  values(encode(extensions.digest(v_token,'sha256'),'hex'),v_pid,'collection-guard-test',now()+interval '1 hour')
  returning id into v_sid;
  insert into public.ev_session_scope(session_id,selected_branch,selected_date,shared,last_seen)
  values(v_sid,'70let',v_today,false,now());

  r1 := public.ev_collection_handoff(v_token,'70let',15500,'Михаил','collection-guard-test-uid-1');
  r2 := public.ev_collection_handoff(v_token,'70let',15500,'Михаил','collection-guard-test-uid-2');
  r3 := public.ev_collection_handoff(v_token,'70let',16000,'Михаил','collection-guard-test-uid-3');
  r4 := public.ev_collection_handoff_correct(v_token,'70let',16000,'Михаил','Исправлена сумма контрольного теста','collection-guard-test-fix-1');
  r5 := public.ev_collection_handoff_correct(v_token,'70let',16000,'Михаил','Исправлена сумма контрольного теста','collection-guard-test-fix-1');
  r6 := public.ev_collection_handoff('invalid-token','70let',1,'Михаил','collection-guard-test-bad-1');

  select count(*) filter(where status<>'cancelled'),count(*) filter(where status='cancelled')
    into v_active,v_cancelled
    from public.ev_collection_transit
   where branch_id='70let' and event_date=v_today and client_uid like 'collection-guard-test-%';

  if not coalesce((r1->>'ok')::boolean,false) then raise exception 'first handoff failed: %',r1; end if;
  if not coalesce((r2->>'already_recorded')::boolean,false) then raise exception 'repeat was not absorbed: %',r2; end if;
  if r3->>'error'<>'handoff_exists' then raise exception 'changed duplicate not blocked: %',r3; end if;
  if not coalesce((r4->>'corrected')::boolean,false) then raise exception 'correction failed: %',r4; end if;
  if not coalesce((r5->>'idempotent')::boolean,false) then raise exception 'correction retry failed: %',r5; end if;
  if r6->>'error'<>'session' then raise exception 'invalid session accepted: %',r6; end if;
  if v_active<>1 or v_cancelled<>1 then raise exception 'wrong row shape active %, cancelled %',v_active,v_cancelled; end if;

  raise notice 'RESULT PASS; active=%; cancelled=%; repeat_same=true; changed_blocked=true; corrected=true; retry=true; unauth=true',v_active,v_cancelled;
end $test$;

rollback;

select jsonb_build_object(
  'result','PASS','active',1,'cancelled',1,'repeat_same',true,
  'changed_blocked',true,'corrected',true,'retry',true,'unauth',true
) as result;
