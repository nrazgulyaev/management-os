import type {
  AmenitiesInput,
  AvailabilityInput,
  ChannelManagerProvider,
  ChannelName,
  ChannelReservationData,
  ConnectionTestResult,
  PullReservationsInput,
  RatesInput,
  SyncResult,
  WebhookEvent,
} from "../types";

/**
 * Stage 6.P1.A — DryRun channel provider.
 *
 * Returned by `selectChannelProvider` whenever credentials are absent.
 * Acts as the safe default for the platform: every push reports success
 * (with `apiCallsCount: 0` so cost dashboards don't get polluted), every
 * pull returns an empty list, every webhook verification fails closed
 * (because there's no shared secret to verify against).
 *
 * This is NOT a stub — it's an explicit "channel is not connected" mode.
 * The platform can run end-to-end without any real credentials.
 */
export class DryRunChannelProvider implements ChannelManagerProvider {
  constructor(public readonly name: ChannelName) {}

  async pushAvailability(input: AvailabilityInput): Promise<SyncResult> {
    return this.dryRunResult(input.availabilityPerDay.size);
  }

  async pushRates(input: RatesInput): Promise<SyncResult> {
    return this.dryRunResult(input.ratesPerDay.size);
  }

  async pushAmenities(input: AmenitiesInput): Promise<SyncResult> {
    return this.dryRunResult(input.amenities.length);
  }

  async pullReservations(
    _input: PullReservationsInput,
  ): Promise<ChannelReservationData[]> {
    return [];
  }

  /**
   * Always false: with no shared secret we cannot meaningfully verify a
   * signature. Webhook routes should refuse to process anything from a
   * connection in DryRun mode anyway — they read connection.credentials
   * up front and bail before reaching here.
   */
  verifyWebhook(_payload: string, _signature: string, _secret: string): boolean {
    return false;
  }

  parseWebhook(_payload: Record<string, unknown>): WebhookEvent | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      connected: false,
      details: {
        mode: "dry-run",
        reason: "No credentials configured",
        channel: this.name,
      },
    };
  }

  private dryRunResult(recordCount: number): SyncResult {
    return {
      success: true,
      recordsProcessed: recordCount,
      recordsSucceeded: recordCount,
      recordsFailed: 0,
      errors: [],
      durationMs: 0,
      apiCallsCount: 0,
    };
  }
}
