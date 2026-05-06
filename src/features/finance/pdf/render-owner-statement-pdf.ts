import "server-only";

import * as React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { OwnerStatementPdf } from "./owner-statement-pdf";
import {
  getOwnerStatementById,
  listStatementLines,
} from "@/features/finance/services";
import { statementPdfFilename } from "@/features/finance/explanation";
import { getStatementExplanationSnapshot } from "@/features/statement-transparency/services";

export interface RenderOptions {
  audience: "internal" | "owner";
}

export async function renderOwnerStatementPdf(
  statementId: string,
  opts: RenderOptions,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const statement = await getOwnerStatementById(statementId);
  if (!statement) return null;

  const lines = await listStatementLines(statementId, {
    ownerVisibleOnly: opts.audience === "owner",
  });

  const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC";

  // Prompt 110 — best-effort transparency snapshot.  When the snapshot
  // exists the PDF uses its owner-safe headline + summary + bullets;
  // otherwise the renderer falls back to the deterministic explanation
  // generator (existing pre-110 behaviour).
  const snapshot = await getStatementExplanationSnapshot(statementId);
  const explanationSnapshot = snapshot
    ? {
        headline: snapshot.headline,
        summary: snapshot.summary,
        bulletPoints: Array.isArray(snapshot.bulletPoints)
          ? (snapshot.bulletPoints as string[])
          : [],
        payoutExplanation: snapshot.payoutExplanation,
        warningExplanation: snapshot.warningExplanation,
      }
    : null;

  // Cast to the DocumentProps element type that `renderToBuffer` expects.
  const element = React.createElement(OwnerStatementPdf, {
    statement,
    lines,
    audience: opts.audience,
    generatedAt,
    explanationSnapshot,
  }) as React.ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  return { buffer, filename: statementPdfFilename(statement) };
}
