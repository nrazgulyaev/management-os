import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Badge } from "@/components/ui/badge";
import { listCategories } from "@/features/guest-services/services";
import { CategoryEditorForm } from "@/components/guest-services/category-editor";

export const metadata = { title: "Service categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await listCategories({ includeArchived: true });
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <span>Categories</span>
          </div>
          <h1>Categories</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Top-level groupings shown to guests in the catalog. Use the icon
            and sort order to control how they render in
            /stay/[token]/services.
          </p>
        </div>
      </div>

      <div className="mb-3.5">
        <h2 className="display text-[22px] font-normal">New category</h2>
        <p className="text-[13px] text-ink-3 mt-1 max-w-[760px]">
          Categories are global — every villa sees the same list. Use the
          catalog to scope individual services to a villa or project.
        </p>
      </div>
      <div className="card px-5 py-[18px] mb-[18px]">
        <CategoryEditorForm />
      </div>

      <h2 className="display text-[22px] font-normal mt-8 mb-3.5">
        {categories.length} categories
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Key</th>
              <th scope="col" className="num">Sort</th>
              <th scope="col">Status</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <TableEmpty colSpan={5}>No categories yet.</TableEmpty>
            ) : (
              categories.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="mono text-[12px] text-ink-3">{c.key}</td>
                  <td className="num mono text-[12px]">{c.sortOrder}</td>
                  <td>
                    <Badge tone={c.status === "active" ? "success" : "neutral"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="num">
                    <Link
                      href={`/dashboard/guest-services/categories/${c.id}`}
                      className="btn btn-ghost btn-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
