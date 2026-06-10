/**
 * ID-TAX — e-Faktur export format picker (server component; native
 * <details> dropdown, no client JS). Two formats backed by
 * /development-os/finance/tax-reports/export:
 *
 *   * draft CSV — working register, every currency + both VAT directions,
 *     USD-normalised. NOT a DJP file format.
 *   * Coretax XML — official-format faktur keluaran import file
 *     (TaxInvoiceBulk), built per DJP's published template with HIGH
 *     confidence (official sample XML + Excel template v1.6.1 inspected —
 *     docs/CORETAX-EFAKTUR-FORMAT.md). IDR output lines only; non-IDR
 *     lines are excluded and counted here + in the file header.
 */

export function ExportFormatMenu({
  periodStart,
  periodEnd,
  idrOutputLines,
  nonIdrOutputLines,
}: {
  periodStart: string;
  periodEnd: string;
  /** PPN Keluaran lines denominated in IDR (eligible for Coretax XML). */
  idrOutputLines: number;
  /** PPN Keluaran lines in other currencies (draft CSV only). */
  nonIdrOutputLines: number;
}) {
  const base = `/development-os/finance/tax-reports/export?periodStart=${periodStart}&periodEnd=${periodEnd}`;
  return (
    <details className="relative">
      <summary className="btn btn-secondary btn-sm cursor-pointer list-none select-none">
        Export e-Faktur ▾
      </summary>
      <div className="card absolute right-0 z-20 mt-1 w-[380px] p-4 text-left shadow-lg">
        <a
          href={`${base}&format=draft-csv`}
          download
          className="btn btn-secondary btn-sm w-full"
          title="Working register — all currencies, PPN Keluaran + Masukan, USD-normalised. Not a DJP file format."
        >
          Draft CSV — full register (all currencies)
        </a>
        <p className="mt-1 mb-3 text-[11px] leading-snug text-[var(--ink-3)]">
          Working draft: every VAT line (Keluaran + Masukan, any currency),
          USD-normalised to match the declaration totals. Not a DJP format.
        </p>
        <a
          href={`${base}&format=coretax-xml`}
          download
          className="btn btn-secondary btn-sm w-full"
          title="Official DJP TaxInvoiceBulk import XML — faktur pajak keluaran, IDR lines only"
        >
          Coretax XML — faktur keluaran (official template)
        </a>
        <p className="mt-1 mb-0 text-[11px] leading-snug text-[var(--ink-3)]">
          Official DJP import format (TaxInvoiceBulk), high confidence —
          verified against DJP&apos;s published sample XML + Excel template
          v1.6.1; see docs/CORETAX-EFAKTUR-FORMAT.md. Coretax is IDR-only:
          this period exports {idrOutputLines} IDR output line
          {idrOutputLines === 1 ? "" : "s"};{" "}
          <strong>
            {nonIdrOutputLines} non-IDR line
            {nonIdrOutputLines === 1 ? "" : "s"} excluded
          </strong>{" "}
          (kept in the draft CSV; count repeated inside the file). Seller
          NPWP is not stored here — fill TIN/SellerIDTKU before upload.
          Nomor faktur is issued by DJP after upload, never by this export.
        </p>
      </div>
    </details>
  );
}
