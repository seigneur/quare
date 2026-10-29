// API client for the caregiver medication management endpoints.

import type { CareRecipient, Medication, DoseOccurrence, MedicationInsight, DoseStatus, AdherenceSummary } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "";

function adminHeaders(): HeadersInit {
  const adminKey = typeof window !== "undefined"
    ? localStorage.getItem("quare_admin_key") ?? ""
    : "";
  return { "X-Admin-Key": adminKey };
}

interface MedicationAsset {
  recordId: string;
  name: string;
  kind?: "generic" | "medication";
  medication?: {
    recipientId: string;
    dosage: string;
    form: string;
    instructions?: string;
    color: Medication["color"];
    schedule: {
      type: Medication["scheduleType"];
      times: string[];
      days?: number[];
    };
    startDate: string;
    endDate?: string;
    active: boolean;
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("no-api");
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`api-error-${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchRecipients(): Promise<CareRecipient[]> {
  try {
    return await apiFetch<CareRecipient[]>(`/api/recipients/${encodeURIComponent(ORG_ID)}`, {
      headers: adminHeaders(),
    });
  } catch {
    return [];
  }
}

export async function fetchMedications(recipientId?: string): Promise<Medication[]> {
  try {
    const query = recipientId ? `?recipientId=${encodeURIComponent(recipientId)}` : "";
    const assets = await apiFetch<MedicationAsset[]>(
      `/api/medications/${encodeURIComponent(ORG_ID)}${query}`,
      { headers: adminHeaders() }
    );
    return assets.flatMap((asset) => {
      const details = asset.medication;
      if (asset.kind !== "medication" || !details) return [];
      return [{
        id: asset.recordId,
        recipientId: details.recipientId,
        name: asset.name,
        dosage: details.dosage,
        form: details.form,
        instructions: details.instructions,
        color: details.color,
        scheduleType: details.schedule.type,
        scheduleTimes: details.schedule.times,
        scheduleDays: details.schedule.days,
        startDate: details.startDate,
        endDate: details.endDate,
        active: details.active,
      }];
    });
  } catch {
    return [];
  }
}

export async function fetchDuesDoses(): Promise<DoseOccurrence[]> {
  return apiFetch<DoseOccurrence[]>(
    `/api/doses/${encodeURIComponent(ORG_ID)}/due?window=12h`,
    { headers: adminHeaders() }
  );
}

export async function fetchDoseHistory(
  from: string,
  to: string,
  recipientId?: string
): Promise<DoseOccurrence[]> {
  const query = new URLSearchParams({ from, to });
  if (recipientId) query.set("recipientId", recipientId);
  return apiFetch<DoseOccurrence[]>(
    `/api/doses/${encodeURIComponent(ORG_ID)}/history?${query}`,
    { headers: adminHeaders() }
  );
}

export async function fetchAdherence(recipientId?: string): Promise<AdherenceSummary> {
  const query = new URLSearchParams({ days: "30" });
  if (recipientId) query.set("recipientId", recipientId);
  return apiFetch<AdherenceSummary>(
    `/api/adherence/${encodeURIComponent(ORG_ID)}?${query}`,
    { headers: adminHeaders() }
  );
}

export async function updateDoseStatus(
  doseId: string,
  status: DoseStatus,
  notes?: string
): Promise<DoseOccurrence> {
  return apiFetch<DoseOccurrence>(
    `/api/doses/${encodeURIComponent(ORG_ID)}/${encodeURIComponent(doseId)}/status`,
    {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status, source: "web", notes }),
    }
  );
}

export async function fetchMedicationInsight(medicationId: string): Promise<MedicationInsight> {
  return apiFetch<MedicationInsight>(
    `/api/medications/${encodeURIComponent(ORG_ID)}/${encodeURIComponent(medicationId)}/explain`,
    { headers: adminHeaders() }
  );
}
