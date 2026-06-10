import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { DocumentForm } from "./form";

export const metadata = { title: "New document" };

export default function NewDocumentPage() {
  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Workspace</Link> /{" "}
            <Link href="/dashboard/documents">Documents</Link> /{" "}
            <span>New</span>
          </div>
          <h1>
            New document <em className="text-terra italic">· metadata</em>
          </h1>
          <p className="page-header-meta">
            <span>records metadata only</span>
            <span>storage path optional</span>
            <span>file upload lands in v3</span>
          </p>
        </div>
      </div>

      <div className="mt-[18px] mb-6">
        <DbStatusNotice />
      </div>

      <DocumentForm />
    </>
  );
}
