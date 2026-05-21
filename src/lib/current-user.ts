import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";
import { UnauthorizedError } from "@/lib/http-errors";

export async function getOrCreateCurrentUser() {
  if (process.env.E2E_AUTH_BYPASS === "true") {
    const auth0Id = "e2e-user";

    return db.user.upsert({
      where: { auth0Id },
      update: {
        email: "e2e@gymbro.local",
        name: "E2E User",
      },
      create: {
        auth0Id,
        email: "e2e@gymbro.local",
        name: "E2E User",
      },
    });
  }

  const session = await auth0.getSession();

  if (!session?.user?.sub) {
    throw new UnauthorizedError("AUTH_REQUIRED");
  }

  const auth0Id = session.user.sub;
  const email = session.user.email ?? `${auth0Id}@auth0.local`;
  const name = session.user.name ?? "GymBro User";
  const picture = (session.user.picture as string | undefined) ?? null;

  return db.user.upsert({
    where: { auth0Id },
    update: {
      email,
      name,
    },
    create: {
      auth0Id,
      email,
      name,
      avatarUrl: picture,
    },
  });
}
