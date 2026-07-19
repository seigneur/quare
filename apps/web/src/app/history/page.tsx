"use client";

import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { fetchDuesDoses } from "@/lib/medication-api";
import { ColorBadge } from "@/components/ColorBadge";
import type { DoseOccurrence } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  taken: "✓ Taken",
  missed: "✗ Missed",
  skipped: "— Skipped",
  rescheduled: "↻ Rescheduled",
  pending: "⏳ Pending",
};

const STATUS_COLOR: Record<string, string> = {
  taken: "#4ade80",
  missed: "#f87171",
  skipped: "#6b7280",
  rescheduled: "#fbbf24",
  pending: "#9ca3af",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [doses, setDoses] = useState<DoseOccurrence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDuesDoses()
      .then((d) => setDoses([...d].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))))
      .finally(() => setLoading(false));
  }, []);

  const past = doses.filter((d) => d.status !== "pending");

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-white font-extrabold mb-2" style={{ fontSize: "calc(var(--heading-font-size) * 1.4)" }}>
          History
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Dose log for today. Full history across dates coming soon.
        </p>

        {loading ? (
          <p className="text-gray-400 text-center py-10">Loading…</p>
        ) : past.length === 0 ? (
          <p className="text-gray-500 text-center py-10 border border-dashed border-white/10 rounded-xl">
            No recorded doses yet today
          </p>
        ) : (
          <div className="space-y-2">
            {past.map((dose) => (
              <div
                key={dose.id}
                className="flex items-center gap-4 rounded-xl border border-white/10 px-4 py-3 bg-white/5"
              >
                <ColorBadge color={dose.medicationColor} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate" style={{ fontSize: "var(--body-font-size)" }}>
                    {dose.medicationName}
                  </p>
                  <p className="text-gray-500 text-xs">{dose.dosage} · {formatDateTime(dose.scheduledAt)}</p>
                </div>
                <span
                  className="text-xs font-semibold shrink-0"
                  style={{ color: STATUS_COLOR[dose.status] ?? "#9ca3af" }}
                >
                  {STATUS_LABEL[dose.status] ?? dose.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* TODO: implement full date-range history via GET /api/doses/history */}
      </main>
    </>
  );
}
