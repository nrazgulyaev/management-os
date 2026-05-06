/**
 * Stage 5.D — AI Marketing Assistant pure helpers.
 */

export type ContentType =
  | "instagram_caption"
  | "instagram_hashtags"
  | "email_subject"
  | "whatsapp_broadcast"
  | "campaign_concept";

export type Language = "en" | "id";

export interface MarketingInput {
  projectName: string;
  villaName?: string;
  /** Tags from photo or asset description, e.g. ["sunset","pool","ocean-view"]. */
  tags: string[];
  contentType: ContentType;
  language: Language;
}

export interface MarketingOutput {
  contentType: ContentType;
  language: Language;
  generatedContent: string;
  hashtags: string[];
  /** Best time to post recommendation (conservative — historical pattern). */
  bestTimeRecommendation: string;
  reasoning: string;
}

const TAG_TO_HASHTAG: Record<string, string> = {
  sunset: "BaliSunset",
  pool: "InfinityPool",
  "ocean-view": "OceanView",
  "rice-field": "SawahLife",
  jungle: "JungleVilla",
  beach: "BaliBeach",
  spa: "WellnessRetreat",
  yoga: "YogaInBali",
};

function tagsToHashtags(tags: string[]): string[] {
  const base = ["BaliVilla", "LuxuryStay", "Arconique"];
  const fromTags = tags
    .map((t) => TAG_TO_HASHTAG[t.toLowerCase()] ?? t.replace(/\s+/g, ""))
    .filter(Boolean);
  return Array.from(new Set([...base, ...fromTags]));
}

function captionEn(input: MarketingInput): string {
  const subject = input.villaName ?? input.projectName;
  const tag = input.tags[0] ?? "tropical living";
  return `Wake up to ${tag} at ${subject}. Designed for those who appreciate the quiet luxury of Bali. ✨`;
}

function captionId(input: MarketingInput): string {
  const subject = input.villaName ?? input.projectName;
  const tag = input.tags[0] ?? "kehidupan tropis";
  return `Bangun pagi disambut ${tag} di ${subject}. Dirancang untuk yang menghargai kemewahan tenang Bali. ✨`;
}

function emailSubject(input: MarketingInput): string {
  const subject = input.villaName ?? input.projectName;
  return `${subject}: Limited Availability — View the Latest`;
}

function whatsappBroadcast(input: MarketingInput): string {
  const subject = input.villaName ?? input.projectName;
  return `Hi! New update from ${subject}. We've made progress this month and have a few units still available. Reply if you'd like the latest brochure.`;
}

function campaignConcept(input: MarketingInput): string {
  return `Concept: a 14-day visual story documenting daily life at ${input.projectName} — from sunrise yoga to sunset dinners — emphasising the slower rhythm of Ubud living.`;
}

export function buildMarketingOutput(input: MarketingInput): MarketingOutput {
  const hashtags = tagsToHashtags(input.tags);
  let content = "";
  let reasoning = "";
  switch (input.contentType) {
    case "instagram_caption":
      content = input.language === "id" ? captionId(input) : captionEn(input);
      reasoning =
        "Single-sentence caption with one tag-driven sensory hook + lightly aspirational close.";
      break;
    case "instagram_hashtags":
      content = hashtags.map((h) => `#${h}`).join(" ");
      reasoning =
        "Mix of brand + location + tag-derived hashtags (no spammy long-tail).";
      break;
    case "email_subject":
      content = emailSubject(input);
      reasoning = "Scarcity hook + clear subject in <60 chars.";
      break;
    case "whatsapp_broadcast":
      content = whatsappBroadcast(input);
      reasoning = "Conversational, reply-friendly opener.";
      break;
    case "campaign_concept":
      content = campaignConcept(input);
      reasoning = "Long-form concept — operator can spin into a brief.";
      break;
  }
  // Conservative best-time recommendation when no historical data.
  const bestTimeRecommendation =
    input.contentType === "whatsapp_broadcast"
      ? "Tuesday or Wednesday, 10:00 local time."
      : "Weekday evenings, 19:00–21:00 local time.";
  return {
    contentType: input.contentType,
    language: input.language,
    generatedContent: content,
    hashtags,
    bestTimeRecommendation,
    reasoning,
  };
}
