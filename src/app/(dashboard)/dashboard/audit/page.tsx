import { TableEmpty } from "@/components/ui/table-empty";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listAuditEvents } from "@/features/audit/services";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

/** Handoff `.badge` tone class per action class (mgmt-p3 audit mockup). */
const actionBadge: Record<string, string> = {
  create: "badge-ok",
  update: "",
  archive: "badge-warn",
  unarchive: "badge-ok",
};

function classify(
  action: string,
): "create" | "update" | "archive" | "unarchive" | "other" {
  if (action.endsWith(".create")) return "create";
  if (action.endsWith(".archive") || action.endsWith(".end")) return "archive";
  if (action.endsWith(".unarchive")) return "unarchive";
  if (action.endsWith(".update") || action.endsWith(".status.update")) return "update";
  return "other";
}

export default async function AuditPage() {
  const { allowed } = await requireCabinetAccess("audit");
  if (!allowed) return <CabinetGate cabinet="Audit log" />;
  const events = await listAuditEvents({ limit: 200 });
  const source = events[0]?.source ?? "mock";

  const since24 = Date.now() - 24 * 86_400_000;
  const events24h = events.filter(
    (e) => new Date(e.createdAt).getTime() >= since24,
  ).length;
  const financeWrites = events.filter((e) => e.action.startsWith("finance.")).length;
  const aiInvocations = events.filter((e) => e.action.startsWith("ai.")).length;
  const actors = new Set(
    events.map((e) => e.actorName ?? e.actorEmail).filter(Boolean),
  ).size;

  return (
    <>
      <div className="section-heading flex items-end gap-[18px]">
        <div className="flex-1 min-w-0">
          <div className="eyebrow label">System · append-only record</div>
          <h1>
            Every <em>mutation</em>, traced.
          </h1>
          <p>
            Append-only record of meaningful changes across projects, villas,
            owners, bookings, channels, guests, shares and documents — every
            server action, finance write and AI invocation. 200 most recent
            shown.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <SourceBadge source={source} />
        </div>
      </div>

      <div className="gs-kpis">
        <div className="kpi">
          <div className="label">Events · 24h</div>
          <div className="v">{events24h}</div>
          <div className="sub">{events.length} visible</div>
        </div>
        <div className={`kpi${financeWrites > 0 ? " ok" : ""}`}>
          <div className="label">Finance writes</div>
          <div className="v">{financeWrites}</div>
          <div className="sub">signed mutations</div>
        </div>
        <div className="kpi">
          <div className="label">AI invocations</div>
          <div className="v">{aiInvocations}</div>
          <div className="sub">agent + copilot</div>
        </div>
        <div className="kpi gold">
          <div className="label">Distinct actors</div>
          <div className="v">{actors}</div>
          <div className="sub">users + system</div>
        </div>
      </div>

      <DbStatusNotice />

      <div className="card card-pad mt-[18px]">
        <div className="gs-card-h">
          <h3>Recent activity</h3>
          <span className="meta">{events.length} ENTRIES</span>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Entity</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <TableEmpty colSpan={5}>No audit events yet.</TableEmpty>
            ) : (
              events.map((e) => {
                const c = classify(e.action);
                const badgeClass = actionBadge[c] ?? "";
                const after = (e.after ?? null) as Record<string, unknown> | null;
                const before = (e.before ?? null) as Record<string, unknown> | null;
                const summary =
                  c === "archive"
                    ? "Archived"
                    : c === "create"
                      ? `Created ${e.entityType}`
                      : c === "update"
                        ? Object.keys({ ...(before ?? {}), ...(after ?? {}) })
                            .filter((k) => before?.[k] !== after?.[k])
                            .slice(0, 3)
                            .map((k) => `${k}`)
                            .join(", ") || "Updated"
                        : (e.metadata as Record<string, unknown> | null)?.note?.toString() ??
                          "—";

                return (
                  <tr key={e.id}>
                    <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td>
                      {e.actorName ? (
                        <div className="flex flex-col">
                          <span className="text-[13px] text-ink">{e.actorName}</span>
                          <span className="text-[11px] text-ink-4">{e.actorEmail}</span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink-3">System</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`.trim()}>{e.action}</span>
                    </td>
                    <td className="text-[13px] text-ink-2">
                      {e.entityType}
                      {e.entityId && (
                        <span className="ml-2 mono text-[11px] text-ink-4">
                          {e.entityId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="text-[12px] text-ink-3 truncate max-w-[420px]">
                      {summary as string}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
