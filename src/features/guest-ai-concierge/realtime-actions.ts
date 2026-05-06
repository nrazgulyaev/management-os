"use server";

import {
  markGuestRepliesReadAction,
  markStaffRepliesReadAction,
} from "./read-receipts-actions";

/**
 * V9M — re-exports the existing read-receipt actions so the realtime
 * client can import them through a single module name. The real
 * implementations are idempotent (`INSERT ... ON CONFLICT DO NOTHING`)
 * and rate-limit-friendly, which is what the SSE client relies on
 * to avoid read-receipt loops.
 *
 * No new mutations land here in v9M — the realtime layer is
 * deliberately read-only beyond debounced read receipts.
 */

export {
  markGuestRepliesReadAction,
  markStaffRepliesReadAction,
};
