export type ProjectStatusValue =
  | "planning"
  | "under_construction"
  | "active"
  | "managed"
  | "archived";

export type ProjectManagementStatusValue =
  | "lead"
  | "onboarding"
  | "managed"
  | "paused"
  | "exited";

export interface ProjectListItem {
  id: string;
  slug: string;
  name: string;
  location: string;
  area: string | null;
  status: ProjectStatusValue;
  managementStatus: ProjectManagementStatusValue;
  totalVillas: number | null;
  concept: string | null;
  description: string | null;
}

export interface ProjectDetail extends ProjectListItem {
  targetHandoverDate: string | null;
  leaseholdUntil: string | null;
  heroImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
