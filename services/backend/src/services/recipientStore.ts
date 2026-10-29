import type { CareRecipient } from "./medicationTypes.js";

export async function listRecipients(assets: KVNamespace, orgId: string): Promise<CareRecipient[]> {
  const recipients: CareRecipient[] = [];
  let cursor: string | undefined;
  do {
    const page = await assets.list({ prefix: `${orgId}:recipient:`, cursor });
    for (const { name } of page.keys) {
      const value = await assets.get(name);
      if (value) recipients.push(JSON.parse(value) as CareRecipient);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return recipients;
}

export async function addRecipient(
  assets: KVNamespace,
  orgId: string,
  body: Omit<CareRecipient, "id"> & { id?: string }
): Promise<CareRecipient | null> {
  const recipient: CareRecipient = { ...body, id: body.id ?? crypto.randomUUID() };
  const key = `${orgId}:recipient:${recipient.id}`;
  if (await assets.get(key)) return null;
  await assets.put(key, JSON.stringify(recipient));
  return recipient;
}
