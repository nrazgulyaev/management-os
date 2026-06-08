/**
 * SSRF guard for server-side fetches of user/operator-supplied URLs
 * (calendar feeds, outbound webhooks).
 *
 * `assertPublicUrl` validates the scheme, blocks embedded credentials,
 * resolves the hostname via DNS, and rejects if ANY resolved address is
 * loopback / private / link-local / unique-local / reserved (checking all
 * A/AAAA records). `isObviouslyPrivateUrl` is a synchronous best-effort
 * pre-check for zod schemas (UX only — the authoritative guard is
 * assertPublicUrl at fetch time).
 *
 * Known limitation (documented, deferred): DNS-rebinding TOCTOU is not
 * fully closed — assertPublicUrl resolves, then fetch() re-resolves. The
 * realistic operator-paste-metadata-URL attack IS closed (incl. IPv4 and
 * IPv4-mapped-IPv6 literals + redirect:"error" on the fetch). Full
 * mitigation needs IP pinning (custom undici dispatcher) — follow-up.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** IPv4 ranges that must never be fetched from a user-supplied URL. */
function isBlockedIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → reject
  }
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function normalizeIPv6(ip: string): string {
  return ip.replace(/^\[/, "").replace(/\]$/, "").toLowerCase().split("%")[0];
}

/**
 * Extract the embedded IPv4 from an IPv4-mapped/compat IPv6 address,
 * whether written dotted (::ffff:127.0.0.1) OR hex-compressed
 * (::ffff:7f00:1, which is how `new URL()` renders a bracketed mapped
 * literal). Returns the dotted IPv4 or null. This closes the bypass where
 * http://[::ffff:169.254.169.254]/ reaches the metadata endpoint.
 */
function embeddedIPv4(ip: string): string | null {
  // dotted forms: ::ffff:a.b.c.d  or  ::a.b.c.d (deprecated v4-compatible)
  const dotted = ip.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];
  // hex-compressed mapped form: ::ffff:hhhh:llll
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function isBlockedIPv6(raw: string): boolean {
  const ip = normalizeIPv6(raw);
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified

  const v4 = embeddedIPv4(ip);
  if (v4) return isBlockedIPv4(v4);

  const first = parseInt(ip.split(":")[0] || "0", 16) || 0;
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10 link-local
  if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7 unique-local
  return false;
}

function isBlockedIP(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedIPv4(ip);
  if (fam === 6) return isBlockedIPv6(ip);
  return true; // not a valid IP literal → reject to be safe
}

function bareHost(url: URL): string {
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

/**
 * Synchronous best-effort check for zod schema refines: rejects non-http(s)
 * schemes, embedded credentials, localhost/metadata hosts, and literal-IP
 * hosts in a blocked range. Cannot resolve DNS — the authoritative guard is
 * assertPublicUrl at fetch time. Parses via `new URL()` first so octal/hex/
 * decimal IP obfuscation is normalized.
 */
export function isObviouslyPrivateUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true; // unparseable → reject
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (url.username || url.password) return true;
  const host = bareHost(url);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  if (net.isIP(host)) return isBlockedIP(host);
  return false;
}

/**
 * Assert that `rawUrl` is a public http(s) URL safe to fetch server-side.
 * Throws SsrfError on a disallowed scheme, embedded credentials, an
 * allowlist miss, or a host that resolves to a blocked IP. Returns the
 * parsed URL.
 */
export async function assertPublicUrl(
  rawUrl: string,
  opts: { allowHosts?: string[] } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Disallowed scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SsrfError("URLs with embedded credentials are not allowed");
  }
  const host = bareHost(url);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal"
  ) {
    throw new SsrfError(`Blocked host: ${host}`);
  }
  if (opts.allowHosts && opts.allowHosts.length > 0) {
    const ok = opts.allowHosts.some(
      (h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`),
    );
    if (!ok) throw new SsrfError(`Host not in allowlist: ${host}`);
  }
  // Literal IP host: check directly (no DNS needed).
  if (net.isIP(host)) {
    if (isBlockedIP(host)) throw new SsrfError(`Blocked IP address: ${host}`);
    return url;
  }
  // Hostname: resolve ALL addresses and reject if any is blocked.
  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`DNS resolution failed for ${host}`);
  }
  if (resolved.length === 0) throw new SsrfError(`No DNS records for ${host}`);
  for (const r of resolved) {
    if (isBlockedIP(r.address)) {
      throw new SsrfError(`${host} resolves to a blocked address`);
    }
  }
  return url;
}
