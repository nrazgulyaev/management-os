/**
 * Stage 6.P1.D.4 — Hotels.com ChannelManagerProvider.
 *
 * Hotels.com is the third Expedia property line (alongside Expedia
 * and VRBO) and shares the same EQC SOAP gateway. Differences vs the
 * parent ExpediaProvider:
 *   - `name = "hotels_com"` for unified inbox + sync_log filtering.
 *   - EPC namespace points at the Hotels.com product line for amenity
 *     pushes + property metadata reads.
 */

import { ExpediaProvider } from "../expedia/provider";
import type { ExpediaClientOptions } from "../expedia/client";
import type { HotelsComCredentials } from "../../types";

export class HotelsComProvider extends ExpediaProvider {
  constructor(
    credentials: HotelsComCredentials,
    clientOptions: ExpediaClientOptions = {},
  ) {
    super(
      {
        channel: "hotels_com",
        hotelId: credentials.hotelId,
        eqcUsername: credentials.eqcUsername,
        eqcPassword: credentials.eqcPassword,
        environment: credentials.environment,
      },
      clientOptions,
    );
  }
}
