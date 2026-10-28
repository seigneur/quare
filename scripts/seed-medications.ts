const recipients = [
  {
    id: "recipient-001",
    name: "Margaret Chen",
    dateOfBirth: "1942-03-15",
    notes: "Prefers morning medications with breakfast. Has mild shellfish allergy.",
  },
  {
    id: "recipient-002",
    name: "Harold Thompson",
    dateOfBirth: "1938-07-22",
    notes: "Night owl schedule. Takes medications after 9 pm with evening snack.",
  },
];

const medications = [
  {
    recipientId: "recipient-001",
    name: "Lisinopril",
    dosage: "10 mg",
    form: "Tablet",
    instructions: "Take once daily in the morning with water",
    color: "blue",
    times: ["08:00"],
    startDate: "2024-01-15",
  },
  {
    recipientId: "recipient-001",
    name: "Metformin",
    dosage: "500 mg",
    form: "Tablet",
    instructions: "Take with meals to reduce stomach upset",
    color: "green",
    times: ["08:00", "18:00"],
    startDate: "2024-02-01",
  },
  {
    recipientId: "recipient-001",
    name: "Atorvastatin",
    dosage: "20 mg",
    form: "Tablet",
    instructions: "Take at bedtime",
    color: "purple",
    times: ["21:00"],
    startDate: "2024-01-15",
  },
  {
    recipientId: "recipient-001",
    name: "Aspirin",
    dosage: "81 mg",
    form: "Tablet",
    instructions: "Take with breakfast",
    color: "red",
    times: ["08:00"],
    startDate: "2024-01-15",
  },
  {
    recipientId: "recipient-002",
    name: "Amlodipine",
    dosage: "5 mg",
    form: "Tablet",
    instructions: "Take once daily at the same time each day",
    color: "orange",
    times: ["21:00"],
    startDate: "2023-11-01",
  },
];

const apiBase = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
const orgId = process.env.ORG_ID ?? process.env.NEXT_PUBLIC_ORG_ID;
const adminKey = process.env.ADMIN_KEY;

if (!apiBase || !orgId || !adminKey) {
  throw new Error("Set API_URL, ORG_ID, and ADMIN_KEY before seeding medications");
}

async function post(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed (${response.status}): ${await response.text()}`);
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "X-Admin-Key": adminKey },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function seed(): Promise<void> {
  const orgPath = encodeURIComponent(orgId);
  const existingRecipients = await get<Array<{ id: string }>>(`/api/recipients/${orgPath}`);
  for (const recipient of recipients) {
    if (!existingRecipients.some((existing) => existing.id === recipient.id)) {
      await post(`/api/recipients/${orgPath}`, recipient);
    }
  }
  const existingMedications = await get<Array<{
    name: string;
    medication?: { recipientId: string };
  }>>(`/api/medications/${orgPath}`);
  for (const medication of medications) {
    if (existingMedications.some(
      (existing) => existing.name === medication.name &&
        existing.medication?.recipientId === medication.recipientId
    )) continue;
    await post(`/assets/${orgPath}`, {
      name: medication.name,
      status: "In use",
      location: "",
      assignee: medication.recipientId,
      category: "Medication",
      fields: {},
      files: [],
      kind: "medication",
      medication: {
        recipientId: medication.recipientId,
        dosage: medication.dosage,
        form: medication.form,
        instructions: medication.instructions,
        color: medication.color,
        schedule: { type: "daily", times: medication.times },
        startDate: medication.startDate,
        timezone: "Asia/Singapore",
        active: true,
      },
    });
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
