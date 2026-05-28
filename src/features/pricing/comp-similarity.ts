/**
 * Phase 2.4 mgmt-02 — Comp set similarity scoring.
 *
 * Score 0..100 between our villa and a candidate external listing.
 * Weights:
 *   bedrooms        25
 *   capacity        15
 *   location radius 25 (km decay)
 *   amenities       15 (Jaccard on key amenities)
 *   price-tier      10 (ADR delta proxy)
 *   photo similarity 10 (placeholder until vision model wires)
 */

export interface OurVilla {
  bedrooms: number;
  capacity: number;
  lat: number;
  lng: number;
  amenities: string[];
  adrUsd?: number;
}

export interface CompCandidate {
  bedrooms: number;
  capacity: number;
  lat: number;
  lng: number;
  amenities: string[];
  adrUsd?: number;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a.map((x) => x.toLowerCase()));
  const sb = new Set(b.map((x) => x.toLowerCase()));
  let inter = 0;
  for (const v of sa) if (sb.has(v)) inter++;
  const uni = sa.size + sb.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

export interface ScoreBreakdown {
  total: number;
  parts: { label: string; max: number; got: number }[];
}

export function scoreSimilarity(us: OurVilla, them: CompCandidate): ScoreBreakdown {
  const parts: { label: string; max: number; got: number }[] = [];

  const bedDelta = Math.abs(us.bedrooms - them.bedrooms);
  parts.push({ label: "bedrooms", max: 25, got: Math.max(0, 25 - bedDelta * 12) });

  const capDelta = Math.abs(us.capacity - them.capacity);
  parts.push({ label: "capacity", max: 15, got: Math.max(0, 15 - capDelta * 4) });

  const km = haversineKm(us, them);
  // 0 km → 25, 5 km → 0, linear decay
  parts.push({ label: "location", max: 25, got: Math.max(0, 25 * (1 - km / 5)) });

  parts.push({ label: "amenities", max: 15, got: jaccard(us.amenities, them.amenities) * 15 });

  if (us.adrUsd != null && them.adrUsd != null) {
    const ratio = Math.min(us.adrUsd, them.adrUsd) / Math.max(us.adrUsd, them.adrUsd);
    parts.push({ label: "price-tier", max: 10, got: ratio * 10 });
  } else {
    parts.push({ label: "price-tier", max: 10, got: 0 });
  }

  // Vision-model placeholder.
  parts.push({ label: "photos", max: 10, got: 0 });

  const total = Math.round(parts.reduce((sum, p) => sum + p.got, 0));
  return { total, parts };
}
