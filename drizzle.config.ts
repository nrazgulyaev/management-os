import type { Config } from "drizzle-kit";

const url =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgres://placeholder";

export default {
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
