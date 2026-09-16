-- Existing KV, no new database or queue. Apply before enabling Cloud Intelligence.
-- Restrictive policy also covers installations with permissive legacy policies.
ALTER TABLE public.kv ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS intelligence_private ON public.kv;
CREATE POLICY intelligence_private ON public.kv AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (lower(key) NOT LIKE 'intelligence:%')
  WITH CHECK (lower(key) NOT LIKE 'intelligence:%');

CREATE OR REPLACE FUNCTION public.intelligence_state(p_owner text, p_expected integer DEFAULT NULL, p_value jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE k text := 'intelligence:' || p_owner; current_state jsonb;
BEGIN
  IF p_owner IS NULL OR length(p_owner) > 80 OR p_owner !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'INVALID_OWNER';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(k, 0));
  SELECT value::jsonb INTO current_state FROM public.kv WHERE key = k;
  current_state := coalesce(current_state, '{"version":0,"memory":{},"jobs":[],"quota":{}}'::jsonb);
  IF p_value IS NULL THEN RETURN current_state; END IF;
  IF p_expected IS DISTINCT FROM (current_state->>'version')::integer THEN
    RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;
  IF octet_length(p_value::text) > 200000 OR (p_value->>'version')::integer <> p_expected + 1 THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  INSERT INTO public.kv(key, value) VALUES(k, p_value::text)
    ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value;
  RETURN p_value;
END $$;
REVOKE ALL ON FUNCTION public.intelligence_state(text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intelligence_state(text, integer, jsonb) TO service_role;
