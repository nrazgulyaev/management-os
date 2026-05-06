import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getCategoryById } from "@/features/guest-services/services";
import { CategoryEditorForm } from "@/components/guest-services/category-editor";

export const metadata = { title: "Edit category" };
export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const category = await getCategoryById(id);
  if (!category) notFound();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          {
            label: "Categories",
            href: "/dashboard/guest-services/categories",
          },
          { label: category.name },
        ]}
        title={category.name}
        description={`Key · ${category.key}`}
      />
      <Section eyebrow="Edit" title="Category details">
        <CategoryEditorForm category={category} />
      </Section>
    </div>
  );
}
