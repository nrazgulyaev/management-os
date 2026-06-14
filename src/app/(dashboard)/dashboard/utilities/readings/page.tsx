import Link from "next/link";
import { listUtilityReadings } from "@/features/utilities/services";
import { formatBalanceLabel } from "@/features/utilities/risk-pure";

export const metadata = { title: "Utility readings" };
export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  const rows = await listUtilityReadings({ limit: 200 });
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <span>Readings</span>
          </div>
          <h1>Utility readings</h1>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Recent</div>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No readings yet.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Villa</th>
                <th scope="col">Type</th>
                <th scope="col">Reading type</th>
                <th scope="col" className="num">Value</th>
                <th scope="col" className="num">Balance</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="text-ink-3 num">
                    {r.readingAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="row-title">{r.villaCode ?? "—"}</td>
                  <td className="text-ink-3 text-xs">{r.utilityType ?? "—"}</td>
                  <td>{r.readingType}</td>
                  <td className="num">{r.readingValue ?? "—"}</td>
                  <td className="num">
                    {formatBalanceLabel(r.balanceMinor, r.currency)}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/dashboard/utilities/accounts/${r.utilityAccountId}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Account →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
