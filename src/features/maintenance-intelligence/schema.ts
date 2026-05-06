import { z } from "zod";

const isoDate = z.string().min(8);

const FREQUENCIES = [
  "daily",
  "twice_weekly",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const;

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const DISRUPTION = ["none", "low", "medium", "high"] as const;
const CATEGORIES = [
  "ac",
  "pool",
  "pest_control",
  "garden",
  "pump",
  "water_system",
  "electrical",
  "smart_lock",
  "wifi",
  "roof",
  "drainage",
  "fire_safety",
  "general",
] as const;

export const createMaintenanceTemplateSchema = z.object({
  key: z.string().min(2).max(80),
  name: z.string().min(2).max(160),
  category: z.enum(CATEGORIES),
  defaultFrequency: z.enum(FREQUENCIES).default("monthly"),
  defaultIntervalDays: z.number().int().min(1).max(3650).optional().nullable(),
  defaultDurationMinutes: z.number().int().min(5).max(24 * 60).default(60),
  defaultPriority: z.enum(PRIORITIES).default("normal"),
  canBeDoneWhileOccupied: z.boolean().optional().default(true),
  guestDisruptionLevel: z.enum(DISRUPTION).default("low"),
  requiresVillaEmpty: z.boolean().optional().default(false),
  requiresOwnerVisibility: z.boolean().optional().default(false),
  checklistTemplateId: z.string().uuid().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export const createVillaMaintenancePlanSchema = z.object({
  villaId: z.string().uuid(),
  templateId: z.string().uuid(),
  planName: z.string().min(2).max(160),
  frequency: z.enum(FREQUENCIES),
  intervalDays: z.number().int().min(1).max(3650).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(24 * 60).default(60),
  priority: z.enum(PRIORITIES).default("normal"),
  canBeDoneWhileOccupied: z.boolean().optional().default(true),
  guestDisruptionLevel: z.enum(DISRUPTION).default("low"),
  requiresVillaEmpty: z.boolean().optional().default(false),
});

export const planIdSchema = z.object({ id: z.string().uuid() });

export const suggestWindowsSchema = z.object({
  planId: z.string().uuid(),
  horizonDays: z.number().int().min(1).max(60).default(14),
});

export const acceptSuggestionSchema = z.object({
  id: z.string().uuid(),
});

export const generateTaskFromPlanSchema = z.object({
  planId: z.string().uuid(),
  suggestedStart: isoDate.optional().nullable(),
});

export const acknowledgeRiskSchema = z.object({ id: z.string().uuid() });
export const resolveRiskSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
});
