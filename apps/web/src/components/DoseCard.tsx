"use client";

import { useState } from "react";
import type { DoseOccurrence } from "@/lib/types";
import { ColorBadge } from "./ColorBadge";
import { MedicationInsightPanel } from "./MedicationInsightPanel";
import { updateDoseStatus } from "@/lib/medication-api";

interface DoseCardProps {
  dose: DoseOccurrence;
  onStatusChange: (updated: DoseOccurrence) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLES: Record<string, string> = {
  pending: "border-gray-700 bg-gray-800/60",
  taken: "border-green-800 bg-green-900/20",
  missed: "border-red-800 bg-red-900/20",
  skipped: "border-gray-700 bg-gray-800/40 opacity-70",
  rescheduled: "border-yellow-800 bg-yellow-900/20",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-700 text-gray-200",
  taken: "bg-green-800 text-green-200",
  missed: "bg-red-800 text-red-200",
  skipped: "bg-gray-700 text-gray-400",
  rescheduled: "bg-yellow-800 text-yellow-200",
};

export function DoseCard({ dose, onStatusChange }: DoseCardProps) {
  const [busy, setBusy] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentStatus = dose.status;

  async function markAs(status: DoseOccurrence["status"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateDoseStatus(dose.id, status);
      onStatusChange(updated);
    } catch {
      setError("Could not save this dose status. No change was confirmed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const isPending = currentStatus === "pending";
  const isTaken = currentStatus === "taken";

  return (
    <>
      <div
        className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${STATUS_STYLES[currentStatus] ?? STATUS_STYLES.pending}`}
      >
        {/* Header row */}
        <div className="flex items-center gap-3">
          <ColorBadge color={dose.medicationColor} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate" style={{ fontSize: "var(--body-font-size)" }}>
              {dose.medicationName}
            </p>
            <p className="text-gray-400 text-sm">{dose.dosage} - {formatTime(dose.scheduledAt)}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_BADGE[currentStatus]}`}>
            {currentStatus}
          </span>
        </div>

        {/* Action row */}
        <div className="flex gap-2 flex-wrap">
          {isPending && (
            <>
              <button
                onClick={() => markAs("taken")}
                disabled={busy}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-semibold bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors"
              >
                Mark Taken
              </button>
              <button
                onClick={() => markAs("skipped")}
                disabled={busy}
                className="py-2 px-3 rounded-xl text-sm font-semibold text-gray-400 border border-gray-700 hover:border-gray-500 disabled:opacity-50 transition-colors"
              >
                Skip
              </button>
            </>
          )}
          {isTaken && (
            <button
              onClick={() => markAs("pending")}
              disabled={busy}
              className="py-2 px-3 rounded-xl text-sm font-semibold text-gray-400 border border-gray-700 hover:border-gray-500 disabled:opacity-50 transition-colors"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => setShowExplain(true)}
            className="py-2 px-3 rounded-xl text-sm font-semibold text-violet-300 border border-violet-800 hover:bg-violet-900/30 transition-colors ml-auto"
          >
            Explain
          </button>
        </div>
        {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
      </div>

      {showExplain && (
        <MedicationInsightPanel
          medicationId={dose.medicationId}
          medicationName={dose.medicationName}
          onClose={() => setShowExplain(false)}
        />
      )}
    </>
  );
}
