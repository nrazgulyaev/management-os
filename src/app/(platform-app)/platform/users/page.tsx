/**
 * Platform Admin OS — cross-org user directory.
 *
 * Every app_user across every organization. Filter by security posture
 * (missing MFA / dormant 30d+) or admin role, search by name / email /
 * org, sort by last sign-in (or name / created), then drill into a
 * per-user detail. Reads app_users across orgs — gated to super_admin by
 * the (platform-app) layout. No mutations on this page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import {
  FilterPills,
  type FilterPillItem,
} from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  listUsersAcrossOrgs,
  getUserDirectoryCounts,
  DORMANT_DAYS,
  type UserDirectoryFilter,
  type UserDirectorySort,
} from "@/lib/platform-users/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Users · Platform Admin OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "info" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  invited: "info",
  suspended: "warning",
  archived: "neutral",
};

function fmtRelative(d: Date | null): string {
  if (!d) return "never";
  const diff = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

const VALID_FILTERS: UserDirectoryFilter[] = [
  "all",
  "missing_mfa",
  "dormant",
  "admins",
];
const VALID_SORTS: UserDirectorySort[] = ["last_sign_in", "name", "created"];

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    search?: string;
    role?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;

  const filter: UserDirectoryFilter = VALID_FILTERS.includes(
    sp.filter as UserDirectoryFilter,
  )
    ? (sp.filter as UserDirectoryFilter)
    : "all";
  const sort: UserDirectorySort = VALID_SORTS.includes(
    sp.sort as UserDirectorySort,
  )
    ? (sp.sort as UserDirectorySort)
    : "last_sign_in";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const [users, counts] = await Promise.all([
    safeQuery(
      "platform-users.list",
      listUsersAcrossOrgs({
        filter,
        search: sp.search,
        role: sp.role,
        sort,
        dir,
      }),
      [] as Awaited<ReturnType<typeof listUsersAcrossOrgs>>,
      5000,
    ),
    safeQuery(
      "platform-users.counts",
      getUserDirectoryCounts(),
      { all: 0, missingMfa: 0, dormant: 0, admins: 0 },
      5000,
    ),
  ]);

  const baseHref = "/platform/users";
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const params = new URLSearchParams();
    const merged = { filter, search: sp.search, role: sp.role, sort, dir, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "filter" && v === "all")) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  const pills: FilterPillItem[] = [
    { value: "all", label: "All", href: buildHref({ filter: "all" }), count: counts.all },
    {
      value: "missing_mfa",
      label: "Missing MFA",
      href: buildHref({ filter: "missing_mfa" }),
      count: counts.missingMfa,
    },
    {
      value: "dormant",
      label: `Dormant ${DORMANT_DAYS}d+`,
      href: buildHref({ filter: "dormant" }),
      count: counts.dormant,
    },
    {
      value: "admins",
      label: "Admins",
      href: buildHref({ filter: "admins" }),
      count: counts.admins,
    },
  ];

  // Sortable column header: clicking flips dir on the active column,
  // otherwise sets that column desc.
  const sortHeader = (
    label: string,
    col: UserDirectorySort,
    align?: "right",
  ) => {
    const active = sort === col;
    const nextDir = active && dir === "desc" ? "asc" : "desc";
    const arrow = active ? (dir === "desc" ? " ↓" : " ↑") : "";
    return (
      <Link
        href={buildHref({ sort: col, dir: nextDir })}
        className={`inline-flex items-center hover:text-ink transition-colors ${
          align === "right" ? "justify-end" : ""
        } ${active ? "text-ink" : ""}`}
      >
        {label}
        <span className="tabular-nums text-ink-tertiary">{arrow}</span>
      </Link>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <div className="flex flex-col gap-[22px]">
        <div className="crumb">Platform Admin OS · Users</div>
        <SectionHeading
          eyebrow={`${users.length} user${users.length === 1 ? "" : "s"}`}
          title="Cross-org user directory"
          subtitle="Every user across every customer org. Filter by security posture or admin role, search by name / email / org, sort by last sign-in, then drill into a user for auth state and admin actions."
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {/* Preserve the active filter / sort across a search submit. */}
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        {sp.role && <input type="hidden" name="role" value={sp.role} />}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
            Search
          </span>
          <input
            type="search"
            name="search"
            defaultValue={sp.search ?? ""}
            placeholder="Name, email, or org…"
            className="h-10 w-72 rounded-md border border-line-soft bg-surface px-3 text-sm"
          />
        </label>
      </form>

      <FilterPills items={pills} current={filter} label="Filter" />

      <Card padding="none" overflowHidden>
        <div className="pf-card-h">
          <h3>Users</h3>
          <span className="meta">DIRECTORY · {users.length}</span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>{sortHeader("User", "name")}</TH>
              <TH>Organization</TH>
              <TH>Roles</TH>
              <TH>MFA</TH>
              <TH>Status</TH>
              <TH>{sortHeader("Last sign-in", "last_sign_in")}</TH>
              <TH className="text-right">Open</TH>
            </TR>
          </THead>
          <TBody>
            {users.length === 0 ? (
              <TR>
                <TD colSpan={7} className="text-ink-tertiary text-center py-10">
                  No users match your filter.
                </TD>
              </TR>
            ) : (
              users.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <Link
                      href={`/platform/users/${u.id}`}
                      className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                    >
                      <span className="text-ink font-medium truncate">
                        {u.fullName}
                      </span>
                      <span className="text-xs text-ink-tertiary truncate">
                        {u.email}
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    {u.organizationCode ? (
                      <Link
                        href={`/platform/${u.organizationCode}`}
                        className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                      >
                        <span className="text-ink-secondary truncate">
                          {u.organizationName ?? u.organizationCode}
                        </span>
                        <span className="text-xs text-ink-tertiary font-mono">
                          {u.organizationCode}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-ink-tertiary">—</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {u.roleKeys.length === 0 ? (
                        <span className="text-ink-tertiary text-xs">—</span>
                      ) : (
                        u.roleKeys.slice(0, 3).map((r) => (
                          <Badge
                            key={r}
                            tone={r === "super_admin" ? "gold" : "outline"}
                          >
                            {r}
                          </Badge>
                        ))
                      )}
                      {u.roleKeys.length > 3 && (
                        <Badge tone="neutral">+{u.roleKeys.length - 3}</Badge>
                      )}
                    </div>
                  </TD>
                  <TD>
                    {u.mfaEnrolled ? (
                      <span className="inline-flex items-center gap-1 text-success text-sm">
                        <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                        On
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-warning text-sm">
                        <ShieldAlert className="w-4 h-4" strokeWidth={1.75} />
                        Off
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[u.status] ?? "neutral"}>
                      {u.status}
                    </Badge>
                  </TD>
                  <TD className="text-sm tabular-nums text-ink-secondary">
                    {fmtRelative(u.lastSignInAt)}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/platform/users/${u.id}`}
                      className="inline-flex items-center text-ink-tertiary hover:text-ink"
                    >
                      <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
