import { z } from "zod";

const SECTION_KEYS = [
  "check_in",
  "wifi",
  "house_rules",
  "appliances",
  "amenities",
  "neighborhood",
  "transport",
  "emergency",
  "offline_pdf",
  "general",
] as const;

const CONTACT_TYPES = [
  "manager",
  "concierge",
  "emergency",
  "hospital",
  "police",
  "fire",
  "security",
  "maintenance",
  "driver",
  "other",
] as const;

const PLACE_CATEGORIES = [
  "restaurant",
  "cafe",
  "beach",
  "gym",
  "spa",
  "supermarket",
  "pharmacy",
  "hospital",
  "attraction",
  "nightlife",
  "coworking",
  "transport",
  "other",
] as const;

export const upsertGuideSectionSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  sectionKey: z.enum(SECTION_KEYS),
  title: z.string().min(2).max(160),
  bodyMd: z.string().max(8000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  guestVisible: z.boolean().optional().default(true),
});

export const upsertWifiSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  networkName: z.string().min(1).max(160),
  displayPassword: z.string().max(160).optional().nullable(),
  instructionsMd: z.string().max(2000).optional().nullable(),
});

export const upsertEmergencyContactSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  label: z.string().min(2).max(160),
  contactType: z.enum(CONTACT_TYPES),
  phone: z.string().max(40).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notesMd: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  guestVisible: z.boolean().optional().default(true),
});

export const upsertNeighborhoodPlaceSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  villaId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(160),
  category: z.enum(PLACE_CATEGORIES),
  descriptionMd: z.string().max(2000).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  googleMapsUrl: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
  distanceLabel: z.string().max(80).optional().nullable(),
  travelTimeLabel: z.string().max(80).optional().nullable(),
  imageUrl: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  guestVisible: z.boolean().optional().default(true),
});

export const idSchema = z.object({ id: z.string().uuid() });
