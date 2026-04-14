import { EMULATOR_CONFIG } from './emulator-config.js';

const FIRESTORE_URL = `http://${EMULATOR_CONFIG.firestoreHost}`;

export class FirestoreRef {
  constructor(public readonly path: string) {}
}

export class FirestoreTimestamp {
  constructor(public readonly date: Date) {}
}

export async function clearFirestoreEmulator(): Promise<void> {
  const url = `${FIRESTORE_URL}/emulator/v1/projects/${EMULATOR_CONFIG.projectId}/databases/(default)/documents`;
  await fetch(url, { method: 'DELETE' });
}

export async function getFirestoreDoc(
  collectionPath: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_URL}/v1/projects/${EMULATOR_CONFIG.projectId}/databases/(default)/documents/${collectionPath}/${docId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: 'Bearer owner',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(
      `Failed to get Firestore doc ${collectionPath}/${docId}: ${await response.text()}`
    );
  }

  const body = (await response.json()) as { fields?: Record<string, unknown> };
  if (!body.fields) return null;
  return parseFirestoreFields(body.fields);
}

export async function deleteFirestoreDoc(
  collectionPath: string,
  docId: string
): Promise<void> {
  const url = `${FIRESTORE_URL}/v1/projects/${EMULATOR_CONFIG.projectId}/databases/(default)/documents/${collectionPath}/${docId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: 'Bearer owner',
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Failed to delete Firestore doc ${collectionPath}/${docId}: ${await response.text()}`
    );
  }
}

export async function setFirestoreDoc(
  collectionPath: string,
  docId: string,
  data: Record<string, unknown>
): Promise<void> {
  const url = `${FIRESTORE_URL}/v1/projects/${EMULATOR_CONFIG.projectId}/databases/(default)/documents/${collectionPath}/${docId}`;

  const fields = convertToFirestoreFields(data);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer owner',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to set Firestore doc ${collectionPath}/${docId}: ${await response.text()}`
    );
  }
}

function convertToFirestoreFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = convertValue(value);
  }
  return fields;
}

function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (value instanceof FirestoreRef) {
    return {
      referenceValue: `projects/${EMULATOR_CONFIG.projectId}/databases/(default)/documents/${value.path}`,
    };
  }
  if (value instanceof FirestoreTimestamp) {
    return { timestampValue: value.date.toISOString() };
  }
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(convertValue),
      },
    };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: convertToFirestoreFields(
          value as Record<string, unknown>
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function parseFirestoreFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(value as Record<string, unknown>);
  }
  return result;
}

function parseFirestoreValue(value: Record<string, unknown>): unknown {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) {
    const arr = value.arrayValue as { values?: Record<string, unknown>[] };
    return (arr.values ?? []).map(parseFirestoreValue);
  }
  if ('mapValue' in value) {
    const map = value.mapValue as { fields?: Record<string, unknown> };
    return map.fields ? parseFirestoreFields(map.fields) : {};
  }
  return undefined;
}
