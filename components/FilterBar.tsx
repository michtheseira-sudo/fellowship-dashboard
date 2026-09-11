"use client";

const SEASONS = ["Summer", "Winter"] as const;

export default function FilterBar({
  season,
  onSeasonChange,
}: {
  season: string;
  onSeasonChange: (s: "Summer" | "Winter") => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line pb-4 mb-6">
      <span className="text-xs text-muted mr-2">Season</span>
      {SEASONS.map((s) => (
        <button
          key={s}
          onClick={() => onSeasonChange(s)}
          className={`px-3 py-1.5 text-sm border transition-colors ${
            season === s
              ? "border-brand1 text-brand1 bg-brand1-pastel"
              : "border-line text-muted hover:text-ink"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
