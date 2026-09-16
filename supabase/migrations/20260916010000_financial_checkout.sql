-- Existing KV and existing subscriptions; no new database or order table.
-- Service-only CAS makes order + ledger + entitlement a single transaction.
ALTER TABLE public.kv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_private ON public.kv;
CREATE POLICY financial_private ON public.kv AS RESTRICTIVE FOR ALL TO anon, authenticated
 USING (lower(key) NOT LIKE 'finance:%' AND lower(key) <> 'marketplace:subscriptions')
 WITH CHECK (lower(key) NOT LIKE 'finance:%' AND lower(key) <> 'marketplace:subscriptions');
CREATE OR REPLACE FUNCTION public.financial_state(p_expected integer DEFAULT NULL, p_value jsonb DEFAULT NULL, p_subscription jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s jsonb; subs jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('finance:state',0));
 SELECT value::jsonb INTO s FROM public.kv WHERE key='finance:state' FOR UPDATE;
 s := coalesce(s,'{"version":0,"orders":[],"ledger":[]}'::jsonb);
 IF p_value IS NULL THEN RETURN s; END IF;
 IF (s->>'version')::integer IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
 IF octet_length(p_value::text)>2000000 OR (p_value->>'version')::integer <> p_expected+1 THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF p_subscription IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('marketplace:subscriptions',0));
   SELECT value::jsonb INTO subs FROM public.kv WHERE key='marketplace:subscriptions' FOR UPDATE;
   SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO subs FROM jsonb_array_elements(coalesce(subs,'[]'::jsonb)) x
     WHERE x->>'id' IS DISTINCT FROM p_subscription->>'id';
   subs := subs || jsonb_build_array(p_subscription);
   INSERT INTO public.kv(key,value) VALUES('marketplace:subscriptions',subs::text)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 END IF;
 INSERT INTO public.kv(key,value) VALUES('finance:state',p_value::text)
   ON CONFLICT(key) DO UPDATE SET value=excluded.value;
 RETURN p_value;
END $$;
REVOKE ALL ON FUNCTION public.financial_state(integer,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_state(integer,jsonb,jsonb) TO service_role;

-- Preserve Financial Cloud entitlements during legacy billing list writes.
CREATE OR REPLACE FUNCTION public.financial_legacy_subscriptions(p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_subs jsonb; merged jsonb;
BEGIN
 IF jsonb_typeof(p_value) <> 'array' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('marketplace:subscriptions',0));
 SELECT value::jsonb INTO current_subs FROM public.kv WHERE key='marketplace:subscriptions' FOR UPDATE;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO merged
 FROM jsonb_array_elements(coalesce(current_subs,'[]'::jsonb)) x WHERE x ? 'paymentOrderId';
 SELECT merged || coalesce(jsonb_agg(x),'[]'::jsonb) INTO merged
 FROM jsonb_array_elements(p_value) x
 WHERE NOT (x ? 'paymentOrderId') AND coalesce(x->>'id','') NOT LIKE 'financial_%';
 INSERT INTO public.kv(key,value) VALUES('marketplace:subscriptions',merged::text)
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
END $$;
REVOKE ALL ON FUNCTION public.financial_legacy_subscriptions(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_legacy_subscriptions(jsonb) TO service_role;

