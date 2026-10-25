import type { MedicationColor } from "@/lib/types";

const COLOR_CLASSES: Record<MedicationColor, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

const COLOR_LABELS: Record<MedicationColor, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
};

interface ColorBadgeProps {
  color: MedicationColor;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function ColorBadge({ color, size = "md", showLabel = false }: ColorBadgeProps) {
  const sizeClass = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-6 h-6" : "w-4 h-4";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`${sizeClass} rounded-full shrink-0 ${COLOR_CLASSES[color]}`}
        aria-label={`${COLOR_LABELS[color]} medication`}
        role="img"
      />
      {showLabel && <span className="text-sm text-gray-400">{COLOR_LABELS[color]}</span>}
    </span>
  );
}
