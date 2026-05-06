/**
 * Pure (non-server) shapes for the Sales workspace.
 *
 * Lives outside `src/lib/development/server/*` so client components can
 * import them without dragging the `import "server-only"` guard into the
 * client bundle. Server-side query functions return these shapes; client
 * components receive them as serializable props.
 *
 * Rule of thumb: if a client component needs to type a prop, the type
 * must come from this file (or another module that does NOT import
 * `server-only`).
 */

export interface LeadListItem {
  roleId: string;
  contactId: string;
  fullName: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  preferredCommunicationChannel: string | null;
  preferredLanguage: string;
  countryOfResidence: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  scopeProjectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  unitTypeName: string | null;
  acquisitionSource: string | null;
  sourceCode: string | null;
  agentDisplayName: string | null;
  notes: string | null;
}

export interface LeadFilters {
  projectId?: string;
  status?: string;
  sourceCategory?: string;
  agentId?: string;
}

export interface LeadPipelineMetrics {
  total: number;
  newThisWeek: number;
  qualified: number;
  inNegotiation: number;
  convertedMtd: number;
  lostMtd: number;
}

export interface InteractionListItem {
  id: string;
  contactId: string;
  projectId: string | null;
  interactionType: string;
  direction: string;
  occurredAt: string;
  durationSeconds: number | null;
  subject: string | null;
  body: string | null;
  aiSummary: string | null;
  aiSentiment: string | null;
  aiActionItems: unknown;
  aiGeneratedAt: string | null;
  aiModel: string | null;
  reviewStatus: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  followUpRequired: boolean;
  followUpDueAt: string | null;
  followUpCompleted: boolean;
}
