-- 0153 · TENANCY-REST-A — give the remaining FINANCE / INVENTORY / PRICING /
-- DIRECT-BOOKING tables a nullable `organization_id` anchor + backfill + index.
--
-- SCHEMA + BACKFILL ONLY. This migration does NOT thread org into any query
-- and (deliberately) does NOT set NOT NULL — the column stays NULLABLE so the
-- app layer can adopt it incrementally without a hard cutover (mirrors the
-- TENANCY convention from 0134 / 0149-0152, minus the SET NOT NULL step).
--
-- Backfill path, per table, follows the REAL parent chain toward an org. The
-- canonical anchors used below:
--   villas    reach org via villas.project_id -> projects.organization_id
--   bookings  carry organization_id directly (set by 0149)
--   vendors   carry organization_id directly (set by 0072)
--   operation_tasks carry organization_id directly (set by 0149)
--   direct_booking_deposits carry organization_id directly (set by 0151)
-- Where a table has no parent chain to an org (global registries, IP-scoped
-- rate-limit rows, platform-wide cron run logs) it falls back to the single
-- ARCONIQUE_DEFAULT seed org (the platform is single-tenant today).
--
-- NOTE: the dev_os_inventory_* tables are intentionally NOT touched here — they
-- already carry organization_id NOT NULL from migration 0072.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, and every
-- UPDATE is guarded by `WHERE organization_id IS NULL`. Safe to re-run.
-- A NULL default org (env with no seed org) simply leaves the trailing rows
-- nullable rather than failing the migration.

-- ===========================================================================
-- asset-types.ts — global registry, no parent -> DEFAULT.
-- ===========================================================================
ALTER TABLE asset_types
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE asset_types
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS asset_types_org_idx ON asset_types(organization_id);

-- ===========================================================================
-- inventory.ts — Management OS inventory + procurement.
--   suppliers / inventory_categories / inventory_items -> DEFAULT (org-global)
--   inventory_locations -> project (else villa->project) -> DEFAULT
--   inventory_stock_levels -> location.org
--   inventory_movements -> from/to location.org, else item.org, else DEFAULT
--   task_material_usage -> operation_tasks.org, else item.org, else DEFAULT
--   purchase_requests / purchase_orders -> project (else villa->project) -> DEFAULT
--   purchase_request_lines / purchase_order_lines -> parent.org
--   inventory_counts -> location.org ; inventory_count_lines -> count.org
-- ===========================================================================
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_locations
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_stock_levels
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE task_material_usage
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE purchase_request_lines
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_count_lines
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- suppliers / categories / items are org-global today -> DEFAULT
UPDATE suppliers
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE inventory_categories
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE inventory_items
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- inventory_locations: project wins, else villa->project, else DEFAULT
UPDATE inventory_locations x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE inventory_locations x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE inventory_locations
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- inventory_stock_levels -> location.org
UPDATE inventory_stock_levels x
   SET organization_id = l.organization_id
  FROM inventory_locations l
 WHERE x.location_id = l.id AND x.organization_id IS NULL AND l.organization_id IS NOT NULL;
UPDATE inventory_stock_levels
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- inventory_movements -> from location, else to location, else item, else DEFAULT
UPDATE inventory_movements x
   SET organization_id = l.organization_id
  FROM inventory_locations l
 WHERE x.from_location_id = l.id AND x.organization_id IS NULL AND l.organization_id IS NOT NULL;
UPDATE inventory_movements x
   SET organization_id = l.organization_id
  FROM inventory_locations l
 WHERE x.to_location_id = l.id AND x.organization_id IS NULL AND l.organization_id IS NOT NULL;
UPDATE inventory_movements x
   SET organization_id = i.organization_id
  FROM inventory_items i
 WHERE x.item_id = i.id AND x.organization_id IS NULL AND i.organization_id IS NOT NULL;
UPDATE inventory_movements
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- task_material_usage -> operation_task.org, else item.org, else DEFAULT
UPDATE task_material_usage x
   SET organization_id = ot.organization_id
  FROM operation_tasks ot
 WHERE x.task_id = ot.id AND x.organization_id IS NULL AND ot.organization_id IS NOT NULL;
UPDATE task_material_usage x
   SET organization_id = i.organization_id
  FROM inventory_items i
 WHERE x.item_id = i.id AND x.organization_id IS NULL AND i.organization_id IS NOT NULL;
UPDATE task_material_usage
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- purchase_requests -> project, else villa->project, else DEFAULT
UPDATE purchase_requests x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE purchase_requests x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE purchase_requests
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- purchase_request_lines -> request.org
UPDATE purchase_request_lines x
   SET organization_id = r.organization_id
  FROM purchase_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE purchase_request_lines
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- purchase_orders -> project, else villa->project, else request.org, else DEFAULT
UPDATE purchase_orders x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE purchase_orders x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE purchase_orders x
   SET organization_id = r.organization_id
  FROM purchase_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE purchase_orders
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- purchase_order_lines -> purchase_order.org
UPDATE purchase_order_lines x
   SET organization_id = po.organization_id
  FROM purchase_orders po
 WHERE x.purchase_order_id = po.id AND x.organization_id IS NULL AND po.organization_id IS NOT NULL;
UPDATE purchase_order_lines
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- inventory_counts -> location.org
UPDATE inventory_counts x
   SET organization_id = l.organization_id
  FROM inventory_locations l
 WHERE x.location_id = l.id AND x.organization_id IS NULL AND l.organization_id IS NOT NULL;
UPDATE inventory_counts
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- inventory_count_lines -> count.org
UPDATE inventory_count_lines x
   SET organization_id = c.organization_id
  FROM inventory_counts c
 WHERE x.count_id = c.id AND x.organization_id IS NULL AND c.organization_id IS NOT NULL;
UPDATE inventory_count_lines
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS suppliers_org_idx ON suppliers(organization_id);
CREATE INDEX IF NOT EXISTS inv_locations_org_idx ON inventory_locations(organization_id);
CREATE INDEX IF NOT EXISTS inv_categories_org_idx ON inventory_categories(organization_id);
CREATE INDEX IF NOT EXISTS inv_items_org_idx ON inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS inv_stock_org_idx ON inventory_stock_levels(organization_id);
CREATE INDEX IF NOT EXISTS inv_movements_org_idx ON inventory_movements(organization_id);
CREATE INDEX IF NOT EXISTS tmu_org_idx ON task_material_usage(organization_id);
CREATE INDEX IF NOT EXISTS pr_org_idx ON purchase_requests(organization_id);
CREATE INDEX IF NOT EXISTS pr_lines_org_idx ON purchase_request_lines(organization_id);
CREATE INDEX IF NOT EXISTS po_org_idx ON purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS po_lines_org_idx ON purchase_order_lines(organization_id);
CREATE INDEX IF NOT EXISTS inv_counts_org_idx ON inventory_counts(organization_id);
CREATE INDEX IF NOT EXISTS inv_count_lines_org_idx ON inventory_count_lines(organization_id);

-- ===========================================================================
-- residual-inventory.ts
--   residual_inventory_units -> project (project_id NOT NULL) -> projects.org
--   residual_unit_ownership_shares -> residual_unit.org
-- ===========================================================================
ALTER TABLE residual_inventory_units
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE residual_unit_ownership_shares
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE residual_inventory_units x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE residual_inventory_units
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE residual_unit_ownership_shares x
   SET organization_id = u.organization_id
  FROM residual_inventory_units u
 WHERE x.residual_unit_id = u.id AND x.organization_id IS NULL AND u.organization_id IS NOT NULL;
UPDATE residual_unit_ownership_shares
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS residual_inventory_units_org_idx ON residual_inventory_units(organization_id);
CREATE INDEX IF NOT EXISTS residual_unit_ownership_shares_org_idx ON residual_unit_ownership_shares(organization_id);

-- ===========================================================================
-- dynamic-pricing.ts
--   pricing_rule_sets -> project (else villa->project) -> DEFAULT
--   the 6 child rule tables -> rule_set.org
--   pricing_quote_logs / channel_push_events -> villa->project (else project) -> DEFAULT
--   villa_rate_overrides -> villa->project (villa_id NOT NULL) -> DEFAULT
-- ===========================================================================
ALTER TABLE pricing_rule_sets
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_day_of_week_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_occupancy_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_close_out_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_channel_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_min_stay_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_stop_sell_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE pricing_quote_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE channel_push_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE villa_rate_overrides
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE pricing_rule_sets x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE pricing_rule_sets x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE pricing_rule_sets
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE pricing_day_of_week_rules x
   SET organization_id = rs.organization_id
  FROM pricing_rule_sets rs
 WHERE x.rule_set_id = rs.id AND x.organization_id IS NULL AND rs.organization_id IS NOT NULL;
UPDATE pricing_occupancy_rules x
   SET organization_id = rs.organization_id
  FROM pricing_rule_sets rs
 WHERE x.rule_set_id = rs.id AND x.organization_id IS NULL AND rs.organization_id IS NOT NULL;
UPDATE pricing_close_out_rules x
   SET organization_id = rs.organization_id
  FROM pricing_rule_sets rs
 WHERE x.rule_set_id = rs.id AND x.organization_id IS NULL AND rs.organization_id IS NOT NULL;
UPDATE pricing_channel_rules x
   SET organization_id = rs.organization_id
  FROM pricing_rule_sets rs
 WHERE x.rule_set_id = rs.id AND x.organization_id IS NULL AND rs.organization_id IS NOT NULL;
UPDATE pricing_min_stay_rules x
   SET organization_id = rs.organization_id
  FROM pricing_rule_sets rs
 WHERE x.rule_set_id = rs.id AND x.organization_id IS NULL AND rs.organization_id IS NOT NULL;
UPDATE pricing_stop_sell_rules x
   SET organization_id = rs.organization_id
  FROM pricing_rule_sets rs
 WHERE x.rule_set_id = rs.id AND x.organization_id IS NULL AND rs.organization_id IS NOT NULL;

UPDATE pricing_quote_logs x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE pricing_quote_logs x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE pricing_quote_logs
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE channel_push_events x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE channel_push_events x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE channel_push_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE villa_rate_overrides x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE villa_rate_overrides
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS pricing_rule_sets_org_idx ON pricing_rule_sets(organization_id);
CREATE INDEX IF NOT EXISTS pricing_dow_rules_org_idx ON pricing_day_of_week_rules(organization_id);
CREATE INDEX IF NOT EXISTS pricing_occupancy_rules_org_idx ON pricing_occupancy_rules(organization_id);
CREATE INDEX IF NOT EXISTS pricing_close_out_rules_org_idx ON pricing_close_out_rules(organization_id);
CREATE INDEX IF NOT EXISTS pricing_channel_rules_org_idx ON pricing_channel_rules(organization_id);
CREATE INDEX IF NOT EXISTS pricing_min_stay_rules_org_idx ON pricing_min_stay_rules(organization_id);
CREATE INDEX IF NOT EXISTS pricing_stop_sell_rules_org_idx ON pricing_stop_sell_rules(organization_id);
CREATE INDEX IF NOT EXISTS pricing_quote_logs_org_idx ON pricing_quote_logs(organization_id);
CREATE INDEX IF NOT EXISTS channel_push_events_org_idx ON channel_push_events(organization_id);
CREATE INDEX IF NOT EXISTS villa_rate_overrides_org_idx ON villa_rate_overrides(organization_id);

-- ===========================================================================
-- pricing.ts
--   rate_plans -> project (else villa->project) -> DEFAULT
--   rate_plan_seasons / rate_plan_overrides -> rate_plan.org
-- ===========================================================================
ALTER TABLE rate_plans
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE rate_plan_seasons
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE rate_plan_overrides
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE rate_plans x
   SET organization_id = p.organization_id
  FROM projects p
 WHERE x.project_id = p.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE rate_plans x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE rate_plans
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE rate_plan_seasons x
   SET organization_id = rp.organization_id
  FROM rate_plans rp
 WHERE x.rate_plan_id = rp.id AND x.organization_id IS NULL AND rp.organization_id IS NOT NULL;
UPDATE rate_plan_overrides x
   SET organization_id = rp.organization_id
  FROM rate_plans rp
 WHERE x.rate_plan_id = rp.id AND x.organization_id IS NULL AND rp.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rate_plans_org_idx ON rate_plans(organization_id);
CREATE INDEX IF NOT EXISTS rate_plan_seasons_org_idx ON rate_plan_seasons(organization_id);
CREATE INDEX IF NOT EXISTS rate_plan_overrides_org_idx ON rate_plan_overrides(organization_id);

-- ===========================================================================
-- vendor-scores.ts -> vendors.organization_id (set by 0072)
-- ===========================================================================
ALTER TABLE vendor_scores
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE vendor_scores x
   SET organization_id = v.organization_id
  FROM vendors v
 WHERE x.vendor_id = v.id AND x.organization_id IS NULL AND v.organization_id IS NOT NULL;
UPDATE vendor_scores
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS vendor_scores_org_idx ON vendor_scores(organization_id);

-- ===========================================================================
-- sla-breaches.ts -> maintenance_ticket -> villa->project (else project) -> DEFAULT
-- ===========================================================================
ALTER TABLE sla_breaches
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE sla_breaches x
   SET organization_id = p.organization_id
  FROM maintenance_tickets mt
  JOIN villas v ON v.id = mt.villa_id
  JOIN projects p ON p.id = v.project_id
 WHERE x.ticket_id = mt.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE sla_breaches x
   SET organization_id = p.organization_id
  FROM maintenance_tickets mt
  JOIN projects p ON p.id = mt.project_id
 WHERE x.ticket_id = mt.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE sla_breaches
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS sla_breaches_org_idx ON sla_breaches(organization_id);

-- ===========================================================================
-- service-fulfilment.ts
--   service_vendors / service_vendor_services -> DEFAULT (vendor registry)
--   guest_service_fulfilments -> order -> booking.org (else villa->project,
--     else project) -> DEFAULT
--   events / tokens / invoices / ratings / finance_links -> fulfilment.org
-- ===========================================================================
ALTER TABLE service_vendors
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE service_vendor_services
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_service_fulfilments
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE service_fulfilment_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE service_vendor_tokens
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE service_vendor_invoices
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_service_ratings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE service_fulfilment_finance_links
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE service_vendors
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE service_vendor_services x
   SET organization_id = sv.organization_id
  FROM service_vendors sv
 WHERE x.vendor_id = sv.id AND x.organization_id IS NULL AND sv.organization_id IS NOT NULL;
UPDATE service_vendor_services
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

-- guest_service_fulfilments -> order -> booking, else villa->project, else project
UPDATE guest_service_fulfilments x
   SET organization_id = b.organization_id
  FROM guest_service_orders o
  JOIN bookings b ON b.id = o.booking_id
 WHERE x.order_id = o.id AND x.organization_id IS NULL AND b.organization_id IS NOT NULL;
UPDATE guest_service_fulfilments x
   SET organization_id = p.organization_id
  FROM guest_service_orders o
  JOIN villas v ON v.id = o.villa_id
  JOIN projects p ON p.id = v.project_id
 WHERE x.order_id = o.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE guest_service_fulfilments x
   SET organization_id = p.organization_id
  FROM guest_service_orders o
  JOIN projects p ON p.id = o.project_id
 WHERE x.order_id = o.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE guest_service_fulfilments
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE service_fulfilment_events x
   SET organization_id = f.organization_id
  FROM guest_service_fulfilments f
 WHERE x.fulfilment_id = f.id AND x.organization_id IS NULL AND f.organization_id IS NOT NULL;
UPDATE service_vendor_tokens x
   SET organization_id = f.organization_id
  FROM guest_service_fulfilments f
 WHERE x.fulfilment_id = f.id AND x.organization_id IS NULL AND f.organization_id IS NOT NULL;
UPDATE service_vendor_invoices x
   SET organization_id = f.organization_id
  FROM guest_service_fulfilments f
 WHERE x.fulfilment_id = f.id AND x.organization_id IS NULL AND f.organization_id IS NOT NULL;
UPDATE guest_service_ratings x
   SET organization_id = f.organization_id
  FROM guest_service_fulfilments f
 WHERE x.fulfilment_id = f.id AND x.organization_id IS NULL AND f.organization_id IS NOT NULL;
UPDATE service_fulfilment_finance_links x
   SET organization_id = f.organization_id
  FROM guest_service_fulfilments f
 WHERE x.fulfilment_id = f.id AND x.organization_id IS NULL AND f.organization_id IS NOT NULL;

-- any child still null (fulfilment unresolved) -> DEFAULT
UPDATE service_fulfilment_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE service_vendor_tokens
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE service_vendor_invoices
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE guest_service_ratings
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE service_fulfilment_finance_links
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS service_vendors_org_idx ON service_vendors(organization_id);
CREATE INDEX IF NOT EXISTS service_vendor_services_org_idx ON service_vendor_services(organization_id);
CREATE INDEX IF NOT EXISTS guest_service_fulfilments_org_idx ON guest_service_fulfilments(organization_id);
CREATE INDEX IF NOT EXISTS service_fulfilment_events_org_idx ON service_fulfilment_events(organization_id);
CREATE INDEX IF NOT EXISTS service_vendor_tokens_org_idx ON service_vendor_tokens(organization_id);
CREATE INDEX IF NOT EXISTS service_vendor_invoices_org_idx ON service_vendor_invoices(organization_id);
CREATE INDEX IF NOT EXISTS guest_service_ratings_org_idx ON guest_service_ratings(organization_id);
CREATE INDEX IF NOT EXISTS service_fulfilment_finance_links_org_idx ON service_fulfilment_finance_links(organization_id);

-- ===========================================================================
-- direct-booking.ts
--   holds -> villa->project (villa_id NOT NULL) -> DEFAULT
--   requests -> hold.org (else villa->project) -> DEFAULT
--   request_events -> request.org
--   hold_rate_limits (IP-scoped) / expiry_runs (cron log) -> DEFAULT
-- ===========================================================================
ALTER TABLE direct_booking_holds
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_request_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_hold_rate_limits
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_expiry_runs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE direct_booking_holds x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE direct_booking_holds
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE direct_booking_requests x
   SET organization_id = h.organization_id
  FROM direct_booking_holds h
 WHERE x.hold_id = h.id AND x.organization_id IS NULL AND h.organization_id IS NOT NULL;
UPDATE direct_booking_requests x
   SET organization_id = p.organization_id
  FROM villas v JOIN projects p ON p.id = v.project_id
 WHERE x.villa_id = v.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE direct_booking_requests
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE direct_booking_request_events x
   SET organization_id = r.organization_id
  FROM direct_booking_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE direct_booking_request_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE direct_booking_hold_rate_limits
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE direct_booking_expiry_runs
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS direct_booking_holds_org_idx ON direct_booking_holds(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_requests_org_idx ON direct_booking_requests(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_request_events_org_idx ON direct_booking_request_events(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_hold_rate_limits_org_idx ON direct_booking_hold_rate_limits(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_expiry_runs_org_idx ON direct_booking_expiry_runs(organization_id);

-- ===========================================================================
-- direct-booking-finance.ts
--   finance_links -> request.org (else hold.org, else deposit.org) -> DEFAULT
-- ===========================================================================
ALTER TABLE direct_booking_finance_links
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE direct_booking_finance_links x
   SET organization_id = r.organization_id
  FROM direct_booking_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE direct_booking_finance_links x
   SET organization_id = h.organization_id
  FROM direct_booking_holds h
 WHERE x.hold_id = h.id AND x.organization_id IS NULL AND h.organization_id IS NOT NULL;
UPDATE direct_booking_finance_links x
   SET organization_id = d.organization_id
  FROM direct_booking_deposits d
 WHERE x.deposit_id = d.id AND x.organization_id IS NULL AND d.organization_id IS NOT NULL;
UPDATE direct_booking_finance_links
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS direct_booking_finance_links_org_idx ON direct_booking_finance_links(organization_id);

-- ===========================================================================
-- direct-booking-guest.ts (token-scoped guest center)
--   each row links to hold / request / deposit -> inherit the first available;
--   messages -> thread.org ; remaining -> DEFAULT
-- ===========================================================================
ALTER TABLE direct_booking_guest_notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_guest_status_snapshots
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_guest_message_threads
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_guest_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE direct_booking_guest_notifications x
   SET organization_id = h.organization_id
  FROM direct_booking_holds h
 WHERE x.hold_id = h.id AND x.organization_id IS NULL AND h.organization_id IS NOT NULL;
UPDATE direct_booking_guest_notifications x
   SET organization_id = r.organization_id
  FROM direct_booking_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE direct_booking_guest_notifications x
   SET organization_id = d.organization_id
  FROM direct_booking_deposits d
 WHERE x.deposit_id = d.id AND x.organization_id IS NULL AND d.organization_id IS NOT NULL;
UPDATE direct_booking_guest_notifications
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE direct_booking_guest_status_snapshots x
   SET organization_id = h.organization_id
  FROM direct_booking_holds h
 WHERE x.hold_id = h.id AND x.organization_id IS NULL AND h.organization_id IS NOT NULL;
UPDATE direct_booking_guest_status_snapshots x
   SET organization_id = r.organization_id
  FROM direct_booking_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE direct_booking_guest_status_snapshots
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE direct_booking_guest_message_threads x
   SET organization_id = h.organization_id
  FROM direct_booking_holds h
 WHERE x.hold_id = h.id AND x.organization_id IS NULL AND h.organization_id IS NOT NULL;
UPDATE direct_booking_guest_message_threads x
   SET organization_id = r.organization_id
  FROM direct_booking_requests r
 WHERE x.request_id = r.id AND x.organization_id IS NULL AND r.organization_id IS NOT NULL;
UPDATE direct_booking_guest_message_threads
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE direct_booking_guest_messages x
   SET organization_id = t.organization_id
  FROM direct_booking_guest_message_threads t
 WHERE x.thread_id = t.id AND x.organization_id IS NULL AND t.organization_id IS NOT NULL;
UPDATE direct_booking_guest_messages
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS direct_booking_guest_notifications_org_idx ON direct_booking_guest_notifications(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_guest_status_snapshots_org_idx ON direct_booking_guest_status_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_guest_message_threads_org_idx ON direct_booking_guest_message_threads(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_guest_messages_org_idx ON direct_booking_guest_messages(organization_id);

-- ===========================================================================
-- contract-signatures.ts -> contract_group -> project -> projects.org
--   (contract_groups.project_id is NOT NULL) ; else DEFAULT
-- ===========================================================================
ALTER TABLE contract_signatures
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
UPDATE contract_signatures x
   SET organization_id = p.organization_id
  FROM contract_groups cg
  JOIN projects p ON p.id = cg.project_id
 WHERE x.contract_group_id = cg.id AND x.organization_id IS NULL AND p.organization_id IS NOT NULL;
UPDATE contract_signatures
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
CREATE INDEX IF NOT EXISTS contract_signatures_org_idx ON contract_signatures(organization_id);
