import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryById } from "@/features/guest-services/services";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { CategoryEditorForm } from "@/components/guest-services/category-editor";

export const metadata = { title: "Edit category" };
export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [category, ctx] = await Promise.all([
    getCategoryById(id),
    getCurrentUserContext(),
  ]);
  if (!category) notFound();
  const canManage = ctx.isSuperAdmin;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <Link href="/dashboard/guest-services/categories">Categories</Link>{" "}
            / <span>{category.name}</span>
          </div>
          <h1>{category.name}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Key · <span className="mono">{category.key}</span>
          </p>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mb-3.5">
        Category details
      </h2>
      {canManage ? (
        <div className="card px-5 py-[18px]">
          <CategoryEditorForm category={category} />
        </div>
      ) : (
        <div className="card px-5 py-[18px]">
          <p className="text-[13px] text-ink-3 mb-4 max-w-[760px]">
            Service categories are a single shared catalog across all tenants,
            so only a platform super-admin can edit them. This is a read-only
            view for your account.
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <ReadOnlyField label="Name" value={category.name} />
            <ReadOnlyField label="Key" value={category.key} mono />
            <ReadOnlyField label="Icon" value={category.icon ?? "—"} />
            <ReadOnlyField
              label="Sort order"
              value={String(category.sortOrder)}
              mono
            />
            <ReadOnlyField
              label="Description"
              value={category.description ?? "—"}
              className="md:col-span-2"
            />
            <ReadOnlyField label="Status" value={category.status} />
          </dl>
        </div>
      )}
    </>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      <span className={`text-ink ${mono ? "font-mono text-[12px]" : ""}`}>
        {value}
      </span>
    </div>
  );
}
