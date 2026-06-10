import { dayHeader } from "@/features/direct-booking/detail-pure";
import type { CoverageRow } from "@/features/direct-booking/direct-booking-detail";

/**
 * Cross-channel coverage strip for the direct-booking detail (mock §04).
 * Renders the real `.channel-grid` primitive: one row per block source,
 * a cell per night. The grid geometry (column count) is data-driven, so
 * the `--cols` / `--col-w` / `--row-label-w` custom properties are set
 * inline — dynamic geometry is the one sanctioned inline-style case.
 */
export function CoverageStrip({
  nights,
  rows,
}: {
  nights: string[];
  rows: CoverageRow[];
}) {
  if (nights.length === 0) return null;
  const gridVars = {
    "--cols": String(nights.length),
    "--col-w": "84px",
    "--row-label-w": "120px",
  } as React.CSSProperties;

  return (
    <div className="channel-grid text-[11px]" style={gridVars}>
      <div className="cg-head">
        <div className="corner">channel</div>
        {nights.map((n) => {
          const h = dayHeader(n);
          return (
            <div key={n} className="day">
              <div className="dow">{h.dow}</div>
              <div className="dn">{h.dn}</div>
            </div>
          );
        })}
      </div>
      {rows.map((row) => (
        <div
          key={`${row.sourceType}-${row.label}`}
          className={row.isDirect ? "cg-row ch-terra" : "cg-row"}
        >
          <div className="label">
            <span className="ch" />
            {row.label}
          </div>
          {row.nights.map((covered, i) => (
            <div
              key={`${row.sourceType}-${nights[i]}`}
              className={
                covered
                  ? row.isDirect
                    ? "cg-cell booked"
                    : "cg-cell blocked"
                  : "cg-cell"
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
