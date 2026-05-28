/**
 * Packet C PR 2 — PDF stitcher.
 *
 * Merges N PDFs (fetched by URL) into one. Caller is responsible
 * for filtering inputs to PDF-only — `stitchPdfs` throws on non-
 * PDF payloads.
 */

import "server-only";
import { PDFDocument } from "pdf-lib";

export interface StitchPdfsSource {
  url: string;
  label?: string;
}

export interface StitchPdfsInput {
  sources: StitchPdfsSource[];
  title?: string;
  metadata?: {
    author?: string;
    subject?: string;
  };
}

export interface StitchPdfsResult {
  buffer: Buffer;
  pageCount: number;
  sizeBytes: number;
  /** Per-source page counts in input order — useful for the MANIFEST. */
  sources: Array<{ url: string; label?: string; pageCount: number }>;
}

export async function stitchPdfs(input: StitchPdfsInput): Promise<StitchPdfsResult> {
  const out = await PDFDocument.create();
  if (input.title) out.setTitle(input.title);
  if (input.metadata?.author) out.setAuthor(input.metadata.author);
  if (input.metadata?.subject) out.setSubject(input.metadata.subject);

  const sources: StitchPdfsResult["sources"] = [];
  for (const src of input.sources) {
    const res = await fetch(src.url);
    if (!res.ok) {
      throw new Error(`stitchPdfs: failed to fetch ${src.url} (${res.status})`);
    }
    const bytes = await res.arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    const pageCount = doc.getPageCount();
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    sources.push({ url: src.url, label: src.label, pageCount });
  }

  const buf = Buffer.from(await out.save());
  return {
    buffer: buf,
    pageCount: out.getPageCount(),
    sizeBytes: buf.byteLength,
    sources,
  };
}
