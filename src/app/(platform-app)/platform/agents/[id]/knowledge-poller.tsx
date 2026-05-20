"use client";

/**
 * P5.4.POLISH.3 AGENT-KB-POLLER — soft polling for in-flight doc
 * processing.
 *
 * The upload server action now spawns processDocument() as a
 * fire-and-forget promise. The user sees status='pending' immediately
 * and we drive the transition to 'chunking' → 'embedding' → 'ready'
 * by polling the page on a 2.5-second cadence whenever ANY visible
 * document is still in-flight.
 *
 * Implementation: `router.refresh()` re-runs the parent server
 * component, which re-reads `agent_knowledge_documents`. Status badges
 * update without a full reload. We stop polling as soon as no doc
 * is in-flight, so the page goes silent on a settled list.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 2500;
const IN_FLIGHT_STATUSES = new Set(["pending", "chunking", "embedding"]);

export function KnowledgePoller({ statuses }: { statuses: string[] }) {
  const router = useRouter();
  const inFlight = statuses.some((s) => IN_FLIGHT_STATUSES.has(s));

  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [inFlight, router]);

  return null;
}
