import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const DATABASE_URL_ENV_ORDER = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

function isPlaceholderCredentialUrl(url: string): boolean {
  return /username|password|host\/database/i.test(url);
}

function sanitizeDbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

function resolveConnectionString(): string {
  for (const envName of DATABASE_URL_ENV_ORDER) {
    const value = process.env[envName]?.trim();
    if (!value) {
      continue;
    }

    if (isPlaceholderCredentialUrl(value)) {
      throw new Error(
        `DATABASE_CREDENTIALS_PLACEHOLDER_DETECTED:${envName}. Replace sample credentials in ${envName} before deploy.`,
      );
    }

    if (value.startsWith("prisma://")) {
      throw new Error(
        `UNSUPPORTED_DATABASE_PROTOCOL:${envName}. @prisma/adapter-pg requires postgresql:// or postgres:// URL, got prisma://`,
      );
    }

    if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) {
      throw new Error(
        `INVALID_DATABASE_PROTOCOL:${envName}. Expected postgresql:// or postgres://, got ${sanitizeDbUrl(value)}`,
      );
    }

    return value;
  }

  throw new Error(
    "DATABASE_URL_IS_REQUIRED. Set DATABASE_URL or one of: POSTGRES_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING",
  );
}

const connectionString = resolveConnectionString();

if (!connectionString) {
  throw new Error("DATABASE_URL_IS_REQUIRED");
}

const adapter = new PrismaPg(
  new Pool({
    connectionString,
  }),
);

export const db =
  globalThis.prismaGlobal ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = db;
}
