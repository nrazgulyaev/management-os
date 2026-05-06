/**
 * Stage 6.P1.D.3 — Expedia EQC SOAP + EPC REST hybrid client.
 *
 * EQC (legacy SOAP) handles inventory + rates + booking pull. EPC
 * (modern REST) handles amenities + connection test. Both use HTTP
 * Basic with the same eqcUsername/eqcPassword. Native fetch + shared
 * retry envelope.
 *
 * The provider's `productLine` parameter (set by VRBO + Hotels.com
 * subclasses) flips the EPC base URL — Expedia + VRBO + Hotels.com
 * share the EQC SOAP gateway but each has its own EPC namespace.
 */

import { requestWithRetry, type RetryOptions } from "../../http-retry";
import {
  buildEQCAvailability,
  buildEQCBookingPull,
  buildEQCRates,
  type EQCAvailabilityInput,
  type EQCRatesInput,
} from "./eqc-builders";
import { mapAmenitiesToEPC } from "./epc-mappers";
import type { AvailabilityInput, RatesInput } from "../../types";

const EQC_BASE_URLS = {
  sandbox: "https://services-sandbox.expediapartnercentral.com",
  production: "https://services.expediapartnercentral.com",
} as const;

const EPC_BASE_URLS = {
  expedia: {
    sandbox: "https://api-sandbox.ean.com/v3",
    production: "https://api.ean.com/v3",
  },
  vrbo: {
    sandbox: "https://api-sandbox.vrbo.com/v1",
    production: "https://api.vrbo.com/v1",
  },
  hotels_com: {
    sandbox: "https://api-sandbox.hotels.com/v3",
    production: "https://api.hotels.com/v3",
  },
} as const;

export type ExpediaProductLine = "expedia" | "vrbo" | "hotels_com";

export interface ExpediaClientCredentials {
  hotelId: string;
  eqcUsername: string;
  eqcPassword: string;
  environment: "sandbox" | "production";
}

export interface ExpediaClientOptions extends RetryOptions {
  /** Override EQC SOAP base — used by tests + VRBO/Hotels.com if Expedia
   *  ever splits their gateways. Defaults per environment. */
  eqcBase?: string;
  /** Override EPC REST base — used by VRBO + Hotels.com to point at
   *  their own EPC namespaces. Defaults per `productLine`. */
  epcBase?: string;
  /** Which EPC namespace this client uses for REST endpoints. */
  productLine?: ExpediaProductLine;
}

export interface ExpediaClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class ExpediaClient {
  private readonly eqcBase: string;
  private readonly epcBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: ExpediaClientCredentials,
    opts: ExpediaClientOptions = {},
  ) {
    this.eqcBase = opts.eqcBase ?? EQC_BASE_URLS[creds.environment];
    const productLine = opts.productLine ?? "expedia";
    this.epcBase =
      opts.epcBase ?? EPC_BASE_URLS[productLine][creds.environment];
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  get eqcBaseUrl(): string {
    return this.eqcBase;
  }
  get epcBaseUrl(): string {
    return this.epcBase;
  }

  /** HTTP Basic auth header — public for tests + introspection. Never logged. */
  get basicAuthHeader(): string {
    return (
      "Basic " +
      Buffer.from(
        `${this.creds.eqcUsername}:${this.creds.eqcPassword}`,
      ).toString("base64")
    );
  }

  // -------------------------------------------------------------------------
  // EQC SOAP — inventory + rates + booking pull
  // -------------------------------------------------------------------------

  async pushAvailability(input: AvailabilityInput): Promise<ExpediaClientResponse> {
    const xml = buildEQCAvailability(this.eqcAvailabilityInputFor(input));
    return this.postSoap(`${this.eqcBase}/eqc/ar`, xml);
  }

  async pushRates(input: RatesInput): Promise<ExpediaClientResponse> {
    const xml = buildEQCRates(this.eqcRatesInputFor(input));
    return this.postSoap(`${this.eqcBase}/eqc/ar`, xml);
  }

  async pullReservations(params: {
    modifiedSince?: Date;
  } = {}): Promise<ExpediaClientResponse> {
    const xml = buildEQCBookingPull({
      hotelId: this.creds.hotelId,
      username: this.creds.eqcUsername,
      password: this.creds.eqcPassword,
      timestamp: new Date(),
      modifiedSince: params.modifiedSince,
    });
    return this.postSoap(`${this.eqcBase}/eqc/booking`, xml);
  }

  // -------------------------------------------------------------------------
  // EPC REST — amenities + property info
  // -------------------------------------------------------------------------

  async pushAmenities(amenities: string[]): Promise<ExpediaClientResponse> {
    return this.dispatch(
      "PUT",
      `${this.epcBase}/properties/${encodeURIComponent(this.creds.hotelId)}/amenities`,
      mapAmenitiesToEPC(amenities),
    );
  }

  async testConnection(): Promise<ExpediaClientResponse> {
    return this.dispatch(
      "GET",
      `${this.epcBase}/properties/${encodeURIComponent(this.creds.hotelId)}`,
    );
  }

  // -------------------------------------------------------------------------
  // Conversion helpers — chunk single-day inputs into ranges (EQC ARs
  // accept single-day spans but coalescing reduces XML size)
  // -------------------------------------------------------------------------

  private eqcAvailabilityInputFor(
    input: AvailabilityInput,
  ): EQCAvailabilityInput {
    const ranges: EQCAvailabilityInput["ranges"] = [];
    for (const date of [...input.availabilityPerDay.keys()].sort()) {
      const d = new Date(date);
      ranges.push({
        start: d,
        end: d,
        availability: input.availabilityPerDay.get(date) ?? 0,
      });
    }
    return {
      hotelId: this.creds.hotelId,
      roomId: input.externalPropertyId,
      ratePlanId: input.externalPropertyId, // Expedia uses room+ratePlan
      ranges,
      username: this.creds.eqcUsername,
      password: this.creds.eqcPassword,
      timestamp: new Date(),
    };
  }

  private eqcRatesInputFor(input: RatesInput): EQCRatesInput {
    const ranges: EQCRatesInput["ranges"] = [];
    for (const date of [...input.ratesPerDay.keys()].sort()) {
      const r = input.ratesPerDay.get(date)!;
      const d = new Date(date);
      ranges.push({
        start: d,
        end: d,
        amount: Number(r.amountMinor) / 100,
        currency: r.currency,
      });
    }
    return {
      hotelId: this.creds.hotelId,
      roomId: input.externalPropertyId,
      ratePlanId: input.ratePlanId,
      ranges,
      username: this.creds.eqcUsername,
      password: this.creds.eqcPassword,
      timestamp: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Internal — SOAP/JSON dispatch helpers
  // -------------------------------------------------------------------------

  private async postSoap(
    url: string,
    xml: string,
  ): Promise<ExpediaClientResponse> {
    const result = await requestWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: this.basicAuthHeader,
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "",
          Accept: "text/xml",
        },
        body: xml,
      },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  private async dispatch(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<ExpediaClientResponse> {
    const headers: Record<string, string> = {
      Authorization: this.basicAuthHeader,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(jsonBody);
    }
    const result = await requestWithRetry(
      url,
      { method, headers, body },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}
