import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { organizations } from "./saas";

/**
 * Background-job foundation. See ADR-0009.
 *   - `job_definitions` holds the catalog (key, cron expression, config).
 *   - `job_runs` is one row per execution (manual or cron).
 *   - `job_run_events` is the append-only log per run.
 */

export const jobDefinitions = pgTable(
  "job_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (job catalog is platform-global).
    // Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    jobType: text("job_type").notNull(),
    scheduleCron: text("schedule_cron"),
    enabled: boolean("enabled").notNull().default(true),
    timeoutSeconds: integer("timeout_seconds").notNull().default(300),
    maxRetries: integer("max_retries").notNull().default(2),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_def_enabled_idx").on(t.enabled),
    index("job_def_type_idx").on(t.jobType),
    index("job_def_org_idx").on(t.organizationId),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (runs are platform-global today).
    // Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    jobDefinitionId: uuid("job_definition_id").references(() => jobDefinitions.id, {
      onDelete: "set null",
    }),
    jobKey: text("job_key").notNull(),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    attempted: integer("attempted").notNull().default(1),
    resultSummary: text("result_summary"),
    metrics: jsonb("metrics"),
    errorMessage: text("error_message"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_runs_key_idx").on(t.jobKey),
    index("job_runs_status_idx").on(t.status),
    index("job_runs_started_idx").on(t.startedAt),
    index("job_runs_definition_idx").on(t.jobDefinitionId),
    index("job_runs_org_idx").on(t.organizationId),
  ],
);

export const jobRunEvents = pgTable(
  "job_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via job_runs.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    jobRunId: uuid("job_run_id")
      .notNull()
      .references(() => jobRuns.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_run_events_run_idx").on(t.jobRunId),
    index("job_run_events_level_idx").on(t.level),
    index("job_run_events_org_idx").on(t.organizationId),
  ],
);

export type JobDefinition = typeof jobDefinitions.$inferSelect;
export type NewJobDefinition = typeof jobDefinitions.$inferInsert;
export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;
export type JobRunEvent = typeof jobRunEvents.$inferSelect;
