'use client';

interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label?: string;
}

export function Toggle({ checked, onChange, label }: Readonly<ToggleProps>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0f141b]/85 p-3">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full border transition-colors ${
          checked
            ? 'border-[#d6ff43]/50 bg-[#d6ff43]/28 shadow-[0_0_18px_rgba(214,255,67,0.34)]'
            : 'border-white/20 bg-[#1c2430]'
        }`}
          title={label ?? 'Toggle'}
      >
        <div
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[#e8f3ff] transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
