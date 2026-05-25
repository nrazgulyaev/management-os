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

// Dev OS tools land in Phase 3.

export {
  registerToolFactory,
  getToolsForAgent,
  listRegisteredToolNames,
  type AgentExecutionContext,
  type AgentToolFactory,
} from "./registry";
