interface FullscreenLoaderProps {
  label?: string;
}

export function FullscreenLoader({ label = 'Cargando entrenamiento...' }: Readonly<FullscreenLoaderProps>) {
  return (
    <main className="app-canvas min-h-screen grid place-items-center px-4 py-8">
      <div className="text-center">
        <div className="mx-auto mb-5 h-12 w-12 rounded-full border-2 border-white/20 border-t-accent animate-spin" />
        <p className="font-heading text-base tracking-widest text-gray-200 uppercase">{label}</p>
      </div>
    </main>
  );
}