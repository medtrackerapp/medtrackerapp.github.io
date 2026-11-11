// Firestore over REST with the service account (the same key the cleanup workflow uses).
// firebase-admin needs Node; a Worker only has fetch + WebCrypto, so the OAuth dance is done here.
import { b64u } from "./webpush.js";

const te = new TextEncoder();
let cached = { token: null, until: 0 }; // per-isolate; a cold start just fetches a fresh one

export async function accessToken(serviceAccountJson) {
  if (cached.until > Date.now()) return cached.token;
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = b64u.encode(te.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64u.encode(te.encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", b64u.decode(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, te.encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64u.encode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cached = { token: data.access_token, until: Date.now() + (data.expires_in - 300) * 1000 };
  return cached.token;
}

const root = (projectId) => `projects/${projectId}/databases/(default)/documents`;
const base = (projectId) => `https://firestore.googleapis.com/v1/${root(projectId)}`;

async function call(url, token, body, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`firestore: ${res.status} ${await res.text()}`);
  return res.json();
}

// Patients whose reminders or subscriptions changed since `sinceMs` (the app stamps pushChangedAt)
export async function changedPatients(projectId, token, sinceMs) {
  const rows = await call(`${base(projectId)}:runQuery`, token, {
    structuredQuery: {
      from: [{ collectionId: "patients" }],
      where: { fieldFilter: {
        field: { fieldPath: "pushChangedAt" },
        op: "GREATER_THAN",
        value: { timestampValue: new Date(sinceMs).toISOString() },
      } },
      orderBy: [{ field: { fieldPath: "pushChangedAt" } }],
    },
  });
  return rows.filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split("/").pop(), data: decode(r.document.fields) }));
}

// Several docs in one request (one subrequest however many doses are due this minute)
export async function getDocs(projectId, token, paths) {
  if (!paths.length) return {};
  const rows = await call(`${base(projectId)}:batchGet`, token, {
    documents: paths.map((p) => `${root(projectId)}/${p}`),
  });
  const found = {};
  for (const row of rows) {
    if (row.found) found[row.found.name.replace(`${root(projectId)}/`, "")] = decode(row.found.fields);
  }
  return found;
}

// Drops one dead subscription from the patient doc (push service said 404/410)
export async function deleteSubField(projectId, token, patientId, subKey) {
  const mask = encodeURIComponent(`pushSubs.\`${subKey}\``);
  await call(`${base(projectId)}/patients/${patientId}?updateMask.fieldPaths=${mask}&currentDocument.exists=true`,
    token, { name: `${root(projectId)}/patients/${patientId}` }, "PATCH");
}

// Firestore's typed JSON -> plain objects (just the types this app stores)
export function decode(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

function decodeValue(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return decode(v.mapValue.fields);
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  return null;
}
