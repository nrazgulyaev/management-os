/**
 * Packet C PR 2 — src/lib/pdf module.
 *
 * Public surface:
 *   stitchPdfs  — merge N PDFs (by URL) into one
 *   bundleZip   — pack mixed-format files into a ZIP + optional MANIFEST
 */

export { stitchPdfs } from "./stitch";
export type { StitchPdfsInput, StitchPdfsResult, StitchPdfsSource } from "./stitch";
export { bundleZip } from "./bundle-zip";
export type { BundleZipInput, BundleZipResult, BundleZipEntry } from "./bundle-zip";
