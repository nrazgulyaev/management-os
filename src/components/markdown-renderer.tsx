/**
 * DAILY-DIGEST-SPRINT-1 P4.5 — server-rendered markdown component.
 *
 * Used by the digest detail page; reusable for any future markdown
 * surface (agent outputs, audit messages, etc.).
 *
 * Security posture:
 *   · `skipHtml` is intentionally implicit — the default `components`
 *     map does NOT render raw HTML nodes. react-markdown v10's
 *     out-of-the-box behavior is safe; we override component renderers
 *     for typography polish, not to whitelist anything dangerous.
 *   · `remark-gfm` is enabled for table / strikethrough / autolink
 *     support — Daily Digest system prompts produce these.
 *
 * No `"use client"`. This component renders on the server (default
 * for App Router server components) — react-markdown v10 supports SSR.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-medium text-ink mt-6 mb-3 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-medium text-ink mt-5 mb-2 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-medium text-ink mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm text-ink-secondary leading-relaxed mb-3">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 text-sm text-ink-secondary mb-3 space-y-1">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 text-sm text-ink-secondary mb-3 space-y-1">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-ink font-medium">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-line-strong pl-4 my-4 text-sm text-ink-tertiary italic">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-[12px] bg-muted px-1.5 py-0.5 rounded-sm text-ink">
      {children}
    </code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="font-mono text-[12px] bg-muted p-3 rounded-md overflow-x-auto mb-3">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-4 border-line-soft" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b border-line-soft text-[11px] uppercase tracking-widest text-ink-tertiary">
      {children}
    </thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="text-left px-2 py-1.5 font-medium">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-2 py-1.5 border-b border-line-soft text-ink-secondary">
      {children}
    </td>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} className="text-ink underline hover:no-underline">
      {children}
    </a>
  ),
};

export function MarkdownRenderer({ body }: { body: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
