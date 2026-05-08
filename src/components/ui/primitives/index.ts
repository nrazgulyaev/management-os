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
export type { DashboardKpiProps, KpiStatus } from "./dashboard-kpi";

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
