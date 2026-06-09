import "server-only";

import {
  listTagsForSubject,
  listOrgTags,
  listCustomFieldsForSubject,
} from "@/features/crm-custom-fields/services";
import { TagChipRow } from "./tag-chip-row";
import { CustomFieldsSection } from "./custom-fields-section";

/**
 * CRM-CUSTOM-FIELDS-TAGS — server panel that loads a subject's tags + custom
 * fields (org-scoped) and renders the editable chip-row + fields section.
 *
 * Generic: pass any `subjectType` (owner | contact | lead | guest | villa).
 * Drop onto a detail page; `canManage` gates the inline editors.
 */
export async function CrmAnnotationsPanel({
  subjectType,
  subjectId,
  canManage,
}: {
  subjectType: string;
  subjectId: string;
  canManage: boolean;
}) {
  const [tags, orgTags, fields] = await Promise.all([
    listTagsForSubject(subjectType, subjectId),
    listOrgTags(),
    listCustomFieldsForSubject(subjectType, subjectId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          Tags
        </span>
        <TagChipRow
          subjectType={subjectType}
          subjectId={subjectId}
          tags={tags.map((t) => ({ id: t.id, label: t.label, color: t.color }))}
          orgTags={orgTags.map((t) => ({
            id: t.id,
            label: t.label,
            color: t.color,
          }))}
          canManage={canManage}
        />
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
          Custom fields
        </span>
        <CustomFieldsSection
          subjectType={subjectType}
          subjectId={subjectId}
          fields={fields.map((f) => ({
            defId: f.defId,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            options: f.options,
            helpText: f.helpText,
            value: f.value,
          }))}
          canManage={canManage}
        />
      </section>
    </div>
  );
}
