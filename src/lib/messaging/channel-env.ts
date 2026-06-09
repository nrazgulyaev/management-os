import type { MessagingChannel } from "@/lib/db/schema/messaging";

/**
 * The env-var key holding the encrypted per-org credentials for a messaging
 * channel. Pure synchronous helper — it lives OUTSIDE the "use server"
 * inbox-actions module because Server Action files may only export async
 * functions (Next build error: "Server Actions must be async functions").
 */
export function envKeyForChannel(c: MessagingChannel): string | null {
  switch (c) {
    case "whatsapp":
      return "MESSAGING_WHATSAPP_CREDENTIALS";
    case "telegram":
      return "MESSAGING_TELEGRAM_CREDENTIALS";
    case "instagram":
      return "MESSAGING_INSTAGRAM_CREDENTIALS";
    case "facebook_messenger":
      return "MESSAGING_MESSENGER_CREDENTIALS";
    case "email":
      return "MESSAGING_EMAIL_CREDENTIALS";
    case "sms":
      return "MESSAGING_SMS_CREDENTIALS";
    default:
      return null;
  }
}
