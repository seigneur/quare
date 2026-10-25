"use client";

import { useEffect, useState } from "react";
import type { MedicationInsight } from "@/lib/types";
import { fetchMedicationInsight } from "@/lib/medication-api";

interface MedicationInsightPanelProps {
  medicationId: string;
  medicationName: string;
  onClose: () => void;
}

export function MedicationInsightPanel({
  medicationId,
  medicationName,
  onClose,
}: MedicationInsightPanelProps) {
  const [insight, setInsight] = useState<MedicationInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    fetchMedicationInsight(medicationId)
      .then(setInsight)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unable to load"))
      .finally(() => setLoading(false));
  }, [medicationId]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 p-6 max-h-[80vh] overflow-y-auto"
        style={{ backgroundColor: "var(--panel-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-white font-bold" style={{ fontSize: "var(--heading-font-size)" }}>
              {medicationName}
            </h2>
            <p className="text-gray-400 text-sm">Plain-language overview</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading && (
          <p className="text-gray-400 text-sm text-center py-8">Loading…</p>
        )}
        {error && (
          <p className="text-red-400 text-sm text-center py-8">{error}</p>
        )}

        {insight && (
          <div className="space-y-5" style={{ fontSize: "var(--body-font-size)" }}>
            {/* What it is for */}
            <section>
              <h3 className="text-violet-300 font-semibold text-sm uppercase tracking-wide mb-1">
                What it is for
              </h3>
              <p className="text-gray-200 leading-relaxed">{insight.indication}</p>
            </section>

            {/* How it helps long term */}
            <section>
              <h3 className="text-violet-300 font-semibold text-sm uppercase tracking-wide mb-1">
                How it helps over time
              </h3>
              <p className="text-gray-200 leading-relaxed">{insight.longTermValue}</p>
            </section>

            {/* Watch-outs */}
            <section>
              <h3 className="text-violet-300 font-semibold text-sm uppercase tracking-wide mb-1">
                Important watch-outs
              </h3>
              <ul className="space-y-1.5">
                {insight.watchOuts.map((item, i) => (
                  <li key={i} className="flex gap-2 text-gray-200 leading-relaxed">
                    <span className="text-yellow-400 mt-0.5 shrink-0">⚠</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Caregiver tips — collapsed by default */}
            {!showMore ? (
              <button
                onClick={() => setShowMore(true)}
                className="text-sm text-violet-300 underline underline-offset-2 hover:text-violet-200"
              >
                Show caregiver tips ↓
              </button>
            ) : (
              <section>
                <h3 className="text-violet-300 font-semibold text-sm uppercase tracking-wide mb-1">
                  Caregiver tips
                </h3>
                <ul className="space-y-1.5">
                  {insight.caregiverTips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-gray-200 leading-relaxed">
                      <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-gray-500 border-t border-white/10 pt-4 leading-relaxed">
              ℹ {insight.disclaimer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
