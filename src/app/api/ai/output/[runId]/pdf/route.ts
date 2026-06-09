import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requirePermission } from "@/features/auth/permissions";
import { getRunPayload } from "@/features/ai-agents/agent-detail-queries";

/**
 * AI Cabinet depth pass — agent output PDF download.
 *
 * Renders the run's metadata + output text into a clean A4 PDF via
 * pdf-lib (no headless browser). Gated on `ai.run`.
 */

export const dynamic = "force-dynamic";

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10.5;
const LINE_H = 15;

function wrap(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/);
    let line = "";
    for (const w of words) {
      if (line.length === 0) {
        line = w;
      } else if ((line + " " + w).length <= maxChars) {
        line += " " + w;
      } else {
        out.push(line);
        line = w;
      }
      // hard-break very long tokens
      while (line.length > maxChars) {
        out.push(line.slice(0, maxChars));
        line = line.slice(maxChars);
      }
    }
    out.push(line);
  }
  return out;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  try {
    await requirePermission("ai.run");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { runId } = await ctx.params;
  const payload = await getRunPayload(runId);
  if (!payload) return new NextResponse("Not found", { status: 404 });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawHeading = (text: string, size: number, bold = false) => {
    if (y < MARGIN + LINE_H) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.12, 0.11, 0.1),
    });
    y -= size + 8;
  };

  const drawBody = (text: string) => {
    const lines = wrap(text, 92);
    for (const line of lines) {
      if (y < MARGIN) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font,
        color: rgb(0.22, 0.21, 0.2),
      });
      y -= LINE_H;
    }
  };

  drawHeading(`Agent run · ${payload.assistantKey}`, 16, true);
  drawHeading(`Run ${payload.id}`, 9, false);
  y -= 6;

  const meta = [
    `Status: ${payload.status}`,
    `Model: ${payload.model ?? "—"}`,
    `Tokens: ${payload.totalTokens ?? 0} (${payload.promptTokens ?? 0} in / ${payload.completionTokens ?? 0} out)`,
    `Latency: ${payload.latencyMs != null ? `${payload.latencyMs} ms` : "—"}`,
    `Cost: ${payload.totalCostUsd != null ? `$${payload.totalCostUsd}` : "—"}`,
    `Created: ${payload.createdAt}`,
  ];
  drawBody(meta.join("\n"));
  y -= 8;

  drawHeading("Input", 11, true);
  drawBody(payload.inputSummary ?? "—");
  y -= 8;

  drawHeading("Output", 11, true);
  drawBody(payload.outputSummary ?? payload.errorMessage ?? "—");

  const bytes = await pdf.save();
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="agent-run-${runId.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
