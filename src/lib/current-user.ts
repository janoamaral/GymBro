import { auth0 } from "@/lib/auth0";
import { db } from "@/lib/db";

const FALLBACK_AUTH0_ID = "demo|local";
const FALLBACK_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@gymbro.local";

export async function getOrCreateCurrentUser() {
  const session = await auth0.getSession();

  const auth0Id = session?.user.sub ?? FALLBACK_AUTH0_ID;
  const email = session?.user.email ?? FALLBACK_EMAIL;
  const name = session?.user.name ?? "GymBro Demo";

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
    },
  });
}
