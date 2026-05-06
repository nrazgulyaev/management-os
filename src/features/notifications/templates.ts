/**
 * Pure template-rendering helpers. No `server-only` import so tests can
 * exercise these without a DB. The DB-aware loader lives in `services.ts`.
 *
 * Template grammar (v8B): Mustache-lite `{{var}}` substitution against a
 * flat payload. Missing keys render as the empty string. HTML rendering
 * escapes by default; opt-out via `{{{var}}}` (raw) is *not* supported on
 * purpose — operators rarely need it and we don't want to ship an
 * accidental XSS sink.
 */

export interface NotificationTemplate {
  templateKey: string;
  channel: string;
  subjectTemplate: string | null;
  bodyTemplate: string;
  htmlTemplate: string | null;
}

export interface RenderedTemplate {
  subject: string | null;
  body: string;
  html: string | null;
}

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lookup(payload: Record<string, unknown> | null | undefined, key: string): string {
  if (!payload) return "";
  // Support shallow dotted paths like `booking.code` to keep templates
  // expressive without re-implementing JSONPath.
  const parts = key.split(".");
  let cur: unknown = payload;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "";
    }
  }
  if (cur === null || cur === undefined) return "";
  if (typeof cur === "string") return cur;
  if (typeof cur === "number" || typeof cur === "boolean") return String(cur);
  try {
    return JSON.stringify(cur);
  } catch {
    return "";
  }
}

/**
 * Render a single template string. `mode === "html"` HTML-escapes every
 * substituted value. `mode === "text"` substitutes verbatim.
 */
export function renderString(
  template: string,
  payload: Record<string, unknown> | null | undefined,
  mode: "text" | "html" = "text",
): string {
  return template.replace(VAR_RE, (_match, key: string) => {
    const value = lookup(payload, key);
    return mode === "html" ? escapeHtml(value) : value;
  });
}

/**
 * Render all available parts of a template against a payload. Subject
 * and HTML are optional in the source row; this returns null for parts
 * the template doesn't define.
 */
export function renderTemplate(
  template: NotificationTemplate,
  payload: Record<string, unknown> | null | undefined,
): RenderedTemplate {
  return {
    subject:
      template.subjectTemplate !== null
        ? renderString(template.subjectTemplate, payload, "text")
        : null,
    body: renderString(template.bodyTemplate, payload, "text"),
    html:
      template.htmlTemplate !== null
        ? renderString(template.htmlTemplate, payload, "html")
        : null,
  };
}

/**
 * Decide what a delivery should send given (a) the queued title/body the
 * producer captured at enqueue time and (b) an optional template. The
 * template wins when present so operators can update wording without
 * reproducing every queue row.
 */
export function chooseDeliveryContent(
  fallback: { title: string; body: string },
  rendered: RenderedTemplate | null,
): { title: string; body: string; html: string | null } {
  if (!rendered) {
    return { title: fallback.title, body: fallback.body, html: null };
  }
  return {
    title: rendered.subject ?? fallback.title,
    body: rendered.body || fallback.body,
    html: rendered.html,
  };
}
