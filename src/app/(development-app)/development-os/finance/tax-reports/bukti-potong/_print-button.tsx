"use client";

/**
 * ID-TAX compliance trio — print trigger for the bukti potong draft
 * detail view. Plain window.print(); the page itself is the printable
 * artifact (no PDF generation, no invented certificate numbers).
 */

export function PrintButton() {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm print:hidden"
      onClick={() => window.print()}
      title="Print this bukti potong draft (official e-Bupot numbers are issued by DJP/Coretax)"
    >
      Print draft
    </button>
  );
}
