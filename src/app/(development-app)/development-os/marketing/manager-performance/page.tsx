import { permanentRedirect } from "next/navigation";

/**
 * Legacy route — the manager-performance snapshot table was rebuilt as
 * the per-rep scoreboard at /development-os/marketing/performance (mock
 * cabinets/new/dev-marketing.html §02 variant C). Kept as a redirect so
 * the existing sidebar nav entries and bookmarks keep working.
 */
export const dynamic = "force-dynamic";

export default function LegacyManagerPerformancePage() {
  permanentRedirect("/development-os/marketing/performance");
}
