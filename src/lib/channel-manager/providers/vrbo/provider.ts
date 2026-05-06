/**
 * Stage 6.P1.D.4 — VRBO ChannelManagerProvider.
 *
 * VRBO was acquired by Expedia and runs on the same EQC SOAP gateway
 * for inventory/rates/booking pull. Differences vs the parent
 * ExpediaProvider:
 *   - `name = "vrbo"` so the unified inbox + sync_log can filter by
 *     channel correctly.
 *   - EPC namespace points at the VRBO product line for amenity
 *     pushes + property metadata reads (set by the productLine flag
 *     in ExpediaClient).
 *   - Vacation-rental focus means longer typical stays and different
 *     rate plan structures — handled by the operator's mapping config,
 *     not the provider class itself.
 */

import { ExpediaProvider } from "../expedia/provider";
import type { ExpediaClientOptions } from "../expedia/client";
import type { VRBOCredentials } from "../../types";

export class VRBOProvider extends ExpediaProvider {
  constructor(
    credentials: VRBOCredentials,
    clientOptions: ExpediaClientOptions = {},
  ) {
    super(
      {
        channel: "vrbo",
        hotelId: credentials.hotelId,
        eqcUsername: credentials.eqcUsername,
        eqcPassword: credentials.eqcPassword,
        environment: credentials.environment,
      },
      clientOptions,
    );
  }
}
