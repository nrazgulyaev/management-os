-- =============================================================================
-- Development OS · Stage 5.J demo seed
--
-- Seeds a sample second tenant (`SAMPLE_DEV_CLIENT`) plus illustrative
-- API keys, webhook subscriptions, and a small history of usage_metrics
-- snapshots for both ARCONIQUE_DEFAULT and the new tenant. The intent is
-- to demo the Platform UI pages with non-trivial data.
--
-- Idempotent: every INSERT is guarded with ON CONFLICT DO NOTHING or a
-- WHERE NOT EXISTS clause so the file can be re-applied safely.
--
-- Note: API keys are seeded with deterministic SHA-256 hashes derived
-- from short, well-known plaintext strings. They are FOR LOCAL DEMO USE
-- ONLY — production deployments must rotate them via createApiKey().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sample second organization (developer client)
-- -----------------------------------------------------------------------------
INSERT INTO organizations (
  id, organization_code, name, display_name, organization_type,
  country_code, primary_currency, primary_language, timezone,
  subscription_tier, subscription_started_at,
  enabled_modules, max_users, max_projects, is_active
) VALUES (
  'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'SAMPLE_DEV_CLIENT',
  'Sample Developer Client',
  'Sample Developer Co.',
  'developer_client',
  'ID', 'IDR', 'en', 'Asia/Makassar',
  'professional', CURRENT_DATE,
  '["projects","finance","investors","ai_agents","reporting"]'::jsonb,
  10, 5, true
)
ON CONFLICT (organization_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Branding example for the sample tenant
-- -----------------------------------------------------------------------------
UPDATE organizations
   SET branding_config = '{"primaryColor":"#0F62FE","accentColor":"#16A34A","logoUrl":"/branding/sample-dev-client/logo.svg"}'::jsonb
 WHERE organization_code = 'SAMPLE_DEV_CLIENT'
   AND branding_config = '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- Sample API keys for ARCONIQUE_DEFAULT (one read-only, one full-scope)
-- The hashes correspond to plaintexts:
--   ak_test_demo_readonly_internal_use_only_aaaaaaaaaa
--   ak_test_demo_writeable_internal_use_only_bbbbbbbbb
-- Seeded for the bootstrap admin user if one exists; otherwise skipped.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  default_org_id UUID;
  bootstrap_user UUID;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT';
  SELECT id INTO bootstrap_user
    FROM app_users
   ORDER BY created_at ASC
   LIMIT 1;

  IF default_org_id IS NULL OR bootstrap_user IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO api_keys (
    organization_id, key_label, key_prefix, key_hash, key_last_4,
    key_type, scopes, rate_limit_per_minute, rate_limit_per_hour,
    rate_limit_per_day, is_active, created_by, notes
  ) VALUES (
    default_org_id,
    'Demo · read-only',
    'ak_test',
    encode(digest('ak_test_demo_readonly_internal_use_only_aaaaaaaaaa', 'sha256'), 'hex'),
    'aaaa',
    'test',
    ARRAY['projects:read','investors:read','leads:read','transactions:read'],
    60, 1000, 10000, true, bootstrap_user,
    'Demo seed — local use only. Rotate before any external sharing.'
  )
  ON CONFLICT (key_hash) DO NOTHING;

  INSERT INTO api_keys (
    organization_id, key_label, key_prefix, key_hash, key_last_4,
    key_type, scopes, rate_limit_per_minute, rate_limit_per_hour,
    rate_limit_per_day, is_active, created_by, notes
  ) VALUES (
    default_org_id,
    'Demo · writeable',
    'ak_test',
    encode(digest('ak_test_demo_writeable_internal_use_only_bbbbbbbbb', 'sha256'), 'hex'),
    'bbbb',
    'test',
    ARRAY['*'],
    60, 1000, 10000, true, bootstrap_user,
    'Demo seed — full-scope key for testing POST endpoints + webhook test fire.'
  )
  ON CONFLICT (key_hash) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- Sample webhook subscription pointing at a public test endpoint
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT';
  IF default_org_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM webhook_subscriptions
     WHERE organization_id = default_org_id
       AND webhook_label = 'Demo · webhook.site sink'
  ) THEN
    INSERT INTO webhook_subscriptions (
      organization_id, webhook_label, endpoint_url, signing_secret,
      subscribed_events, is_active, notes
    ) VALUES (
      default_org_id,
      'Demo · webhook.site sink',
      'https://webhook.site/demo-sink-replace-me',
      'whsec_demo_seed_replace_immediately_in_production_xxxxxxxxxxxx',
      ARRAY['lead.*','project.*','transaction.created','test.ping'],
      true,
      'Demo seed. Replace endpoint with your own webhook.site URL to receive deliveries.'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Two daily usage_metrics snapshots per active org for the last 7 days
-- so the Platform > Usage page renders with content.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  org RECORD;
  d INT;
  snapshot_date DATE;
BEGIN
  FOR org IN
    SELECT id, organization_code FROM organizations WHERE is_active = true
  LOOP
    FOR d IN 0..6 LOOP
      snapshot_date := CURRENT_DATE - d;
      INSERT INTO usage_metrics (
        organization_id, metric_period_start, metric_period_end, metric_type,
        active_users_count, active_projects_count, total_transactions_count,
        total_invoices_count, total_documents_uploaded,
        ai_invocations_count, ai_tokens_consumed, ai_cost_minor,
        api_requests_count, api_rate_limited_count,
        webhooks_dispatched_count, webhooks_failed_count,
        push_notifications_dispatched
      ) VALUES (
        org.id, snapshot_date, snapshot_date, 'daily_summary',
        CASE WHEN org.organization_code = 'ARCONIQUE_DEFAULT' THEN 12 ELSE 4 END,
        CASE WHEN org.organization_code = 'ARCONIQUE_DEFAULT' THEN 3 ELSE 1 END,
        15 + d * 2,
        4 + d,
        20,
        80 + d * 5,
        (200000 + d * 5000)::bigint,
        (1500 + d * 50)::bigint,
        300 + d * 20,
        d,
        12,
        CASE WHEN d = 3 THEN 1 ELSE 0 END,
        25
      )
      ON CONFLICT (organization_id, metric_period_start, metric_period_end, metric_type)
      DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
