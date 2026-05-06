import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listCategories } from "@/features/guest-services/services";
import { CategoryEditorForm } from "@/components/guest-services/category-editor";

export const metadata = { title: "Service categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await listCategories({ includeArchived: true });
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          { label: "Categories" },
        ]}
        title="Categories"
        description="Top-level groupings shown to guests in the catalog. Use the icon and sort order to control how they render in /stay/[token]/services."
      />
      <Section
        eyebrow="Add"
        title="New category"
        description="Categories are global — every villa sees the same list. Use the catalog to scope individual services to a villa or project."
      >
        <CategoryEditorForm />
      </Section>
      <Section eyebrow="Existing" title={`${categories.length} categories`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Sort</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-tertiary">
                    No categories yet.
                  </td>
                </tr>
              )}
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-ink font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-ink-tertiary font-mono">
                    {c.key}
                  </td>
                  <td className="px-4 py-3">{c.sortOrder}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.status === "active" ? "success" : "neutral"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/guest-services/categories/${c.id}`}
                      className="text-xs text-ink hover:underline underline-offset-4"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
