/**
 * Packet C PR 2 — multi-file ZIP bundle with optional MANIFEST.
 *
 * Used when the bundle includes non-PDF or mixed-format files
 * (statements + tax certs + photo attachments). `manifestText` is
 * written as MANIFEST.txt at the ZIP root.
 */

import "server-only";
import JSZip from "jszip";

export interface BundleZipEntry {
  filename: string;
  data: Buffer | ArrayBuffer | Uint8Array;
  mimeType?: string;
}

export interface BundleZipInput {
  entries: BundleZipEntry[];
  manifestText?: string;
}

export interface BundleZipResult {
  buffer: Buffer;
  fileCount: number;
  sizeBytes: number;
}

export async function bundleZip(input: BundleZipInput): Promise<BundleZipResult> {
  const zip = new JSZip();
  for (const e of input.entries) {
    zip.file(e.filename, e.data);
  }
  if (input.manifestText) {
    zip.file("MANIFEST.txt", input.manifestText);
  }
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    buffer: buf,
    fileCount: input.entries.length + (input.manifestText ? 1 : 0),
    sizeBytes: buf.byteLength,
  };
}
