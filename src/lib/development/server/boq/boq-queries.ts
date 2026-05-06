import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  boqDocuments,
  boqSections,
  boqItems,
} from "@/lib/db/schema/boq";

export async function listBoqDocuments(filters?: {
  projectId?: string;
  villaId?: string;
  status?: string;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.projectId) {
    conditions.push(eq(boqDocuments.projectId, filters.projectId));
  }
  if (filters?.villaId) {
    conditions.push(eq(boqDocuments.villaId, filters.villaId));
  }
  if (filters?.status) {
    conditions.push(eq(boqDocuments.status, filters.status));
  }
  return db
    .select()
    .from(boqDocuments)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(boqDocuments.createdAt));
}

export async function getBoqDocumentByCode(code: string) {
  const db = requireDb();
  const [doc] = await db
    .select()
    .from(boqDocuments)
    .where(eq(boqDocuments.boqCode, code))
    .limit(1);
  if (!doc) return null;
  const sections = await db
    .select()
    .from(boqSections)
    .where(eq(boqSections.boqDocumentId, doc.id))
    .orderBy(asc(boqSections.displayOrder), asc(boqSections.sectionCode));
  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length === 0
      ? []
      : await db
          .select()
          .from(boqItems)
          .where(
            sql`${boqItems.sectionId} = ANY(${sectionIds}::uuid[])`,
          )
          .orderBy(asc(boqItems.itemCode));
  return { document: doc, sections, items };
}
