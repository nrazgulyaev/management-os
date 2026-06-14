import Link from "next/link";
import { TemplateForm } from "@/components/maintenance-intelligence/template-form";

export const metadata = { title: "New maintenance template" };
export const dynamic = "force-dynamic";

export default function NewTemplatePage() {
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/maintenance-intelligence">Maintenance intelligence</Link> /{" "}
            <Link href="/dashboard/maintenance-intelligence/templates">Templates</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New maintenance template</h1>
        </div>
      </div>
      <TemplateForm />
    </div>
  );
}
