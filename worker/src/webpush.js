// Web Push from scratch: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291 / 8188).
// No library: the npm web-push package needs Node APIs that Cloudflare Workers don't have, and
// 150 lines we can test against the RFC's own vector beat a dependency we can't read.
// Everything here runs on WebCrypto, so the same code works in the Worker and in Node's tests.

const te = new TextEncoder();

export const b64u = {
  encode(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(text) {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
  },
};

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// Encrypts a payload for one subscription (RFC 8291). `fixed` injects the sender keypair and salt
// so the test can reproduce the RFC's example; live calls leave it out and get fresh randomness.
export async function encrypt(payload, p256dh, auth, fixed = null) {
  const uaPublic = b64u.decode(p256dh); // the phone's public key, 65 bytes uncompressed
  const authSecret = b64u.decode(auth);
  const asKeys = fixed
    ? await importEcdhPair(fixed.asPublic, fixed.asPrivate)
    : await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));

  // ikm = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public)
  const ikm = await hkdf(authSecret, ecdhSecret, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = fixed ? b64u.decode(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  // One record: payload, the 0x02 "last record" delimiter, then AES-128-GCM
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))));

  // Header: salt (16) | record size 4096 (4) | key length 65 (1) | as_public (65)
  const header = concat(salt, new Uint8Array([0, 0, 16, 0, asPublic.length]), asPublic);
  return concat(header, sealed);
}

async function importEcdhPair(publicB64u, privateB64u) {
  const pub = b64u.decode(publicB64u);
  const jwk = {
    kty: "EC", crv: "P-256",
    x: b64u.encode(pub.slice(1, 33)),
    y: b64u.encode(pub.slice(33, 65)),
    d: privateB64u,
  };
  return {
    privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []),
  };
}

// The VAPID Authorization header (RFC 8292): a short ES256 JWT naming the push service as audience
export async function vapidAuth(endpoint, publicKey, privateJwk, nowMs = Date.now()) {
  const header = b64u.encode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: "https://medtrackerapp.github.io",
  })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.encode(signature)}, k=${publicKey}`;
}

// Sends one push. Returns the push service's status code; 404/410 mean the subscription is dead.
export async function sendPush(sub, payloadObj, env) {
  const body = await encrypt(te.encode(JSON.stringify(payloadObj)), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint, env.VAPID_PUBLIC, JSON.parse(env.VAPID_PRIVATE_JWK)),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600", // a reminder an hour late is still worth showing; older than that, drop it
      Urgency: "high",
    },
    body,
  });
  if (!res.ok) await res.body?.cancel();
  return res.status;
}
