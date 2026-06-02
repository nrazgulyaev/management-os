# Packet C · PR 2 — PDF bundle stitcher

**Goal:** Wire `src/features/owner-portal/generate-bundle.ts` off its stub URL by building a small `src/lib/pdf/` utility that stitches per-document PDFs into a single bundle.

Owner-portal Documents cabinet's "bundle download" flow currently returns a placeholder URL. After this PR, owner clicks "Generate bundle" → real ZIP (or single PDF) is produced and streamed to the browser.

## What to build

### 1. `src/lib/pdf/index.ts` — module entry

Re-exports the public surface:

```ts
export { stitchPdfs, type StitchPdfsInput, type StitchPdfsResult } from "./stitch";
export { bundleZip, type BundleZipInput, type BundleZipResult } from "./bundle-zip";
```

### 2. `src/lib/pdf/stitch.ts` — merge N PDFs into 1

Library: use `pdf-lib` (well-maintained, MIT, works in Node + edge runtime).

```ts
import { PDFDocument } from "pdf-lib";

export interface StitchPdfsInput {
  sources: Array<{ url: string; label?: string }>;  // ordered
  title?: string;
  metadata?: { author?: string; subject?: string };
}

export interface StitchPdfsResult {
  buffer: Buffer;
  pageCount: number;
  sizeBytes: number;
}

export async function stitchPdfs(input: StitchPdfsInput): Promise<StitchPdfsResult> {
  const out = await PDFDocument.create();
  if (input.title) out.setTitle(input.title);
  if (input.metadata?.author) out.setAuthor(input.metadata.author);
  if (input.metadata?.subject) out.setSubject(input.metadata.subject);

  for (const src of input.sources) {
    const bytes = await fetch(src.url).then(r => r.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }

  const buf = Buffer.from(await out.save());
  return { buffer: buf, pageCount: out.getPageCount(), sizeBytes: buf.byteLength };
}
```

Source URLs come from `documents.url` — the storage-side signed URL for each doc. The stitcher only handles PDFs; images / ZIPs / other formats are filtered out by the caller (`generate-bundle.ts`).

### 3. `src/lib/pdf/bundle-zip.ts` — ZIP package (mixed-type bundles)

Library: use `jszip` (already in the dependency tree if not, add it — it's standard).

```ts
import JSZip from "jszip";

export interface BundleZipInput {
  entries: Array<{ filename: string; data: Buffer | ArrayBuffer; mimeType?: string }>;
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
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: buf, fileCount: input.entries.length + (input.manifestText ? 1 : 0), sizeBytes: buf.byteLength };
}
```

### 4. Wire `generate-bundle.ts`

Current state: `unstable_cache` wrapper around a stub that returns a placeholder URL.

New body:
1. Resolve the bundle request → query `documents` to get the file rows in scope.
2. Group by `kind` for the MANIFEST.
3. If format = `'pdf'` AND all rows are PDF type → call `stitchPdfs`. Single output file.
4. Else → call `bundleZip` with each file fetched from its storage URL. Append a `MANIFEST.txt` listing files + their statement/contract metadata.
5. Upload the result to storage (use the existing pattern from `src/lib/storage/` — verify the helper name).
6. Return `{ url, sizeBytes, fileCount, generatedAt }`.
7. Audit-log the bundle event to `auditEvents` with `action='owner.bundle.generated'`.

Replace the existing `unstable_cache` wrap with a thin cache that invalidates on any `documents` insert/update for the owner (use the standard `revalidatePath` pattern from existing owner-portal actions).

## Dependency

Add to `package.json`:
```
"pdf-lib": "^1.17.1",
"jszip": "^3.10.1"  // if not present
```

Verify nothing already in the tree wraps PDF — `grep -r "PDFDocument\|pdf-lib" src/` first.

## Validation

```
pnpm install
pnpm typecheck && pnpm lint
pnpm smoke:routes
```

Manual:
- Open Owner Portal Documents → tap "Generate bundle"
- Pick 3 categories (Contracts + Statements + Tax)
- Choose ZIP format → bundle downloads, contains all selected files + MANIFEST.txt
- Choose single PDF format → bundle downloads as one merged PDF
- Verify `auditEvents` has a row with `action='owner.bundle.generated'` and the correct file count

## Commit message

```
feat(phase-2-data-l2/pdf): wire generate-bundle off stub, build src/lib/pdf/

New src/lib/pdf/ module — stitchPdfs (PDFDocument merge via pdf-lib) and
bundleZip (multi-file ZIP via jszip with MANIFEST.txt). generate-bundle.ts
now produces real bundles and uploads to storage; cached with
documents-write invalidation.

Refs: phase-2-data-wiring, packet-c
```
