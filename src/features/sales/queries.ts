/**
 * Phase 2.4 dev-02 — Sales cabinet data fns.
 *
 * Surfaces:
 *   getPipelineLanes / getPipelineCards   — kanban
 *   transitionLead(cardId, to, opts)      — drag → stage_events write
 *   getBuyer(id) / getContract(id)
 *   getFunnelStages()
 *
 * Today stubbed.
 */

import "server-only";
import type { PipelineLane, PipelineCard } from "@/components/sales/pipeline-board";
import type { FunnelStage } from "@/components/sales/funnel-chart";
import type { SalesStage } from "@/features/sales/stage-machine";

export async function getPipelineLanes(_input: { projectId: string }): Promise<PipelineLane[]> {
  return [];
}

export async function getPipelineCards(_input: { projectId: string }): Promise<PipelineCard[]> {
  return [];
}

export interface TransitionLeadInput {
  cardId: string;
  to: SalesStage;
  position: number;
  actorUserId: string;
  note?: string;
}

export async function transitionLead(_input: TransitionLeadInput): Promise<{ ok: boolean; eventId: string }> {
  return { ok: true, eventId: "stub" };
}

export async function getFunnelStages(_input: { projectId: string }): Promise<FunnelStage[]> {
  return [];
}
