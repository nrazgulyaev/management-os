"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema/projects";
import {
  developmentProjectMeta,
  projectPhases,
} from "@/lib/db/schema/development";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";

const createProjectSchema = z.object({
  name: z.string().min(2).max(120),
  location: z.string().min(2).max(120),
  acquisitionMode: z.enum([
    "leasehold",
    "freehold",
    "joint_venture",
    "mixed",
  ]),
  landAreaSqm: z.coerce.number().positive().optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type CreateProjectResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Stage 2.1 minimal "create project" action.
 *
 * Inserts a row into `projects` (with `status='planning'`) plus the
 * `developmentProjectMeta` extension and a `land_sourcing` phase pre-seeded
 * to `in_progress`. The full project setup wizard ships in 2.2.
 */
export async function createDevelopmentProject(
  formData: FormData,
): Promise<CreateProjectResult> {
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    location: formData.get("location"),
    acquisitionMode: formData.get("acquisitionMode"),
    landAreaSqm: formData.get("landAreaSqm") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      error:
        "Database is not configured in this environment. New projects cannot be created until DATABASE_URL is set.",
    };
  }

  const slug = slugify(parsed.data.name);

  try {
    const inserted = await db
      .insert(projects)
      .values({
        slug,
        name: parsed.data.name,
        location: parsed.data.location,
        status: "planning",
        managementStatus: "onboarding",
      })
      .returning({ id: projects.id, slug: projects.slug });

    const project = inserted[0];
    if (!project) throw new Error("Insert returned no row");

    await db.insert(developmentProjectMeta).values({
      projectId: project.id,
      acquisitionMode: parsed.data.acquisitionMode,
      landAreaSqm: parsed.data.landAreaSqm
        ? String(parsed.data.landAreaSqm)
        : null,
    });

    await db.insert(projectPhases).values({
      projectId: project.id,
      phaseType: "land_sourcing",
      status: "in_progress",
      actualStartDate: new Date().toISOString().slice(0, 10),
    });

    revalidatePath(`${DEVELOPMENT_APP_PATH}/projects`);
    revalidatePath(DEVELOPMENT_APP_PATH);

    return { ok: true, slug: project.slug };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("projects_slug_key") || msg.includes("duplicate key")) {
      return {
        ok: false,
        error: `A project with the slug "${slug}" already exists. Pick a different name.`,
      };
    }
    return { ok: false, error: msg };
  }
}
