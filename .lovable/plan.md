

## Diagnosis

After reviewing all the code, logs, and the UAZAPI OpenAPI spec, I identified **two distinct root causes**:

### Problem 1: Webhook NOT saving inbound messages
The webhook log proves UAZAPI IS sending data to your Edge Function. But the `uazapi-webhook` function fails to find the instance in the database.

**Root cause**: The webhook payload uses PascalCase fields (`BaseUrl`, `EventType`) but the code checks `payload.instanceName` (camelCase). The actual field is likely `InstanceName` or missing entirely. Even if found, the value from UAZAPI may not match the `instance_name` stored in your DB (which is whatever you typed when creating the instance in the app).

**Fix**: Look up the instance by `api_url` matching the `BaseUrl` from the webhook payload. This is reliable because `BaseUrl: "https://tracker1.uazapi.com"` matches what's stored in `whatsapp_instances.api_url`.

### Problem 2: Send returning 500
The send function constructs the correct URL (`https://tracker1.uazapi.com/send/text`) and uses the right token header. The `whatsapp-instance` function uses the same pattern for `/instance/status` and it works.

**Likely cause**: The `isSuccessfulResponse` function rejects valid responses. UAZAPI may return `{ error: "warning..." }` or `{ success: false }` in the body even when the message was sent, OR may return a non-JSON response. The function treats these as failures.

**Fix**: Accept any 2xx response as success. Log the full response for debugging. Also ensure the `number` field gets the clean phone without `@s.whatsapp.net` suffix as the primary attempt (spec examples use plain numbers like `5511999999999`).

---

## Changes

### 1. `supabase/functions/uazapi-webhook/index.ts`
- Replace the `instanceName` lookup with a `api_url` lookup using `BaseUrl` from the payload
- Add fallback: also try `InstanceName`, `instanceName`, `instance` fields
- Add detailed logging for which lookup method succeeded

### 2. `supabase/functions/whatsapp-send/index.ts`
- Change `isSuccessfulResponse` to accept any 2xx HTTP status as success (don't check body for `error`/`success` fields)
- Try clean phone number ONLY first (no `@s.whatsapp.net` — the spec examples use plain numbers)
- Add detailed logging of the UAZAPI response status + body for every attempt
- Log the exact URL, token prefix (first 8 chars), and payload being sent

### 3. `supabase/functions/whatsapp-chats/index.ts`
- No changes needed — the issue is messages not being saved by the webhook, not the chat listing function

