import Link from "next/link";
import { NewComplexForm } from "./form";

export const metadata = { title: "New complex" };
export const dynamic = "force-dynamic";

export default function NewComplexPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/projects">Projects</Link> / <span>New complex</span>
          </div>
          <h1>New complex</h1>
        </div>
      </div>
      <p className="text-sm text-ink-secondary max-w-[680px]">
        Create a villa complex with typed inventory — define your villa types and
        how many villas of each. Bookings can then auto-assign a free villa of a
        type for the requested dates.
      </p>
      <NewComplexForm />
    </div>
  );
}
