"use client";

import { useState } from "react";
import type { Medication } from "@/lib/types";
import { ColorBadge } from "./ColorBadge";
import { MedicationInsightPanel } from "./MedicationInsightPanel";

interface MedicationCardProps {
  medication: Medication;
}

export function MedicationCard({ medication }: MedicationCardProps) {
  const [showExplain, setShowExplain] = useState(false);

  return (
    <>
      <div className="rounded-2xl border border-white/10 p-4 flex gap-4 items-start bg-white/5 hover:bg-white/8 transition-colors">
        <ColorBadge color={medication.color} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-white" style={{ fontSize: "var(--body-font-size)" }}>
                {medication.name}
              </p>
              <p className="text-gray-400 text-sm">{medication.dosage} · {medication.form}</p>
            </div>
            {!medication.active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 shrink-0">
                Inactive
              </span>
            )}
          </div>

          {medication.instructions && (
            <p className="mt-1 text-gray-400 text-sm">{medication.instructions}</p>
          )}

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">
              {medication.scheduleTimes.join(", ")} · {medication.scheduleType}
            </span>
            <button
              onClick={() => setShowExplain(true)}
              className="ml-auto text-sm font-semibold text-violet-300 border border-violet-800 px-3 py-1 rounded-lg hover:bg-violet-900/30 transition-colors"
            >
              Explain
            </button>
          </div>
        </div>
      </div>

      {showExplain && (
        <MedicationInsightPanel
          medicationId={medication.id}
          medicationName={medication.name}
          onClose={() => setShowExplain(false)}
        />
      )}
    </>
  );
}
