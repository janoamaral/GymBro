'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div className="flex items-center gap-3">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-[#d6ff43]' : 'bg-gray-600'
        }`}
        role="switch"
        aria-checked={checked}
      >
        <div
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-gray-900 transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
