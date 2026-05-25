import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P2 — tool registry barrel.
 *
 * Importing this module triggers each per-agent tool module to
 * register its factories with the registry singleton. Inference code
 * imports this once at the top so `getToolsForAgent` returns the
 * full set.
 */

// Mgmt OS — Daily Digest tools
import "./mgmt-os/bookings";
import "./mgmt-os/finance";
import "./mgmt-os/operations";

// Dev OS — Daily Digest tools (P3).
import "./dev-os/site-reports";
import "./dev-os/expenses";
import "./dev-os/milestones";

export {
  registerToolFactory,
  getToolsForAgent,
  listRegisteredToolNames,
  type AgentExecutionContext,
  type AgentToolFactory,
} from "./registry";
