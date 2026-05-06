import { z } from "zod";

export const HANDOFF_TYPES = [
  "ask_human",
  "report_problem",
  "emergency_concern",
  "service_question",
  "ai_refusal_followup",
] as const;

export const HANDOFF_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const handoffTypeEnum = z.enum(HANDOFF_TYPES);
export const handoffPriorityEnum = z.enum(HANDOFF_PRIORITIES);

export const submitHandoffSchema = z.object({
  token: z.string().min(16),
  /** UI button hint — overrides keyword inference unless the message
   *  contains an emergency keyword, which always wins. */
  type: handoffTypeEnum.optional(),
  priority: handoffPriorityEnum.optional(),
  message: z.string().trim().min(1).max(2000),
  preferredContact: z.string().trim().max(200).optional().or(z.literal("")),
});

export type SubmitHandoffInput = z.infer<typeof submitHandoffSchema>;

export const acknowledgeHandoffSchema = z.object({
  id: z.string().uuid(),
});

export const resolveHandoffSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
