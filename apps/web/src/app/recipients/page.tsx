"use client";

import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { fetchRecipients } from "@/lib/medication-api";
import type { CareRecipient } from "@/lib/types";

function age(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let y = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) y--;
  return y;
}

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<CareRecipient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecipients()
      .then(setRecipients)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-white font-extrabold mb-2" style={{ fontSize: "calc(var(--heading-font-size) * 1.4)" }}>
          Recipients
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Care recipients whose medications you manage.
        </p>

        {loading ? (
          <p className="text-gray-400 text-center py-10">Loading…</p>
        ) : recipients.length === 0 ? (
          <p className="text-gray-500 text-center py-10">No recipients added yet</p>
        ) : (
          <div className="space-y-4">
            {recipients.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-white/10 p-5 bg-white/5"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                    style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}
                  >
                    {r.name[0]}
                  </div>
                  <div>
                    <p className="text-white font-semibold" style={{ fontSize: "var(--body-font-size)" }}>
                      {r.name}
                    </p>
                    {r.dateOfBirth && (
                      <p className="text-gray-400 text-sm">Age {age(r.dateOfBirth)}</p>
                    )}
                  </div>
                </div>
                {r.notes && (
                  <p className="text-gray-400 text-sm leading-relaxed">{r.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-gray-600 text-xs text-center mt-8">
          Adding and editing recipients coming soon.
        </p>
      </main>
    </>
  );
}
