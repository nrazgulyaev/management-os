import "server-only";

import * as React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { OwnerStatementPdf } from "./owner-statement-pdf";
import {
  getOwnerStatementById,
  listStatementLines,
} from "@/features/finance/services";
import { statementPdfFilename } from "@/features/finance/explanation";

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

  // Cast to the DocumentProps element type that `renderToBuffer` expects.
  const element = React.createElement(OwnerStatementPdf, {
    statement,
    lines,
    audience: opts.audience,
    generatedAt,
  }) as React.ReactElement<DocumentProps>;

  const buffer = await renderToBuffer(element);

  return { buffer, filename: statementPdfFilename(statement) };
}
