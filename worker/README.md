# medtracker-push

Sends dose reminders to phones while the app is closed. A Cloudflare Worker (free plan) runs every
minute: it keeps a KV mirror of every push-enabled patient (reminder times, medicine names,
subscriptions), refreshed from Firestore only when the app stamped `pushChangedAt` — a quiet
minute costs zero Firestore reads. When a reminder's minute arrives it reads that patient's
`days/{today}` doc once and pushes to every subscribed phone, unless a nurse already gave the dose.

- `src/webpush.js` — Web Push itself: VAPID (RFC 8292) and aes128gcm encryption (RFC 8291),
  on WebCrypto. Tested byte-for-byte against the RFC's example.
- `src/firestore.js` — Firestore over REST with the service account (Workers can't run firebase-admin).
- `src/logic.js` — pure scheduling: mirrors app.js's dueness maths and wording exactly.
- `src/index.js` — the cron tick, `/health`, and a `/test` route guarded by `TEST_KEY`.

`npm test` runs everything that doesn't need Cloudflare (Node 20+).

## One-time setup

1. Create a free Cloudflare account, then in this folder: `npx wrangler login`
2. `npx wrangler kv namespace create PUSH` → paste the printed id into `wrangler.toml`
3. Secrets (values for the first two are in `.dev.vars`, which stays out of git):
   - `npx wrangler secret put VAPID_PRIVATE_JWK`
   - `npx wrangler secret put TEST_KEY`
   - `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` ← paste the service-account key JSON
     (same value as the GitHub `FIREBASE_SERVICE_ACCOUNT` secret)
4. `npx wrangler deploy`

## Testing it for real

On a phone (or desktop Chrome), open the app → Settings → "Reminders on this phone" → Turn on.
Then either set a reminder two minutes ahead and close the app, or force a push now:

    curl -X POST https://medtracker-push.<your-subdomain>.workers.dev/test \
      -H "x-test-key: <TEST_KEY>" -H "content-type: application/json" \
      -d "{\"patient\": \"<the 20-char id from the tracker's ?patient= link>\"}"

`/health` shows patient/subscription counts; `npm run logs` tails the cron.

## Limits worth knowing

- iPhone: web push needs iOS 16.4+ and the app installed to the home screen (the Settings row says so).
- Free-plan Workers allow ~50 subrequests per run: fine until roughly dozens of phones share the
  same reminder minute; the $5 plan or spreading reminder times lifts that.
- The mirror lives in one KV value; around several hundred patients, move it to D1.
