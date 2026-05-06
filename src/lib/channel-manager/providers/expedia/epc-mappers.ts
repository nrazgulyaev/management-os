/**
 * Stage 6.P1.D.3 — Expedia Partner Central (EPC) modern REST/JSON mappers.
 *
 * EPC handles the non-AR endpoints (amenities, property metadata,
 * reservation detail when needed). Pure helpers — no I/O.
 *
 * The EQC SOAP path covers inventory/rates/booking pull; EPC mappers
 * mostly shape outbound JSON for PUT/POST endpoints.
 */

export interface EPCAmenitiesBody {
  amenityCodes: string[];
}

export function mapAmenitiesToEPC(amenities: string[]): EPCAmenitiesBody {
  return { amenityCodes: [...amenities] };
}
