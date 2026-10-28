"use client";

import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { DoseCard } from "@/components/DoseCard";
import { fetchAdherence, fetchDuesDoses } from "@/lib/medication-api";
import type { AdherenceSummary, DoseOccurrence } from "@/lib/types";

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-white font-bold" style={{ fontSize: "var(--heading-font-size)" }}>
          {title}
        </h2>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-800 text-violet-200">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-gray-500 text-sm py-4 text-center rounded-xl border border-dashed border-white/10">
      {message}
    </p>
  );
}

export default function DashboardPage() {
  const [doses, setDoses] = useState<DoseOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adherence, setAdherence] = useState<AdherenceSummary | null>(null);
  const [adherenceLoading, setAdherenceLoading] = useState(true);
  const [adherenceError, setAdherenceError] = useState<string | null>(null);
  const [adherenceRevision, setAdherenceRevision] = useState(0);

  useEffect(() => {
    let active = true;
    fetchDuesDoses()
      .then((data) => {
        if (active) setDoses(data);
      })
      .catch(() => {
        if (active) setError("Could not load the schedule. Check your connection and admin key, then reload.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setAdherenceLoading(true);
    setAdherenceError(null);
    fetchAdherence()
      .then((data) => {
        if (active) setAdherence(data);
      })
      .catch(() => {
        if (active) setAdherenceError("Could not load adherence data.");
      })
      .finally(() => {
        if (active) setAdherenceLoading(false);
      });
    return () => { active = false; };
  }, [adherenceRevision]);

  function handleStatusChange(updated: DoseOccurrence) {
    setDoses((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setAdherenceRevision((prev) => prev + 1);
  }

  const now = new Date();

  const overdue = doses.filter(
    (d) => d.status === "missed" || (d.status === "pending" && new Date(d.scheduledAt) < now)
  );
  const dueNow = doses.filter(
    (d) =>
      d.status === "pending" &&
      new Date(d.scheduledAt) >= now &&
      new Date(d.scheduledAt).getTime() - now.getTime() <= 60 * 60 * 1000
  );
  const upcoming = doses.filter(
    (d) =>
      d.status === "pending" &&
      new Date(d.scheduledAt).getTime() - now.getTime() > 60 * 60 * 1000
  );

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-gray-400 text-center">Loading the schedule...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-white font-extrabold" style={{ fontSize: "calc(var(--heading-font-size) * 1.4)" }}>
            Dose Schedule
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        <Section title="Adherence in the last 30 days">
          {adherenceLoading ? (
            <p className="text-gray-400 text-sm">Loading adherence...</p>
          ) : adherenceError ? (
            <p role="alert" className="text-red-300 text-sm">{adherenceError}</p>
          ) : adherence && (
            <p className="text-gray-300 text-sm">
              {adherence.adherence === null
                ? "No observations yet"
                : `${Math.round(adherence.adherence * 100)}% adherence`}
              {" - "}{adherence.taken} taken, {adherence.missed} missed
            </p>
          )}
        </Section>

        {error ? (
          <p role="alert" className="text-red-300 text-center py-6">{error}</p>
        ) : (
          <>
            <Section title="Overdue" badge={overdue.length > 0 ? String(overdue.length) : undefined}>
              {overdue.length === 0 ? (
                <EmptyState message="No overdue doses" />
              ) : (
                <div className="space-y-3">
                  {overdue.map((d) => (
                    <DoseCard key={d.id} dose={d} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Due Now" badge={dueNow.length > 0 ? String(dueNow.length) : undefined}>
              {dueNow.length === 0 ? (
                <EmptyState message="No doses due in the next hour" />
              ) : (
                <div className="space-y-3">
                  {dueNow.map((d) => (
                    <DoseCard key={d.id} dose={d} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Upcoming">
              {upcoming.length === 0 ? (
                <EmptyState message="No upcoming doses in the next 12 hours" />
              ) : (
                <div className="space-y-3">
                  {upcoming.map((d) => (
                    <DoseCard key={d.id} dose={d} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </main>
    </>
  );
}
