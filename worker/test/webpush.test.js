// The encryption must match RFC 8291's worked example byte for byte, and a phone-side decrypt
// (written independently here) must recover what encrypt() sealed with fresh random keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { b64u, concat, encrypt, vapidAuth } from "../src/webpush.js";

// RFC 8291 Section 5 + Appendix A, copied exactly
const V = {
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  ciphertext: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
};

test("encrypts the RFC 8291 example byte for byte", async () => {
  const out = await encrypt(b64u.decode(V.plaintext), V.uaPublic, V.auth,
    { asPublic: V.asPublic, asPrivate: V.asPrivate, salt: V.salt });
  const expected = concat(b64u.decode(V.salt), new Uint8Array([0, 0, 16, 0, 65]),
    b64u.decode(V.asPublic), b64u.decode(V.ciphertext));
  assert.equal(b64u.encode(out), b64u.encode(expected));
});

test("a phone can decrypt what fresh random keys sealed", async () => {
  const te = new TextEncoder();
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const message = te.encode('{"t":"Time for medicine 💊"}');
  const body = await encrypt(message, b64u.encode(uaPublic), b64u.encode(authSecret));

  // The receiving side, straight from the RFC, sharing no code with encrypt()
  const salt = body.slice(0, 16), asPublic = body.slice(21, 86), sealed = body.slice(86);
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256);
  const hkdf = async (s, ikm, info, n) => crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info },
    await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8);
  const ikm = await hkdf(authSecret, secret, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const key = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const record = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));

  assert.equal(record.at(-1), 2, "last-record delimiter");
  assert.deepEqual(record.slice(0, -1), message);
});

test("the VAPID header carries a verifiable ES256 JWT for the push service", async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const header = await vapidAuth("https://fcm.googleapis.com/fcm/send/xyz",
    b64u.encode(publicRaw), await crypto.subtle.exportKey("jwk", pair.privateKey), 1760000000000);

  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, b64u.encode(publicRaw));
  const [h, c, sig] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "https://medtrackerapp.github.io");
  assert.ok(claims.exp > 1760000000 && claims.exp <= 1760000000 + 24 * 3600, "expiry within the allowed day");
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey,
    b64u.decode(sig), new TextEncoder().encode(`${h}.${c}`)));
});
