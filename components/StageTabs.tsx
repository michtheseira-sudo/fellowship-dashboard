"use client";

export default function StageTabs({
  labels,
  active,
  onChange,
}: {
  labels: string[];
  active: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 mb-4 border-b border-line">
      {labels.map((label, i) => (
        <button
          key={label}
          onClick={() => onChange(i)}
          className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
            active === i
              ? "border-brand1 text-brand1 font-medium"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
