REVOKE ALL ON FUNCTION public.match_ges_vault_jhs(vector, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_ges_vault_jhs(vector, text, text, text, integer) TO authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
