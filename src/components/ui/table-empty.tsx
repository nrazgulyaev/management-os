import type { ReactNode } from "react";

/**
 * Consistent empty-state row for `table.data` bodies. Centralises the
 * wording placement + spacing the cabinets had inlined, so every "no rows
 * yet" state reads the same.
 *
 *   {rows.length === 0 ? (
 *     <TableEmpty colSpan={6}>No items yet.</TableEmpty>
 *   ) : rows.map(...)}
 */
export function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-ink-3 italic py-8">
        {children}
      </td>
    </tr>
  );
}
