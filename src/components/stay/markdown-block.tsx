/**
 * Tiny safe Markdown renderer for the guest portal. Intentionally minimal
 * — supports headings (#–###), bullets, ordered lists, links (rel
 * noopener), bold + italic, and paragraphs. Anything else passes through
 * as escaped text. We do NOT pull in a full markdown library to avoid
 * any HTML-injection risk in a guest-facing surface.
 */

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  // Order matters: bold before italic (** before *).
  let out = escape(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4 hover:text-ink">$1</a>',
  );
  return out;
}

export function MarkdownBlock({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const lines = source.split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      blocks.push(`<h3 class="text-base font-medium text-ink mt-4">${inline(line.slice(4))}</h3>`);
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(`<h2 class="text-lg font-medium text-ink mt-5">${inline(line.slice(3))}</h2>`);
      i++;
    } else if (line.startsWith("# ")) {
      blocks.push(`<h1 class="text-xl font-medium text-ink mt-6">${inline(line.slice(2))}</h1>`);
      i++;
    } else if (line.match(/^[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s/, ""))}</li>`);
        i++;
      }
      blocks.push(`<ul class="list-disc pl-5 text-sm text-ink-secondary space-y-1">${items.join("")}</ul>`);
    } else if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ""))}</li>`);
        i++;
      }
      blocks.push(`<ol class="list-decimal pl-5 text-sm text-ink-secondary space-y-1">${items.join("")}</ol>`);
    } else if (line.trim() === "") {
      i++;
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^([-*#]|\d+\.)\s/)) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push(
        `<p class="text-sm text-ink-secondary leading-relaxed">${inline(buf.join(" "))}</p>`,
      );
    }
  }
  return (
    <div
      className="space-y-3"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: blocks.join("") }}
    />
  );
}
