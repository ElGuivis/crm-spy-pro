\echo '========== 1. CRON JOBS HEALTH (last 24h) =========='
SELECT
  j.jobname,
  j.schedule,
  j.active,
  COUNT(*) FILTER (WHERE r.status = 'succeeded') AS succeeded_24h,
  COUNT(*) FILTER (WHERE r.status = 'failed') AS failed_24h,
  MAX(r.end_time) FILTER (WHERE r.status = 'succeeded') AS last_success,
  MAX(r.end_time) FILTER (WHERE r.status = 'failed') AS last_failure
FROM cron.job j
LEFT JOIN cron.job_run_details r
  ON r.jobid = j.jobid AND r.start_time > NOW() - INTERVAL '24 hours'
WHERE j.active = true
GROUP BY j.jobid, j.jobname, j.schedule, j.active
ORDER BY failed_24h DESC NULLS LAST, j.jobname;

\echo ''
\echo '========== 2. PUBLIC TABLES WITHOUT RLS =========='
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

\echo ''
\echo '========== 3. STUCK LI SYNC STATE (offset > 0, updated > 10min ago) =========='
SELECT integration_id, entity_type, last_offset, total_count, updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at))::int AS seconds_ago
FROM li_sync_state
WHERE last_offset > 0
  AND updated_at < NOW() - INTERVAL '10 minutes'
ORDER BY updated_at;

\echo ''
\echo '========== 4. FAILED/STUCK ME SYNC JOBS (last 7 days) =========='
SELECT id, tenant_id, status, current_page, items_total, items_saved, error_message, updated_at
FROM me_sync_jobs
WHERE updated_at > NOW() - INTERVAL '7 days'
  AND status IN ('failed', 'running', 'pending')
ORDER BY updated_at DESC
LIMIT 20;

\echo ''
\echo '========== 5. FAILED/STUCK BLING SYNC JOBS (last 7 days) =========='
SELECT id, tenant_id, job_type, status, total_count, saved_count, error_message, updated_at
FROM bling_sync_jobs
WHERE updated_at > NOW() - INTERVAL '7 days'
  AND status IN ('failed', 'running', 'pending')
ORDER BY updated_at DESC
LIMIT 20;

\echo ''
\echo '========== 6. SECURITY DEFINER FUNCTIONS WITHOUT search_path =========='
SELECT n.nspname AS schema, p.proname AS function,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY p.proname;

\echo ''
\echo '========== 7. REALTIME PUBLICATION COVERAGE =========='
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

\echo ''
\echo '========== 8. STORAGE BUCKETS + POLICIES SUMMARY =========='
SELECT b.id AS bucket, b.public,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
   AND qual LIKE '%' || b.id || '%') AS policy_count
FROM storage.buckets b
ORDER BY b.id;

\echo ''
\echo '========== 9. ORPHAN CONVERSATIONS (no contact_id) =========='
SELECT COUNT(*) AS count FROM conversations WHERE contact_id IS NULL;

\echo ''
\echo '========== 10. INTEGRATIONS STATUS BY TYPE =========='
SELECT type, status, COUNT(*) AS count
FROM integrations
GROUP BY type, status
ORDER BY type, status;

\echo ''
\echo '========== 11. TENANTS COUNT + RECENT ACTIVITY =========='
SELECT
  (SELECT COUNT(*) FROM tenants) AS tenants_total,
  (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at > NOW() - INTERVAL '30 days') AS users_active_30d;

\echo ''
\echo '========== 12. EDGE FUNCTION SLOTS REMAINING =========='
\echo '(roda manualmente: gh api OR supabase functions list — limite e 100 no plano atual)'

\echo ''
\echo '========== 13. TABLES WITH PERMISSIVE POLICIES (qual = true) =========='
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND qual::text = 'true'
ORDER BY tablename, policyname;
