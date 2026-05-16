/**
 * Stage 10.B — Design system primitives barrel.
 *
 * Re-exports every Stage 10 primitive for ergonomic imports from
 * role-specific phases (10.C-10.K).
 *
 * Usage:
 *   import { KanbanBoard, MobileTaskCard, DashboardKpi } from "@/components/ui/primitives";
 *
 * 12 primitives total, surfaced from research-summary.md:
 *   - Presentational: DashboardKpi, Timeline, RfqMatrix
 *   - Interactive: KanbanBoard, SpreadsheetView, UnifiedInbox, DrillDownPanel
 *   - Field / mobile: MobileTaskCard, PhotoCapture, VoiceNote, GeoCheckIn
 *   - Specialized: DrawingViewer
 */

export { DashboardKpi } from "./dashboard-kpi";
export type {
  DashboardKpiProps,
  KpiStatus,
  KpiVariant,
  KpiTone,
} from "./dashboard-kpi";

export { Timeline } from "./timeline";
export type { TimelineProps, TimelineStage, TimelineStageStatus } from "./timeline";

export { DrillDownPanel } from "./drill-down-panel";
export type { DrillDownPanelProps } from "./drill-down-panel";

export { RfqMatrix } from "./rfq-matrix";
export type { RfqMatrixProps, RfqLineItem, RfqVendorQuote } from "./rfq-matrix";

export { KanbanBoard } from "./kanban-board";
export type { KanbanBoardProps, KanbanColumn, KanbanCard } from "./kanban-board";

export { SpreadsheetView } from "./spreadsheet-view";
export type {
  SpreadsheetViewProps,
  SpreadsheetColumn,
  CellValue,
} from "./spreadsheet-view";

export { UnifiedInbox } from "./unified-inbox";
export type {
  UnifiedInboxProps,
  InboxThread,
  InboxMessage,
  InboxChannel,
} from "./unified-inbox";

export { MobileTaskCard } from "./mobile-task-card";
export type { MobileTaskCardProps, MobileTaskStatus } from "./mobile-task-card";

export { PhotoCapture } from "./photo-capture";
export type { PhotoCaptureProps, CapturedPhoto } from "./photo-capture";

export { VoiceNote } from "./voice-note";
export type { VoiceNoteProps, VoiceNoteData } from "./voice-note";

export { GeoCheckIn } from "./geo-check-in";
export type { GeoCheckInProps, GeoFix } from "./geo-check-in";

export { DrawingViewer } from "./drawing-viewer";
export type {
  DrawingViewerProps,
  DrawingStroke,
  DrawingPoint,
  ScaleCalibration,
  StrokeKind,
} from "./drawing-viewer";

// Stage 10.D — universal CRUD + cleanup primitives
// (added after the audit-driven master plan; co-located with the
// research-driven primitives above so the design system is one folder).

export {
  ConfirmDialog,
  DeleteConfirmDialog,
  ArchiveConfirmDialog,
  RevokeConfirmDialog,
} from "./confirm-dialog";
export type { ConfirmDialogProps, ConfirmTone } from "./confirm-dialog";

export { EntityFormModal } from "./entity-form-modal";
export type {
  EntityFormModalProps,
  EntityFormField,
  FieldType,
} from "./entity-form-modal";

export {
  NoItemsYet,
  NoMatchingResults,
  ConfigurationRequired,
} from "./empty-state-variants";

export { RowActionsMenu } from "./row-actions-menu";
export type { RowActionsMenuProps, RowAction, RowActionTone } from "./row-actions-menu";

export { PageHeaderHero } from "./page-header-hero";
export type { PageHeaderHeroProps } from "./page-header-hero";

export { ModalFirstAddButton } from "./modal-first-add-button";
export type {
  ModalFirstAddButtonProps,
  ModalFirstFormProps,
} from "./modal-first-add-button";

// Stage 10.6.C.1 — cabinet greeting block (reference doctor-portal pattern).
export { CabinetGreetingBlock } from "./cabinet-greeting-block";
export type { CabinetGreetingBlockProps } from "./cabinet-greeting-block";

// Stage 10.6.C.2 — list page modernization primitives.
export { FilterPills } from "./filter-pills";
export type { FilterPillsProps, FilterPillItem } from "./filter-pills";

export { ListTableCard } from "./list-table-card";
export type { ListTableCardProps } from "./list-table-card";

// Stage 10.6.C.3 — entity detail page hero primitive.
export { DetailPageHero } from "./detail-page-hero";
export type { DetailPageHeroProps } from "./detail-page-hero";

// Stage 10.6.D.2 — external integrations command center primitive.
export { IntegrationStatusCard } from "./integration-status-card";
export type {
  IntegrationStatusCardProps,
  IntegrationStatus,
} from "./integration-status-card";

// Sprint 1 — recharts-based chart primitives + dashboard composition cards.
export { SparklineChart } from "./sparkline-chart";
export type { SparklineChartProps, SparklineTone } from "./sparkline-chart";

export { AreaChartCard } from "./area-chart-card";
export type {
  AreaChartCardProps,
  AreaChartPoint,
  AreaChartTone,
  PinnedTooltipSpec,
} from "./area-chart-card";

export { DonutRatioCard } from "./donut-ratio-card";
export type { DonutRatioCardProps, DonutTone } from "./donut-ratio-card";

export { ProfileRailCard } from "./profile-rail-card";
export type {
  ProfileRailCardProps,
  ProfileUser,
  ProfileOrg,
  ProfileRailItem,
} from "./profile-rail-card";

export { CommsPanel } from "./comms-panel";
export type { CommsPanelProps, CommsHeader, CommsItem } from "./comms-panel";

// ============================================================
// Arconique OS redesign — primitives from
// design_handoff_arconique_os/COMPONENTS.md. 8 new files; the
// 4 augmented primitives (DashboardKpi, AreaChartCard,
// DonutRatioCard, CabinetGreetingBlock) re-export with their
// existing names from the same files via their original blocks
// above — the new tones / variants on those types pick up the
// redesign visuals.
// ============================================================
export { CtaPill } from "./cta-pill";
export type { CtaPillProps, CtaPillVariant } from "./cta-pill";

export { ScoreChip } from "./score-chip";
export type { ScoreChipProps, ScoreChipTone } from "./score-chip";

export { BigStat } from "./big-stat";
export type { BigStatProps } from "./big-stat";

export { DomeDonut } from "./dome-donut";
export type { DomeDonutProps } from "./dome-donut";

export { ConcentricBubbles } from "./concentric-bubbles";
export type {
  ConcentricBubblesProps,
  ConcentricBubblesRing,
} from "./concentric-bubbles";

export { HeroGreet } from "./hero-greet";
export type { HeroGreetProps } from "./hero-greet";

export { FilterBar } from "./filter-bar";
export type { FilterBarProps, FilterBarOption } from "./filter-bar";

export { MobileTabbar } from "./mobile-tabbar";
export type { MobileTabbarProps, MobileTabbarItem } from "./mobile-tabbar";
