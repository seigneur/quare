"use client";

import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { MedicationCard } from "@/components/MedicationCard";
import { fetchMedications, fetchRecipients } from "@/lib/medication-api";
import type { Medication, CareRecipient } from "@/lib/types";

export default function MedicationsPage() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [recipients, setRecipients] = useState<CareRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    Promise.all([fetchMedications(), fetchRecipients()])
      .then(([meds, recs]) => {
        setMedications(meds);
        setRecipients(recs);
      })
      .finally(() => setLoading(false));
  }, []);

  const recipientName = (id: string) =>
    recipients.find((r) => r.id === id)?.name ?? id;

  const filtered =
    filter === "all" ? medications : medications.filter((m) => m.recipientId === filter);

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-white font-extrabold mb-2" style={{ fontSize: "calc(var(--heading-font-size) * 1.4)" }}>
          Medications
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Color-coded for quick identification. Tap <strong className="text-violet-300">Explain</strong> to learn about any medication.
        </p>

        {/* Recipient filter */}
        {recipients.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => setFilter("all")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: filter === "all" ? "rgba(124,58,237,0.3)" : "transparent",
                color: filter === "all" ? "#fff" : "#9ca3af",
                border: filter === "all" ? "1px solid #7c3aed" : "1px solid transparent",
              }}
            >
              All
            </button>
            {recipients.map((r) => (
              <button
                key={r.id}
                onClick={() => setFilter(r.id)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: filter === r.id ? "rgba(124,58,237,0.3)" : "transparent",
                  color: filter === r.id ? "#fff" : "#9ca3af",
                  border: filter === r.id ? "1px solid #7c3aed" : "1px solid transparent",
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-10">Loading medications…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-10">No medications found</p>
        ) : (
          <div className="space-y-4">
            {/* Group by recipient */}
            {recipients
              .filter((r) => filter === "all" || r.id === filter)
              .map((recipient) => {
                const meds = filtered.filter((m) => m.recipientId === recipient.id);
                if (meds.length === 0) return null;
                return (
                  <div key={recipient.id}>
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
                      {recipientName(recipient.id)}
                    </p>
                    <div className="space-y-3">
                      {meds.map((m) => (
                        <MedicationCard key={m.id} medication={m} />
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </main>
    </>
  );
}
