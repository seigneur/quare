"use client";

import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { fetchDoseHistory } from "@/lib/medication-api";
import { ColorBadge } from "@/components/ColorBadge";
import type { DoseOccurrence } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  taken: "Taken",
  missed: "Missed",
  skipped: "Skipped",
  rescheduled: "Rescheduled",
  pending: "Pending",
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 30);
    fetchDoseHistory(from.toISOString(), to.toISOString())
      .then((d) => {
        if (active) setDoses([...d].sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt)));
      })
      .catch(() => {
        if (active) setError("Could not load dose history. Check your connection and admin key, then reload.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-white font-extrabold mb-2" style={{ fontSize: "calc(var(--heading-font-size) * 1.4)" }}>
          History
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Dose log for the last 30 days.
        </p>

        {loading ? (
          <p className="text-gray-400 text-center py-10">Loading...</p>
        ) : error ? (
          <p role="alert" className="text-red-300 text-center py-10">{error}</p>
        ) : doses.length === 0 ? (
          <p className="text-gray-500 text-center py-10 border border-dashed border-white/10 rounded-xl">
            No doses found in the last 30 days
          </p>
        ) : (
          <div className="space-y-2">
            {doses.map((dose) => (
              <div
                key={dose.id}
                className="flex items-center gap-4 rounded-xl border border-white/10 px-4 py-3 bg-white/5"
              >
                <ColorBadge color={dose.medicationColor} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate" style={{ fontSize: "var(--body-font-size)" }}>
                    {dose.medicationName}
                  </p>
                  <p className="text-gray-500 text-xs">{dose.dosage} - {formatDateTime(dose.scheduledAt)}</p>
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
      </main>
    </>
  );
}
