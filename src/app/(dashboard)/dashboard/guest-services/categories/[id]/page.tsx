import Link from "next/link";
import { notFound } from "next/navigation";
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
      <div className="card px-5 py-[18px]">
        <CategoryEditorForm category={category} />
      </div>
    </>
  );
}
