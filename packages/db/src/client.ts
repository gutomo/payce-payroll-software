import { PrismaClient } from "@prisma/client";

/** Create a fresh base (un-scoped) Prisma client. Platform-plane code uses this directly. */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

let singleton: PrismaClient | undefined;

/** Lazily-created process-wide client for scripts/seeds. App code should prefer DI. */
export function getPrismaClient(): PrismaClient {
  singleton ??= createPrismaClient();
  return singleton;
}

// Re-export the generated client surface (PrismaClient, Prisma namespace, enums, model types).
export * from "@prisma/client";
