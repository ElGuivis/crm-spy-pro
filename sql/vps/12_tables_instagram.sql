-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: TABELAS INSTAGRAM (40 tabelas)
-- Gerado automaticamente do schema real do banco
-- =============================================================================

CREATE TABLE public.instagram_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, name text NOT NULL, ig_user_id text NOT NULL,
  instagram_username text, access_token_encrypted text NOT NULL,
  token_expires_at timestamptz, token_refresh_at timestamptz,
  status instagram_channel_status NOT NULL DEFAULT 'disconnected',
  webhook_verified boolean NOT NULL DEFAULT false,
  app_mode text NOT NULL DEFAULT 'development',
  default_locale text DEFAULT 'pt_BR', default_timezone text DEFAULT 'America/Sao_Paulo',
  last_sync_at timestamptz, last_healthcheck_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_channel_capabilities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  comments boolean NOT NULL DEFAULT false, private_replies boolean NOT NULL DEFAULT false,
  story_reply boolean NOT NULL DEFAULT false, story_mention boolean NOT NULL DEFAULT false,
  live_comments boolean NOT NULL DEFAULT false, welcome_ads boolean NOT NULL DEFAULT false,
  ice_breakers boolean NOT NULL DEFAULT false, persistent_menu boolean NOT NULL DEFAULT false,
  follow_to_dm boolean NOT NULL DEFAULT false, share_to_dm boolean NOT NULL DEFAULT false,
  content_publish boolean NOT NULL DEFAULT false, insights boolean NOT NULL DEFAULT false,
  moderation boolean NOT NULL DEFAULT false, raw_capabilities jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_ig_capabilities_channel ON public.instagram_channel_capabilities(channel_id);

CREATE TABLE public.instagram_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES public.instagram_channels(id),
  igsid text NOT NULL, instagram_username text, display_name text, profile_pic_url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_user_interaction_at timestamptz, standard_window_expires_at timestamptz,
  human_window_expires_at timestamptz, is_blocked boolean NOT NULL DEFAULT false,
  source_first_entry text, custom_fields jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  email text, phone text, email_verified boolean DEFAULT false, phone_verified boolean DEFAULT false,
  email_consent_at timestamptz, phone_consent_at timestamptz, email_source text, phone_source text,
  UNIQUE(channel_id, igsid)
);

CREATE TABLE public.instagram_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES public.instagram_channels(id),
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id),
  provider_thread_id text,
  thread_status instagram_thread_status NOT NULL DEFAULT 'open',
  current_mode text NOT NULL DEFAULT 'bot', assigned_user_id uuid,
  entrypoint_type text, entrypoint_ref text, last_message_preview text,
  last_message_at timestamptz, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  automations_paused_until timestamptz, automation_pause_reason text, automation_pause_source text,
  is_spam boolean DEFAULT false, spam_marked_at timestamptz, spam_marked_by uuid
);

CREATE TABLE public.instagram_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, thread_id uuid NOT NULL REFERENCES public.instagram_threads(id),
  provider_message_id text,
  direction instagram_message_direction NOT NULL,
  message_type text NOT NULL DEFAULT 'text', text_body text, media_url text, payload jsonb,
  sent_by_user_id uuid,
  delivery_status instagram_delivery_status NOT NULL DEFAULT 'pending',
  error_code text, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  cta_link_id uuid, cta_click_tracked boolean DEFAULT false
);

CREATE TABLE public.instagram_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES public.instagram_channels(id),
  thread_id uuid, contact_id uuid,
  message_kind text NOT NULL DEFAULT 'text', payload jsonb NOT NULL,
  send_after timestamptz NOT NULL DEFAULT now(),
  status instagram_outbox_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0, last_attempt_at timestamptz,
  provider_message_id text, idempotency_key text NOT NULL,
  error_code text, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_ig_outbox_idempotency ON public.instagram_outbox(idempotency_key);

CREATE TABLE public.instagram_webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid, channel_id uuid, provider_delivery_key text, event_hash text,
  signature_valid boolean, payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false, processed_at timestamptz,
  parse_status text DEFAULT 'pending', error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_event_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid, contact_id uuid, thread_id uuid,
  event_type text NOT NULL, event_source text, provider_object_id text,
  event_time timestamptz NOT NULL DEFAULT now(), normalized_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES public.instagram_channels(id),
  name text NOT NULL, description text, status text NOT NULL DEFAULT 'draft',
  live_version_id uuid, allow_parallel_runs boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, flow_id uuid NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft',
  snapshot jsonb, published_at timestamptz, published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE,
  node_type text NOT NULL, label text, config jsonb NOT NULL DEFAULT '{}',
  position_x float8 NOT NULL DEFAULT 0, position_y float8 NOT NULL DEFAULT 0,
  is_entry boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_edges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL, target_node_id uuid NOT NULL,
  source_handle text, label text, condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, flow_id uuid NOT NULL, version_id uuid NOT NULL,
  thread_id uuid NOT NULL, contact_id uuid NOT NULL, trigger_rule_id uuid,
  status text NOT NULL DEFAULT 'running', current_node_id uuid,
  context jsonb NOT NULL DEFAULT '{}', error_message text,
  paused_by_contact_rule boolean NOT NULL DEFAULT false, idempotency_key text,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_run_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, run_id uuid NOT NULL REFERENCES public.instagram_flow_runs(id) ON DELETE CASCADE,
  node_id uuid NOT NULL, node_type text NOT NULL, status text NOT NULL DEFAULT 'pending',
  input jsonb, output jsonb, error_message text,
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_trigger_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, flow_id uuid NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  trigger_type text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0, environment text NOT NULL DEFAULT 'production',
  throttle_mode text NOT NULL DEFAULT 'always', keywords text[],
  keyword_match_mode text DEFAULT 'exact', tag_filter_ids uuid[], time_filter jsonb,
  timeout_seconds integer, config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_media_watchlist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL REFERENCES public.instagram_channels(id),
  media_id text, media_type text NOT NULL DEFAULT 'post',
  watch_mode text NOT NULL DEFAULT 'specific',
  keywords_include text[] DEFAULT '{}', keywords_exclude text[] DEFAULT '{}',
  reply_public_enabled boolean NOT NULL DEFAULT false, reply_public_variants text[] DEFAULT '{}',
  private_reply_enabled boolean NOT NULL DEFAULT false, private_reply_flow_id uuid,
  first_comment_only boolean NOT NULL DEFAULT false, delay_seconds integer DEFAULT 0,
  round_robin_index integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_comment_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, ig_comment_id text NOT NULL,
  ig_media_id text, parent_comment_id text, commenter_igsid text, commenter_username text,
  text text, is_hidden boolean DEFAULT false, is_deleted boolean DEFAULT false,
  moderation_status text DEFAULT 'pending', flagged_terms text[],
  replied_publicly boolean DEFAULT false, replied_privately boolean DEFAULT false,
  media_type text, is_live_comment boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), moderated_at timestamptz, moderated_by uuid
);

CREATE TABLE public.instagram_comment_replies_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, comment_id text NOT NULL,
  reply_type text NOT NULL, watchlist_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, name text NOT NULL,
  color text DEFAULT '#6366f1', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_contact_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, contact_id uuid NOT NULL, tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

CREATE TABLE public.instagram_contact_pauses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, contact_id uuid NOT NULL, channel_id uuid NOT NULL,
  paused_until timestamptz, reason text, source text NOT NULL DEFAULT 'manual',
  paused_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_blocked_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, contact_id uuid NOT NULL,
  igsid text, username text, blocked_by uuid, reason text,
  blocked_at timestamptz DEFAULT now(), unblocked_at timestamptz,
  is_active boolean DEFAULT true,
  UNIQUE(channel_id, contact_id, is_active)
);

CREATE TABLE public.instagram_content (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, content_type text NOT NULL,
  caption text, media_urls text[] DEFAULT '{}', cover_url text,
  status text DEFAULT 'draft', scheduled_at timestamptz, published_at timestamptz,
  ig_media_id text, ig_permalink text, error_message text,
  linked_flow_id uuid, linked_trigger_type text, metadata jsonb DEFAULT '{}',
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_ice_breakers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, text text NOT NULL,
  flow_id uuid, sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_persistent_menu_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, label text NOT NULL,
  action_type text NOT NULL DEFAULT 'postback', action_payload text, flow_id uuid,
  sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_follow_dm_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT false, welcome_text text,
  delay_seconds integer NOT NULL DEFAULT 5, flow_id uuid,
  once_per_user boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_share_dm_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT false, target_mode text NOT NULL DEFAULT 'all',
  target_media_id text, flow_id uuid, once_per_user_per_automation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_ad_welcome_flows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, name text NOT NULL,
  campaign_id text, adset_id text, ad_id text, flow_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_deep_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL,
  slug text NOT NULL, ref_key text NOT NULL, flow_id uuid,
  metadata jsonb DEFAULT '{}', click_count integer NOT NULL DEFAULT 0,
  conversation_count integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_cta_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL,
  label text NOT NULL, url text NOT NULL,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, ref_key text,
  flow_id uuid, version_id uuid, node_id text,
  click_count integer DEFAULT 0, is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_cta_link_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, cta_link_id uuid NOT NULL, contact_id uuid,
  thread_id uuid, message_id uuid, clicked_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_data_collection_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, contact_id uuid NOT NULL, channel_id uuid NOT NULL,
  field_name text NOT NULL, field_value text NOT NULL,
  source text NOT NULL DEFAULT 'flow', flow_id uuid, flow_run_id uuid, node_id text,
  consent_given boolean DEFAULT false, consent_text text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_channel_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, insight_date date NOT NULL,
  followers_count integer, follows_count integer, media_count integer,
  impressions integer DEFAULT 0, reach integer DEFAULT 0, profile_views integer DEFAULT 0,
  website_clicks integer DEFAULT 0, email_contacts integer DEFAULT 0,
  phone_call_clicks integer DEFAULT 0, get_directions_clicks integer DEFAULT 0,
  audience_demographics jsonb DEFAULT '{}', online_followers jsonb DEFAULT '{}',
  insights_raw jsonb DEFAULT '{}', synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, insight_date)
);

CREATE TABLE public.instagram_media_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, ig_media_id text NOT NULL,
  media_type text, permalink text, caption text, timestamp timestamptz,
  impressions integer DEFAULT 0, reach integer DEFAULT 0,
  likes integer DEFAULT 0, comments integer DEFAULT 0, saves integer DEFAULT 0,
  shares integer DEFAULT 0, plays integer DEFAULT 0,
  dm_threads_generated integer DEFAULT 0, dm_leads_captured integer DEFAULT 0,
  insights_raw jsonb DEFAULT '{}', synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_metrics_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, metric_date date NOT NULL,
  inbound_messages integer DEFAULT 0, outbound_messages integer DEFAULT 0,
  new_threads integer DEFAULT 0, private_replies_sent integer DEFAULT 0,
  flows_started integer DEFAULT 0, flows_completed integer DEFAULT 0,
  handoffs_to_human integer DEFAULT 0, comment_triggers integer DEFAULT 0,
  story_reply_triggers integer DEFAULT 0, story_mention_triggers integer DEFAULT 0,
  live_comment_triggers integer DEFAULT 0, ad_entry_triggers integer DEFAULT 0,
  ref_url_entries integer DEFAULT 0, send_failures integer DEFAULT 0,
  avg_first_response_seconds numeric, avg_human_mode_seconds numeric,
  emails_captured integer DEFAULT 0, phones_captured integer DEFAULT 0,
  cta_clicks integer DEFAULT 0, pauses_count integer DEFAULT 0,
  flow_metrics jsonb DEFAULT '{}', trigger_metrics jsonb DEFAULT '{}',
  operator_metrics jsonb DEFAULT '{}', media_metrics jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, metric_date)
);

CREATE TABLE public.instagram_term_blacklist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid, term text NOT NULL,
  action text DEFAULT 'flag', is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_feature_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false, enabled_at timestamptz, enabled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, feature_key)
);

CREATE TABLE public.instagram_experimental_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, contact_id uuid NOT NULL,
  execution_type text NOT NULL, config_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_ai_flow_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL,
  objective text, trigger_type text, tone text, language text DEFAULT 'pt-BR',
  cta text, data_fields text[] DEFAULT '{}', include_handoff boolean DEFAULT false,
  generated_nodes jsonb DEFAULT '[]', generated_edges jsonb DEFAULT '[]',
  suggested_tags text[] DEFAULT '{}', suggested_fields text[] DEFAULT '{}',
  validation_report jsonb DEFAULT '{}', status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(), converted_flow_id uuid
);

CREATE TABLE public.instagram_quick_automation_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL DEFAULT 'growth',
  description text, required_capabilities text[] DEFAULT '{}',
  template_nodes jsonb NOT NULL DEFAULT '[]', template_edges jsonb NOT NULL DEFAULT '[]',
  trigger_config jsonb, is_active boolean DEFAULT true, sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.instagram_quick_automation_installs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL, channel_id uuid NOT NULL, template_id uuid NOT NULL,
  flow_id uuid NOT NULL, installed_at timestamptz DEFAULT now()
);
