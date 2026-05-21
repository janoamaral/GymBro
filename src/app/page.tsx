import { auth0 } from "@/lib/auth0";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import MainDashboard from "@/components/main-dashboard";

export default async function Home() {
  if (process.env.E2E_AUTH_BYPASS === "true") {
    const user = await getOrCreateCurrentUser();
    const userName = user.displayName ?? user.name ?? "E2E User";

    return (
      <MainDashboard
        userName={userName}
        userPicture={user.avatarUrl}
      />
    );
  }

  const session = await auth0.getSession();

  if (!session) {
    return (
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div>
            <p className="text-xs tracking-[0.3em] text-muted">GymBro</p>
            <h1 className="mt-3 font-heading text-7xl leading-none text-accent sm:text-8xl">
              LIFT.<br />TRACK.<br />PROGRESS.
            </h1>
            <p className="mt-4 text-base text-muted">
              Programación 5/3/1, calculadora de discos y registro de entrenamientos en un solo lugar.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href="/auth/login?screen_hint=signup"
              className="flex h-13 w-full items-center justify-center rounded-2xl bg-accent text-lg font-semibold text-black"
            >
              Crear cuenta
            </a>
            <a
              href="/auth/login"
              className="flex h-13 w-full items-center justify-center rounded-2xl border border-accent/30 text-lg font-semibold text-foreground hover:border-accent/60"
            >
              Iniciar sesión
            </a>
          </div>
        </div>
      </main>
    );
  }

  const user = await getOrCreateCurrentUser();
  const userName = user.displayName ?? user.name ?? session.user.name ?? session.user.email ?? "Athlete";
  const sessionPicture = typeof session.user.picture === "string" ? session.user.picture : null;
  const userPicture = user.avatarUrl ?? sessionPicture;

  return (
    <MainDashboard
      userName={userName}
      userPicture={userPicture}
    />
  );
}
