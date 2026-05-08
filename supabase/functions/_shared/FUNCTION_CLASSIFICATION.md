# Edge Function Security Classification

Every edge function MUST fall into one of four categories.
When creating a new function, classify it here and apply the correct auth pattern.

## 🔒 AUTHENTICATED (user JWT required)
Auth pattern: `requireUserAuth(req)` or manual `getClaims()` + `get_user_tenant_id`
All resource lookups MUST include `.eq('tenant_id', authTenantId)`.

| Function | Notes |
|----------|-------|
| ai-assist | User-initiated AI summary |
| ai-default-provider | User manages AI default provider |
| ai-provider-validate | User validates AI key |
| bling-stores | User lists stores |
| create-team-member | Admin creates invite |
| delete-account | User deletes own account |
| email-campaign-send-test | User sends test email |
| evolution-api | User manages WhatsApp instances |
| get-store-statuses | User checks store status |
| instagram-block-user | User action |
| instagram-cancel-run | User action |
| instagram-create-cta-link | User action |
| instagram-delete-comment | User action |
| instagram-generate-deep-link | User action |
| instagram-generate-flow-draft-ai | User action |
| instagram-hide-comment | User action |
| instagram-install-quick-automation | User action |
| instagram-list-quick-automations | User action |
| instagram-manual-token | User action |
| instagram-move-thread-to-spam | User action |
| instagram-oauth | User initiates OAuth |
| instagram-pause-contact-automations | User action |
| instagram-publish-flow-version | User action |
| instagram-resume-contact-automations | User action |
| instagram-seed-test-flows | User-facing test/debug tool |
| instagram-unblock-user | User action |
| instagram-upsert-ice-breakers | User action |
| instagram-upsert-persistent-menu | User action |
| instagram-upsert-welcome-ad-flow | User action |
| li-coupon-create | User creates coupon |
| li-coupon-sync | User syncs coupons |
| li-validate | User validates integration |
| manage-credentials | Admin manages AI secrets |
| manage-smtp | Admin manages SMTP credentials |
| manage-sync-jobs | Admin manages sync jobs and integrations |
| send-email | User sends email |
| send-message | User sends WhatsApp message |
| whatsapp-send-catalog | User action |

## 🔄 HYBRID (user OR internal — validated in-code)
Auth pattern: `requireUserOrInternalAuth(req)` or manual JWT + state-based fallback
Called from frontend with user JWT, from cron/workers with service_role, or from OAuth
callbacks with state-based validation.

**Trust boundary rules for HYBRID functions:**
- User calls: tenant_id resolved from JWT, never trusted from body
- Internal calls: tenant_id from payload (caller already verified)
- State-based calls (OAuth exchange): tenant_id from DB-validated state record

### §ES256 Gateway Note

This project uses ES256 signing-keys for JWTs. The Supabase gateway only validates
HS256 tokens, so `verify_jwt = true` causes `401: Invalid JWT` errors. Therefore,
**all functions use `verify_jwt = false`** and enforce authentication in-code via
`requireUserAuth()`, `requireUserOrInternalAuth()`, or `requireInternalAuth()`.

All HYBRID functions use `verify_jwt = false` (see §ES256 Gateway Note below).
Internal callers use `Authorization: Bearer <service_role_key>` or `x-cron-secret`.

| Function | Frontend Caller | Internal Caller |
|----------|----------------|-----------------|
| bling-job-processor | `useBlingSync.ts` | cron via li-job-processor (service_role) |
| bling-products-job-processor | `useBlingSync.ts` | `bling-sync-products.ts` (service_role) |
| bling-sync | `useBlingSync.ts` | cron, shared helpers (service_role) |
| bulk-campaign-processor | `BulkCampaigns.tsx` | `bulk-campaign-scheduler` (service_role) |
| email-campaign-send | `ConfirmSendDialog.tsx` | `email-campaign-scheduler` (service_role) |
| instagram-healthcheck | `InstagramChannelContext`, `useInstagramChannel` | cron monitoring (service_role) |
| instagram-publish-content | `useInstagramContent.ts` | `instagram-schedule-content` (service_role) |
| instagram-schedule-content | `useInstagramContent.ts` | cron (action=process) (service_role) |
| instagram-send-comment-reply | `useInstagramSocialCare.ts` | `flow-runner`, `webhook-worker` (service_role) |
| instagram-send-message | `useInstagramInbox.ts` | `flow-runner`, `experimental-trigger` (service_role) |
| instagram-send-private-reply | `useInstagramSocialCare.ts` | `flow-runner`, `webhook-worker` (service_role) |
| li-reconciliation-processor | `ClientsContent`, `ProductsContent` | cron (service_role) |
| li-sync | `InitialSyncProgress`, `ProductsContent`, `AddStoreConnectionDialog` | `li-job-processor` (service_role) |
| me-job-processor | `useMelhorEnvioAutoSync.ts` | cron (service_role) |
| rfm-calculator | `useRFMData.ts` | `rfm-cron-trigger` (service_role) |

#### HYBRID (OAuth) — state-based fallback for OAuth callbacks

These have OAuth callback/exchange paths where the browser redirects back with NO JWT.
Authentication is via the `oauth_states` table (one-time use, 10-min TTL).

| Function | Frontend Caller | OAuth Path |
|----------|----------------|------------|
| bling-oauth | Settings UI (get_auth_url, disconnect) | `exchange` — state-based |
| melhor-envio | Settings UI (authorize, status, sync) | `redirect_callback` — state-based |

### §Trust Boundary: bling-oauth

```
┌─────────────────────────────────────────────────────────────┐
│ bling-oauth (verify_jwt = false)                            │
├──────────────────┬──────────────────────────────────────────┤
│ get_auth_url     │ AUTHENTICATED — JWT validated in-code    │
│ refresh          │ AUTHENTICATED — JWT validated in-code    │
│ disconnect       │ AUTHENTICATED — JWT validated in-code    │
│ get_connection   │ AUTHENTICATED — JWT validated in-code    │
├──────────────────┼──────────────────────────────────────────┤
│ exchange         │ STATE-BASED — oauth_states table lookup  │
│                  │ (one-time use, 10-min TTL, no JWT)       │
│                  │ tenant_id resolved from DB state record  │
└──────────────────┴──────────────────────────────────────────┘
```

### §Trust Boundary: melhor-envio

```
┌─────────────────────────────────────────────────────────────┐
│ melhor-envio (verify_jwt = false)                           │
├──────────────────┬──────────────────────────────────────────┤
│ authorize        │ AUTHENTICATED — requireUserAuth(req)     │
│ status           │ AUTHENTICATED — requireUserAuth(req)     │
│ refresh          │ AUTHENTICATED — requireUserAuth(req)     │
│ disconnect       │ AUTHENTICATED — requireUserAuth(req)     │
│ sync_shipments   │ AUTHENTICATED — requireUserAuth(req)     │
│ cancel_shipment  │ AUTHENTICATED — requireUserAuth(req)     │
│ ... (all others) │ AUTHENTICATED — requireUserAuth(req)     │
├──────────────────┼──────────────────────────────────────────┤
│ redirect_callback│ STATE-BASED — oauth_states table lookup  │
│                  │ (one-time use, 10-min TTL, no JWT)       │
│                  │ tenant_id resolved from DB state record  │
│                  │ Returns HTTP 302 redirect (not JSON)     │
└──────────────────┴──────────────────────────────────────────┘
```

## 🔧 INTERNAL (cron/worker — service_role or CRON_SECRET required)
Auth pattern: `requireInternalAuth(req)`
These are called by pg_cron or other edge functions, never directly by users.

| Function | Notes |
|----------|-------|
| ai-buffer-processor | Cron: process buffered AI messages |
| ai-chat | Called by bot-engine/webhook workers |
| birthday-processor | Cron: birthday automations |

| bot-engine | Called by whatsapp-webhook |
| bulk-campaign-scheduler | Cron: schedule campaigns |
| bulk-status-update-li | Cron: update LI statuses |
| cashback-reminder-processor | Cron: cashback reminders |
| conversation-inactivity-processor | Cron: inactivity timeouts |
| email-campaign-scheduler | Cron: schedule email campaigns |
| instagram-backfill-contacts | Internal: backfill contacts |
| instagram-dead-letter-retry | Cron: retry dead letters |
| instagram-experimental-trigger | Internal testing |
| instagram-flow-resume-worker | Cron: resume paused flows |
| instagram-flow-runner | Called by trigger-dispatcher |
| instagram-metrics-rollup | Cron: aggregate metrics |
| instagram-outbox-dispatch | Cron: dispatch outbox messages |
| instagram-refresh-token | Cron: refresh expiring tokens |
| instagram-save-contact-data | Called by flow-runner (no frontend callers) |
| instagram-sync-insights | Cron: sync Instagram insights |
| instagram-track-cta-click | CTA click tracking from flow-runner |
| instagram-trigger-dispatcher | Called by webhook-worker |
| instagram-validate-collected-data | Called by flow-runner |
| instagram-webhook-worker | Called by webhook-ingest |
| li-cashback | Cron: cashback processing |
| li-job-processor | Cron: process LI sync jobs |
| message-queue-processor | Cron: process message queue |
| process-outbound-queue | Cron: dispatch outbound messages |
| rfm-cron-trigger | Cron: trigger RFM recalculation |

## 🌐 PUBLIC (webhook/callback — no JWT, validates via signature/secret/state)
Auth pattern: Signature verification (HMAC), token validation, or none (idempotent/safe).
These MUST validate incoming data via other means (webhook signature, state token, etc.)

| Function | Validation |
|----------|-----------|
| accept-team-invite | Validates invite token from DB |
| bling-webhooks | Bling webhook (event processing) |
| email-unsubscribe | Validates campaign_id + email params |
| instagram-oauth-callback | Validates oauth_state from DB |
| instagram-webhook-ingest | HMAC-SHA256 signature from Meta |
| li-webhook | LI webhook signature |
| melhor-envio-webhook | ME webhook |
| validate-team-invite | Validates invite token (read-only) |
| whatsapp-webhook | Evolution API webhook |

---

## Enforcement Rules

### 1. Every function MUST be classified here
Adding a new edge function without listing it in this file is a **blocking violation**.

### 2. Classification drives mandatory auth pattern
| Class | Required Guard | verify_jwt | Allowed Guards |
|-------|---------------|------------|----------------|
| AUTHENTICATED | `requireUserAuth(req)` | `false` | requireUserAuth, manual (getClaims) |
| HYBRID | `requireUserOrInternalAuth(req)` or multi-path | `false` | requireUserOrInternalAuth, requireUserAuth†, manual |
| INTERNAL | `requireInternalAuth(req)` | `false` | requireInternalAuth |
| PUBLIC | Signature/token validation (no JWT) | `false` | none, manual (signature check) |

> **All classes use `verify_jwt = false`** due to ES256 gateway incompatibility.
> See §ES256 Gateway Note above.

† HYBRID functions using `requireUserAuth` must have a documented state-based or
  callback path (see §Trust Boundary sections).

### 3. Semantic violations (blocking)
- **AUTHENTICATED** using `requireInternalAuth` or `requireUserOrInternalAuth` → reclassify
- **INTERNAL** using `requireUserAuth` or `requireUserOrInternalAuth` → reclassify
- **PUBLIC** using `requireInternalAuth` → reclassify as INTERNAL

### 4. Checklist for new functions
- [ ] Function classified in this file under the correct category
- [ ] Auth pattern imported and called at top of handler
- [ ] Test added to the corresponding test file
- [ ] All resource lookups include `.eq('tenant_id', ...)` (AUTHENTICATED/HYBRID only)
- [ ] `requireResource()` used for ID-based operations (AUTHENTICATED/HYBRID only)
- [ ] `verify_jwt` set correctly in `supabase/config.toml`

### 5. Running the test suite
```bash
cd supabase/functions && deno test tests/ --allow-net --allow-env --allow-read
```

### 6. Running the contract audit
```bash
deno run --allow-read scripts/audit-function-contracts.ts
```

### Rules for New Functions

1. **Default to AUTHENTICATED** unless there's a specific reason not to
2. **All resource lookups** in authenticated functions MUST include `.eq('tenant_id', authTenantId)`
3. **Use `requireResource()` from `resource-guard.ts`** for critical operations
4. **Never trust `tenant_id` from the request body** in authenticated functions — always use the resolved tenant
5. **Internal functions** can trust `tenant_id` from payload since the caller is already verified
6. **Public functions** must validate via signature, token, or state — never accept arbitrary data
7. **All new functions** use `verify_jwt = false` in config.toml (ES256 gateway incompatibility)
