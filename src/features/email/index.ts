/**
 * Stage 10.G — Transactional email surface barrel.
 *
 * Thin operator-facing path for one-off emails (welcome, trial expiry,
 * password reset confirmations). Distinct from the queued notification
 * fan-out under src/features/notifications/.
 *
 * Stage 10.L will wire send.ts to Resend; templates + types stay stable.
 */

export { sendEmail } from "./send";
export type {
  EmailTemplate,
  RenderedEmail,
  SendEmailResult,
} from "./templates/types";
export {
  welcomeEmailTemplate,
  type WelcomeEmailData,
} from "./templates/welcome";
export {
  trialExpiryEmailTemplate,
  bucketForDaysRemaining,
  type TrialExpiryEmailData,
} from "./templates/trial-expiry";
