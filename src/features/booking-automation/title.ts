/**
 * Pure title-template interpolation. Extracted so tests can use it without
 * dragging in `server-only`-marked services.
 */

export interface TitleContext {
  villa?: string | null;
  checkout_date?: string | null;
  checkin_date?: string | null;
  booking_code?: string | null;
}

export function applyTitleTemplate(template: string, ctx: TitleContext): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = ctx[key as keyof TitleContext];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}
