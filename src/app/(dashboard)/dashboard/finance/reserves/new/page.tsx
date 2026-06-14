import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listOwners } from "@/features/owners/services";
import { LedgerLineForm } from "@/components/finance/ledger-line-form";
import { Field, selectCls } from "@/components/admin/form-shell";
import { createReserveMovementAction } from "@/features/finance/actions";

export const metadata = { title: "New reserve movement" };
export const dynamic = "force-dynamic";

export default async function NewReservePage() {
  const [villas, projects, owners] = await Promise.all([
    listVillas(),
    listProjects(),
    listOwners(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/reserves">Reserves</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New reserve movement</h1>
        </div>
      </div>
      <DbStatusNotice />
      <LedgerLineForm
        title="Reserve movement"
        cancelHref="/dashboard/finance/reserves"
        action={createReserveMovementAction}
        dateName="movementDate"
        dateLabel="Movement date"
        categoryName="reserveType"
        categoryLabel="Reserve type"
        categoryOptions={["renovation", "depreciation", "ffe", "maintenance", "tax", "emergency", "other"]}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        owners={owners.map((o) => ({ id: o.id, label: o.displayName }))}
        submitLabel="Post movement"
        extraFields={
          <Field label="Movement type" required>
            <select name="movementType" defaultValue="contribution" className={selectCls}>
              <option value="contribution">Contribution</option>
              <option value="release">Release</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </Field>
        }
      />
    </div>
  );
}
