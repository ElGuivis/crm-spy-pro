export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      abandoned_cart_configs: {
        Row: {
          coupon_discount_percent: number | null
          coupon_duration_days: number | null
          coupon_enabled: boolean | null
          created_at: string
          delay_minutes: number
          id: string
          integration_id: string
          is_active: boolean
          max_attempts: number | null
          message_template: string | null
          tenant_id: string
          tokens_per_execution: number | null
          updated_at: string
          whatsapp_integration_id: string | null
        }
        Insert: {
          coupon_discount_percent?: number | null
          coupon_duration_days?: number | null
          coupon_enabled?: boolean | null
          created_at?: string
          delay_minutes?: number
          id?: string
          integration_id: string
          is_active?: boolean
          max_attempts?: number | null
          message_template?: string | null
          tenant_id: string
          tokens_per_execution?: number | null
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Update: {
          coupon_discount_percent?: number | null
          coupon_duration_days?: number | null
          coupon_enabled?: boolean | null
          created_at?: string
          delay_minutes?: number
          id?: string
          integration_id?: string
          is_active?: boolean
          max_attempts?: number | null
          message_template?: string | null
          tenant_id?: string
          tokens_per_execution?: number | null
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_configs_whatsapp_integration_id_fkey"
            columns: ["whatsapp_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_cart_executions: {
        Row: {
          action_type: string
          cart_id: string | null
          config_id: string | null
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          status: string
          tenant_id: string
          tokens_used: number | null
        }
        Insert: {
          action_type?: string
          cart_id?: string | null
          config_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          tenant_id: string
          tokens_used?: number | null
        }
        Update: {
          action_type?: string
          cart_id?: string | null
          config_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          tenant_id?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_executions_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "abandoned_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_executions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "abandoned_cart_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_carts: {
        Row: {
          abandoned_at: string | null
          attempts: number | null
          cart_total: number | null
          checkout_url: string | null
          config_id: string | null
          contacted_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          error_message: string | null
          external_id: string
          id: string
          integration_id: string
          last_attempt_at: string | null
          recovered_at: string | null
          recovery_order_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          attempts?: number | null
          cart_total?: number | null
          checkout_url?: string | null
          config_id?: string | null
          contacted_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_message?: string | null
          external_id: string
          id?: string
          integration_id: string
          last_attempt_at?: string | null
          recovered_at?: string | null
          recovery_order_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          attempts?: number | null
          cart_total?: number | null
          checkout_url?: string | null
          config_id?: string | null
          contacted_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          error_message?: string | null
          external_id?: string
          id?: string
          integration_id?: string
          last_attempt_at?: string | null
          recovered_at?: string | null
          recovery_order_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "abandoned_cart_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_column_assignments: {
        Row: {
          agent_id: string
          column_id: string
          created_at: string
          id: string
          priority: number | null
          tenant_id: string
        }
        Insert: {
          agent_id: string
          column_id: string
          created_at?: string
          id?: string
          priority?: number | null
          tenant_id: string
        }
        Update: {
          agent_id?: string
          column_id?: string
          created_at?: string
          id?: string
          priority?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_column_assignments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_column_assignments_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_column_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          after_verified_column_id: string | null
          agent_transfer_rules: Json | null
          agent_type: string
          ai_provider: string | null
          cpf_max_attempts_column_id: string | null
          created_at: string
          data_access: Json | null
          description: string | null
          human_transfer_column_id: string | null
          id: string
          inactivity_enabled: boolean | null
          inactivity_message: string | null
          inactivity_target_column_id: string | null
          inactivity_timeout_minutes: number | null
          interactive_buttons: Json | null
          is_active: boolean
          keyword_action_rules: Json | null
          max_tokens: number | null
          message_buffer_delay_seconds: number | null
          message_buffer_enabled: boolean | null
          model: string
          name: string
          order_details_template: string | null
          order_not_found_column_id: string | null
          order_verification_enabled: boolean | null
          order_verification_messages: Json | null
          order_verification_mode: string | null
          store_integration_id: string | null
          system_prompt: string
          temperature: number | null
          tenant_id: string
          tracking_link_base: string | null
          transfer_keywords: string[] | null
          updated_at: string
          verification_type: string | null
          welcome_message: string | null
        }
        Insert: {
          after_verified_column_id?: string | null
          agent_transfer_rules?: Json | null
          agent_type?: string
          ai_provider?: string | null
          cpf_max_attempts_column_id?: string | null
          created_at?: string
          data_access?: Json | null
          description?: string | null
          human_transfer_column_id?: string | null
          id?: string
          inactivity_enabled?: boolean | null
          inactivity_message?: string | null
          inactivity_target_column_id?: string | null
          inactivity_timeout_minutes?: number | null
          interactive_buttons?: Json | null
          is_active?: boolean
          keyword_action_rules?: Json | null
          max_tokens?: number | null
          message_buffer_delay_seconds?: number | null
          message_buffer_enabled?: boolean | null
          model?: string
          name: string
          order_details_template?: string | null
          order_not_found_column_id?: string | null
          order_verification_enabled?: boolean | null
          order_verification_messages?: Json | null
          order_verification_mode?: string | null
          store_integration_id?: string | null
          system_prompt: string
          temperature?: number | null
          tenant_id: string
          tracking_link_base?: string | null
          transfer_keywords?: string[] | null
          updated_at?: string
          verification_type?: string | null
          welcome_message?: string | null
        }
        Update: {
          after_verified_column_id?: string | null
          agent_transfer_rules?: Json | null
          agent_type?: string
          ai_provider?: string | null
          cpf_max_attempts_column_id?: string | null
          created_at?: string
          data_access?: Json | null
          description?: string | null
          human_transfer_column_id?: string | null
          id?: string
          inactivity_enabled?: boolean | null
          inactivity_message?: string | null
          inactivity_target_column_id?: string | null
          inactivity_timeout_minutes?: number | null
          interactive_buttons?: Json | null
          is_active?: boolean
          keyword_action_rules?: Json | null
          max_tokens?: number | null
          message_buffer_delay_seconds?: number | null
          message_buffer_enabled?: boolean | null
          model?: string
          name?: string
          order_details_template?: string | null
          order_not_found_column_id?: string | null
          order_verification_enabled?: boolean | null
          order_verification_messages?: Json | null
          order_verification_mode?: string | null
          store_integration_id?: string | null
          system_prompt?: string
          temperature?: number | null
          tenant_id?: string
          tracking_link_base?: string | null
          transfer_keywords?: string[] | null
          updated_at?: string
          verification_type?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_after_verified_column_id_fkey"
            columns: ["after_verified_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_cpf_max_attempts_column_id_fkey"
            columns: ["cpf_max_attempts_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_human_transfer_column_id_fkey"
            columns: ["human_transfer_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_inactivity_target_column_id_fkey"
            columns: ["inactivity_target_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_order_not_found_column_id_fkey"
            columns: ["order_not_found_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_store_integration_id_fkey"
            columns: ["store_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_assistant_configs: {
        Row: {
          auto_close_enabled: boolean
          auto_close_message: string
          auto_close_minutes: number
          automation_auto_close_enabled: boolean | null
          automation_auto_close_message: string | null
          automation_auto_close_minutes: number | null
          business_hours: Json | null
          created_at: string
          default_ai_agent_id: string | null
          id: string
          inactivity_message: string | null
          inactivity_timeout_minutes: number | null
          is_active: boolean
          max_context_messages: number | null
          out_of_hours_message: string | null
          system_prompt: string | null
          tenant_id: string
          transfer_keywords: string[] | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          auto_close_enabled?: boolean
          auto_close_message?: string
          auto_close_minutes?: number
          automation_auto_close_enabled?: boolean | null
          automation_auto_close_message?: string | null
          automation_auto_close_minutes?: number | null
          business_hours?: Json | null
          created_at?: string
          default_ai_agent_id?: string | null
          id?: string
          inactivity_message?: string | null
          inactivity_timeout_minutes?: number | null
          is_active?: boolean
          max_context_messages?: number | null
          out_of_hours_message?: string | null
          system_prompt?: string | null
          tenant_id: string
          transfer_keywords?: string[] | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          auto_close_enabled?: boolean
          auto_close_message?: string
          auto_close_minutes?: number
          automation_auto_close_enabled?: boolean | null
          automation_auto_close_message?: string | null
          automation_auto_close_minutes?: number | null
          business_hours?: Json | null
          created_at?: string
          default_ai_agent_id?: string | null
          id?: string
          inactivity_message?: string | null
          inactivity_timeout_minutes?: number | null
          is_active?: boolean
          max_context_messages?: number | null
          out_of_hours_message?: string | null
          system_prompt?: string | null
          tenant_id?: string
          transfer_keywords?: string[] | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_assistant_configs_default_ai_agent_id_fkey"
            columns: ["default_ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_health: {
        Row: {
          consecutive_failures: number | null
          created_at: string
          id: string
          last_check_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_success_at: string | null
          provider: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number | null
          created_at?: string
          id?: string
          last_check_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          provider: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number | null
          created_at?: string
          id?: string
          last_check_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          provider?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_health_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          model: string
          provider: string
          response_time_ms: number | null
          status: string
          tenant_id: string
          tokens_input: number | null
          tokens_output: number | null
          tokens_total: number | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          model: string
          provider?: string
          response_time_ms?: number | null
          status?: string
          tenant_id: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          model?: string
          provider?: string
          response_time_ms?: number | null
          status?: string
          tenant_id?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tokens_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_messages: {
        Row: {
          content: string
          created_at: string | null
          delay_seconds: number | null
          id: string
          is_active: boolean | null
          message_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          delay_seconds?: number | null
          id?: string
          is_active?: boolean | null
          message_type: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          delay_seconds?: number | null
          id?: string
          is_active?: boolean | null
          message_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_configs: {
        Row: {
          coupon_discount_percent: number
          coupon_duration_days: number
          created_at: string
          email_body: string | null
          email_enabled: boolean | null
          email_integration_id: string | null
          email_subject: string | null
          id: string
          integration_id: string
          is_active: boolean
          message_template: string
          name: string
          tenant_id: string
          tokens_per_execution: number
          updated_at: string
          whatsapp_integration_id: string | null
        }
        Insert: {
          coupon_discount_percent?: number
          coupon_duration_days?: number
          created_at?: string
          email_body?: string | null
          email_enabled?: boolean | null
          email_integration_id?: string | null
          email_subject?: string | null
          id?: string
          integration_id: string
          is_active?: boolean
          message_template?: string
          name?: string
          tenant_id: string
          tokens_per_execution?: number
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Update: {
          coupon_discount_percent?: number
          coupon_duration_days?: number
          created_at?: string
          email_body?: string | null
          email_enabled?: boolean | null
          email_integration_id?: string | null
          email_subject?: string | null
          id?: string
          integration_id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          tenant_id?: string
          tokens_per_execution?: number
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birthday_configs_email_integration_id_fkey"
            columns: ["email_integration_id"]
            isOneToOne: false
            referencedRelation: "email_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_configs_whatsapp_integration_id_fkey"
            columns: ["whatsapp_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_executions: {
        Row: {
          action_type: string
          config_id: string | null
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_source: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          status: string
          tenant_id: string
          tokens_used: number | null
        }
        Insert: {
          action_type?: string
          config_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_source?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          tenant_id: string
          tokens_used?: number | null
        }
        Update: {
          action_type?: string
          config_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_source?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          tenant_id?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "birthday_executions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "birthday_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_code_mappings: {
        Row: {
          color: string | null
          created_at: string | null
          display_name: string
          id: string
          integration_id: string
          is_active: boolean | null
          mapping_type: string
          original_code: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          display_name: string
          id?: string
          integration_id: string
          is_active?: boolean | null
          mapping_type: string
          original_code: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          integration_id?: string
          is_active?: boolean | null
          mapping_type?: string
          original_code?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_code_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_code_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_connections: {
        Row: {
          access_token: string
          access_token_encrypted: string | null
          bling_company_id: string | null
          bling_user_id: string | null
          bling_user_name: string | null
          created_at: string | null
          created_by_user_id: string | null
          id: string
          refresh_expires_at: string | null
          refresh_token: string
          refresh_token_encrypted: string | null
          scopes: string[] | null
          status: string | null
          tenant_id: string
          token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          access_token_encrypted?: string | null
          bling_company_id?: string | null
          bling_user_id?: string | null
          bling_user_name?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          refresh_expires_at?: string | null
          refresh_token: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string | null
          tenant_id: string
          token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          access_token_encrypted?: string | null
          bling_company_id?: string | null
          bling_user_id?: string | null
          bling_user_name?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          refresh_expires_at?: string | null
          refresh_token?: string
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          status?: string | null
          tenant_id?: string
          token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_customers: {
        Row: {
          bling_id: number
          celular: string | null
          cpf_cnpj: string | null
          created_at: string | null
          data_inclusao: string | null
          data_nascimento: string | null
          email: string | null
          endereco: Json | null
          fantasia: string | null
          id: string
          ie: string | null
          integration_id: string
          naturalidade: string | null
          nome: string
          orgao_emissor: string | null
          raw_data: Json | null
          rg: string | null
          sexo: string | null
          situacao: string | null
          synced_at: string | null
          telefone: string | null
          tenant_id: string
          tipo_pessoa: string | null
          updated_at: string | null
        }
        Insert: {
          bling_id: number
          celular?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          data_inclusao?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: Json | null
          fantasia?: string | null
          id?: string
          ie?: string | null
          integration_id: string
          naturalidade?: string | null
          nome: string
          orgao_emissor?: string | null
          raw_data?: Json | null
          rg?: string | null
          sexo?: string | null
          situacao?: string | null
          synced_at?: string | null
          telefone?: string | null
          tenant_id: string
          tipo_pessoa?: string | null
          updated_at?: string | null
        }
        Update: {
          bling_id?: number
          celular?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          data_inclusao?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: Json | null
          fantasia?: string | null
          id?: string
          ie?: string | null
          integration_id?: string
          naturalidade?: string | null
          nome?: string
          orgao_emissor?: string | null
          raw_data?: Json | null
          rg?: string | null
          sexo?: string | null
          situacao?: string | null
          synced_at?: string | null
          telefone?: string | null
          tenant_id?: string
          tipo_pessoa?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_customers_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_order_items: {
        Row: {
          aliquota_ipi: number | null
          bling_id: number | null
          comissao_aliquota: number | null
          comissao_base: number | null
          comissao_valor: number | null
          created_at: string | null
          desconto: number | null
          descricao_detalhada: string | null
          id: string
          natureza_operacao_id: number | null
          order_id: string
          preco_custo: number | null
          produto_id: number | null
          produto_nome: string | null
          quantidade: number | null
          raw_data: Json | null
          sku: string | null
          tenant_id: string
          unidade: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          aliquota_ipi?: number | null
          bling_id?: number | null
          comissao_aliquota?: number | null
          comissao_base?: number | null
          comissao_valor?: number | null
          created_at?: string | null
          desconto?: number | null
          descricao_detalhada?: string | null
          id?: string
          natureza_operacao_id?: number | null
          order_id: string
          preco_custo?: number | null
          produto_id?: number | null
          produto_nome?: string | null
          quantidade?: number | null
          raw_data?: Json | null
          sku?: string | null
          tenant_id: string
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          aliquota_ipi?: number | null
          bling_id?: number | null
          comissao_aliquota?: number | null
          comissao_base?: number | null
          comissao_valor?: number | null
          created_at?: string | null
          desconto?: number | null
          descricao_detalhada?: string | null
          id?: string
          natureza_operacao_id?: number | null
          order_id?: string
          preco_custo?: number | null
          produto_id?: number | null
          produto_nome?: string | null
          quantidade?: number | null
          raw_data?: Json | null
          sku?: string | null
          tenant_id?: string
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "bling_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_orders: {
        Row: {
          bling_id: number
          categoria_id: number | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_id: number | null
          cliente_nome: string | null
          cliente_telefone: string | null
          created_at: string | null
          custo_frete: number | null
          data_criacao: string | null
          data_modificacao: string | null
          data_prevista: string | null
          data_saida: string | null
          endereco_entrega: Json | null
          etiqueta: Json | null
          forma_envio: string | null
          forma_pagamento: string | null
          frete_por_conta: number | null
          id: string
          integration_id: string
          intermediador_cnpj: string | null
          intermediador_nome_usuario: string | null
          loja_id: number | null
          loja_nome: string | null
          nota_fiscal_id: number | null
          numero: string
          numero_loja: string | null
          numero_pedido_compra: string | null
          observacoes: string | null
          observacoes_internas: string | null
          outras_despesas: number | null
          parcelas: Json | null
          peso_bruto: number | null
          prazo_entrega: number | null
          quantidade_volumes: number | null
          raw_data: Json | null
          situacao_id: number | null
          situacao_nome: string | null
          synced_at: string | null
          taxa_comissao: number | null
          tenant_id: string
          total_icms: number | null
          total_ipi: number | null
          transportador_id: number | null
          transportador_nome: string | null
          updated_at: string | null
          valor_base: number | null
          valor_desconto: number | null
          valor_frete: number | null
          valor_produtos: number | null
          valor_total: number | null
          vendedor_id: number | null
          volumes: Json | null
        }
        Insert: {
          bling_id: number
          categoria_id?: number | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_id?: number | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          created_at?: string | null
          custo_frete?: number | null
          data_criacao?: string | null
          data_modificacao?: string | null
          data_prevista?: string | null
          data_saida?: string | null
          endereco_entrega?: Json | null
          etiqueta?: Json | null
          forma_envio?: string | null
          forma_pagamento?: string | null
          frete_por_conta?: number | null
          id?: string
          integration_id: string
          intermediador_cnpj?: string | null
          intermediador_nome_usuario?: string | null
          loja_id?: number | null
          loja_nome?: string | null
          nota_fiscal_id?: number | null
          numero: string
          numero_loja?: string | null
          numero_pedido_compra?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          outras_despesas?: number | null
          parcelas?: Json | null
          peso_bruto?: number | null
          prazo_entrega?: number | null
          quantidade_volumes?: number | null
          raw_data?: Json | null
          situacao_id?: number | null
          situacao_nome?: string | null
          synced_at?: string | null
          taxa_comissao?: number | null
          tenant_id: string
          total_icms?: number | null
          total_ipi?: number | null
          transportador_id?: number | null
          transportador_nome?: string | null
          updated_at?: string | null
          valor_base?: number | null
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_produtos?: number | null
          valor_total?: number | null
          vendedor_id?: number | null
          volumes?: Json | null
        }
        Update: {
          bling_id?: number
          categoria_id?: number | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_id?: number | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          created_at?: string | null
          custo_frete?: number | null
          data_criacao?: string | null
          data_modificacao?: string | null
          data_prevista?: string | null
          data_saida?: string | null
          endereco_entrega?: Json | null
          etiqueta?: Json | null
          forma_envio?: string | null
          forma_pagamento?: string | null
          frete_por_conta?: number | null
          id?: string
          integration_id?: string
          intermediador_cnpj?: string | null
          intermediador_nome_usuario?: string | null
          loja_id?: number | null
          loja_nome?: string | null
          nota_fiscal_id?: number | null
          numero?: string
          numero_loja?: string | null
          numero_pedido_compra?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          outras_despesas?: number | null
          parcelas?: Json | null
          peso_bruto?: number | null
          prazo_entrega?: number | null
          quantidade_volumes?: number | null
          raw_data?: Json | null
          situacao_id?: number | null
          situacao_nome?: string | null
          synced_at?: string | null
          taxa_comissao?: number | null
          tenant_id?: string
          total_icms?: number | null
          total_ipi?: number | null
          transportador_id?: number | null
          transportador_nome?: string | null
          updated_at?: string | null
          valor_base?: number | null
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_produtos?: number | null
          valor_total?: number | null
          vendedor_id?: number | null
          volumes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_orders_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_products: {
        Row: {
          altura: number | null
          bling_id: number
          campos_customizados: Json | null
          categoria_id: number | null
          categoria_nome: string | null
          cest: string | null
          classe_fiscal: string | null
          codigo: string | null
          condicao: number | null
          created_at: string | null
          cross_docking: number | null
          dados_nfe: Json | null
          data_validade: string | null
          descricao_completa: string | null
          descricao_curta: string | null
          ean: string | null
          estoque_atual: number | null
          estoque_depositos: Json | null
          estoque_minimo: number | null
          formato: string | null
          fornecedor_codigo: string | null
          fornecedor_id: number | null
          fornecedor_nome: string | null
          frete_gratis: boolean | null
          garantia: number | null
          gtin: string | null
          gtin_embalagem: string | null
          id: string
          imagem_url: string | null
          imagens: Json | null
          integration_id: string
          largura: number | null
          localizacao: string | null
          marca: string | null
          ncm: string | null
          nome: string
          observacoes: string | null
          origem: number | null
          peso_bruto: number | null
          peso_liquido: number | null
          preco: number | null
          preco_custo: number | null
          producao_propria: boolean | null
          produto_pai_id: number | null
          profundidade: number | null
          raw_data: Json | null
          situacao: string | null
          sob_encomenda: boolean | null
          synced_at: string | null
          tenant_id: string
          tipo: string | null
          tributacao: Json | null
          unidade: string | null
          updated_at: string | null
          variacoes: Json | null
          volumes_por_produto: number | null
        }
        Insert: {
          altura?: number | null
          bling_id: number
          campos_customizados?: Json | null
          categoria_id?: number | null
          categoria_nome?: string | null
          cest?: string | null
          classe_fiscal?: string | null
          codigo?: string | null
          condicao?: number | null
          created_at?: string | null
          cross_docking?: number | null
          dados_nfe?: Json | null
          data_validade?: string | null
          descricao_completa?: string | null
          descricao_curta?: string | null
          ean?: string | null
          estoque_atual?: number | null
          estoque_depositos?: Json | null
          estoque_minimo?: number | null
          formato?: string | null
          fornecedor_codigo?: string | null
          fornecedor_id?: number | null
          fornecedor_nome?: string | null
          frete_gratis?: boolean | null
          garantia?: number | null
          gtin?: string | null
          gtin_embalagem?: string | null
          id?: string
          imagem_url?: string | null
          imagens?: Json | null
          integration_id: string
          largura?: number | null
          localizacao?: string | null
          marca?: string | null
          ncm?: string | null
          nome: string
          observacoes?: string | null
          origem?: number | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          preco_custo?: number | null
          producao_propria?: boolean | null
          produto_pai_id?: number | null
          profundidade?: number | null
          raw_data?: Json | null
          situacao?: string | null
          sob_encomenda?: boolean | null
          synced_at?: string | null
          tenant_id: string
          tipo?: string | null
          tributacao?: Json | null
          unidade?: string | null
          updated_at?: string | null
          variacoes?: Json | null
          volumes_por_produto?: number | null
        }
        Update: {
          altura?: number | null
          bling_id?: number
          campos_customizados?: Json | null
          categoria_id?: number | null
          categoria_nome?: string | null
          cest?: string | null
          classe_fiscal?: string | null
          codigo?: string | null
          condicao?: number | null
          created_at?: string | null
          cross_docking?: number | null
          dados_nfe?: Json | null
          data_validade?: string | null
          descricao_completa?: string | null
          descricao_curta?: string | null
          ean?: string | null
          estoque_atual?: number | null
          estoque_depositos?: Json | null
          estoque_minimo?: number | null
          formato?: string | null
          fornecedor_codigo?: string | null
          fornecedor_id?: number | null
          fornecedor_nome?: string | null
          frete_gratis?: boolean | null
          garantia?: number | null
          gtin?: string | null
          gtin_embalagem?: string | null
          id?: string
          imagem_url?: string | null
          imagens?: Json | null
          integration_id?: string
          largura?: number | null
          localizacao?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string
          observacoes?: string | null
          origem?: number | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          preco_custo?: number | null
          producao_propria?: boolean | null
          produto_pai_id?: number | null
          profundidade?: number | null
          raw_data?: Json | null
          situacao?: string | null
          sob_encomenda?: boolean | null
          synced_at?: string | null
          tenant_id?: string
          tipo?: string | null
          tributacao?: Json | null
          unidade?: string | null
          updated_at?: string | null
          variacoes?: Json | null
          volumes_por_produto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_products_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_situacoes: {
        Row: {
          cor: string | null
          created_at: string | null
          id: string
          id_herdado: number | null
          integration_id: string
          modulo_id: number
          modulo_nome: string | null
          nome: string
          situacao_id: number
          synced_at: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          id?: string
          id_herdado?: number | null
          integration_id: string
          modulo_id: number
          modulo_nome?: string | null
          nome: string
          situacao_id: number
          synced_at?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          id?: string
          id_herdado?: number | null
          integration_id?: string
          modulo_id?: number
          modulo_nome?: string | null
          nome?: string
          situacao_id?: number
          synced_at?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_situacoes_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_situacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_sync_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string | null
          current_page: number | null
          error_message: string | null
          id: string
          integration_id: string
          job_type: string
          last_heartbeat_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_pages_per_run: number
          max_retries: number | null
          processed_count: number | null
          resume_page: number
          retry_count: number | null
          saved_count: number | null
          started_at: string | null
          status: string | null
          sync_log_id: string
          tenant_id: string
          total_count: number | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          current_page?: number | null
          error_message?: string | null
          id?: string
          integration_id: string
          job_type: string
          last_heartbeat_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_pages_per_run?: number
          max_retries?: number | null
          processed_count?: number | null
          resume_page?: number
          retry_count?: number | null
          saved_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_log_id: string
          tenant_id: string
          total_count?: number | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string | null
          current_page?: number | null
          error_message?: string | null
          id?: string
          integration_id?: string
          job_type?: string
          last_heartbeat_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_pages_per_run?: number
          max_retries?: number | null
          processed_count?: number | null
          resume_page?: number
          retry_count?: number | null
          saved_count?: number | null
          started_at?: string | null
          status?: string | null
          sync_log_id?: string
          tenant_id?: string
          total_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_sync_jobs_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "bling_sync_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_sync_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_sync_logs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          integration_id: string
          records_synced: number | null
          started_at: string | null
          status: string | null
          sync_type: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id: string
          records_synced?: number | null
          started_at?: string | null
          status?: string | null
          sync_type: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string
          records_synced?: number | null
          started_at?: string | null
          status?: string | null
          sync_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bling_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_sync_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bling_webhook_events: {
        Row: {
          action: string
          company_id: string
          error: string | null
          event_key: string
          id: string
          payload: Json
          processed_at: string | null
          received_at: string | null
          resource: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          error?: string | null
          event_key: string
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string | null
          resource: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          error?: string | null
          event_key?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string | null
          resource?: string
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bling_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          delay_max_seconds: number | null
          delay_seconds: number
          delivered_count: number
          failed_count: number
          id: string
          media_type: string | null
          media_url: string | null
          message_template: string
          name: string
          next_send_at: string | null
          processing_lock_until: string | null
          read_count: number
          scheduled_at: string | null
          sending_schedule: Json | null
          sent_count: number
          started_at: string | null
          status: string
          tenant_id: string
          timezone: string | null
          tokens_per_message: number
          total_contacts: number
          total_tokens_used: number
          updated_at: string
          whatsapp_integration_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          delay_max_seconds?: number | null
          delay_seconds?: number
          delivered_count?: number
          failed_count?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_template: string
          name: string
          next_send_at?: string | null
          processing_lock_until?: string | null
          read_count?: number
          scheduled_at?: string | null
          sending_schedule?: Json | null
          sent_count?: number
          started_at?: string | null
          status?: string
          tenant_id: string
          timezone?: string | null
          tokens_per_message?: number
          total_contacts?: number
          total_tokens_used?: number
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          delay_max_seconds?: number | null
          delay_seconds?: number
          delivered_count?: number
          failed_count?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_template?: string
          name?: string
          next_send_at?: string | null
          processing_lock_until?: string | null
          read_count?: number
          scheduled_at?: string | null
          sending_schedule?: Json | null
          sent_count?: number
          started_at?: string | null
          status?: string
          tenant_id?: string
          timezone?: string | null
          tokens_per_message?: number
          total_contacts?: number
          total_tokens_used?: number
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_campaigns_whatsapp_integration_id_fkey"
            columns: ["whatsapp_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean | null
          start_time: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          start_time?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean | null
          start_time?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          name: string | null
          phone: string
          read_at: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          variables: Json | null
          whatsapp_message_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          name?: string | null
          phone: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          variables?: Json | null
          whatsapp_message_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          name?: string | null
          phone?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          variables?: Json | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_balances: {
        Row: {
          balance: number
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_configs: {
        Row: {
          coupon_duration_days: number
          created_at: string
          discount_percentage: number
          email_body_html: string | null
          email_body_text: string | null
          email_integration_id: string | null
          email_subject: string | null
          id: string
          integration_id: string | null
          integration_name: string
          is_active: boolean
          max_discount_value: number | null
          message_template: string | null
          min_purchase_value: number | null
          name: string
          reminder_1_days_before: number | null
          reminder_1_enabled: boolean | null
          reminder_1_message: string | null
          reminder_2_days_before: number | null
          reminder_2_enabled: boolean | null
          reminder_2_message: string | null
          send_via_email: boolean | null
          send_via_whatsapp: boolean | null
          tenant_id: string | null
          trigger_statuses: string[] | null
          updated_at: string
          webhook_url: string | null
          whatsapp_integration_id: string | null
        }
        Insert: {
          coupon_duration_days?: number
          created_at?: string
          discount_percentage?: number
          email_body_html?: string | null
          email_body_text?: string | null
          email_integration_id?: string | null
          email_subject?: string | null
          id?: string
          integration_id?: string | null
          integration_name: string
          is_active?: boolean
          max_discount_value?: number | null
          message_template?: string | null
          min_purchase_value?: number | null
          name?: string
          reminder_1_days_before?: number | null
          reminder_1_enabled?: boolean | null
          reminder_1_message?: string | null
          reminder_2_days_before?: number | null
          reminder_2_enabled?: boolean | null
          reminder_2_message?: string | null
          send_via_email?: boolean | null
          send_via_whatsapp?: boolean | null
          tenant_id?: string | null
          trigger_statuses?: string[] | null
          updated_at?: string
          webhook_url?: string | null
          whatsapp_integration_id?: string | null
        }
        Update: {
          coupon_duration_days?: number
          created_at?: string
          discount_percentage?: number
          email_body_html?: string | null
          email_body_text?: string | null
          email_integration_id?: string | null
          email_subject?: string | null
          id?: string
          integration_id?: string | null
          integration_name?: string
          is_active?: boolean
          max_discount_value?: number | null
          message_template?: string | null
          min_purchase_value?: number | null
          name?: string
          reminder_1_days_before?: number | null
          reminder_1_enabled?: boolean | null
          reminder_1_message?: string | null
          reminder_2_days_before?: number | null
          reminder_2_enabled?: boolean | null
          reminder_2_message?: string | null
          send_via_email?: boolean | null
          send_via_whatsapp?: boolean | null
          tenant_id?: string | null
          trigger_statuses?: string[] | null
          updated_at?: string
          webhook_url?: string | null
          whatsapp_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashback_configs_email_integration_id_fkey"
            columns: ["email_integration_id"]
            isOneToOne: false
            referencedRelation: "email_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_configs_whatsapp_integration_id_fkey"
            columns: ["whatsapp_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_executions: {
        Row: {
          action_type: string
          config_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          error_message: string | null
          executed_at: string
          id: string
          metadata: Json | null
          order_id: string | null
          order_number: string | null
          reminder_id: string | null
          status: string
          tenant_id: string | null
          tokens_used: number | null
        }
        Insert: {
          action_type: string
          config_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          order_number?: string | null
          reminder_id?: string | null
          status?: string
          tenant_id?: string | null
          tokens_used?: number | null
        }
        Update: {
          action_type?: string
          config_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          error_message?: string | null
          executed_at?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          order_number?: string | null
          reminder_id?: string | null
          status?: string
          tenant_id?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cashback_executions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "cashback_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_executions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "generated_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_executions_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "cashback_reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_reminders: {
        Row: {
          config_id: string | null
          coupon_id: string
          created_at: string
          error_message: string | null
          id: string
          message: string | null
          reminder_number: number
          scheduled_date: string
          sent_at: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          webhook_payload: Json | null
          webhook_url: string | null
        }
        Insert: {
          config_id?: string | null
          coupon_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string | null
          reminder_number: number
          scheduled_date: string
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          webhook_payload?: Json | null
          webhook_url?: string | null
        }
        Update: {
          config_id?: string | null
          coupon_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string | null
          reminder_number?: number
          scheduled_date?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          webhook_payload?: Json | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashback_reminders_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "cashback_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_reminders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "generated_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_breaker_state: {
        Row: {
          failure_count: number
          id: string
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          opened_at: string | null
          provider: string
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          failure_count?: number
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          provider: string
          state?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          failure_count?: number
          id?: string
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          provider?: string
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circuit_breaker_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_blocks: {
        Row: {
          created_at: string
          id: string
          phone_e164: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_e164: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_e164?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_custom_field_values: {
        Row: {
          contact_id: string
          created_at: string
          field_id: string
          id: string
          tenant_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          field_id: string
          id?: string
          tenant_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          field_id?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_field_values_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_custom_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "contact_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_custom_field_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_custom_fields: {
        Row: {
          created_at: string
          field_type: string
          id: string
          is_required: boolean
          name: string
          options: Json | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_type?: string
          id?: string
          is_required?: boolean
          name: string
          options?: Json | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          is_required?: boolean
          name?: string
          options?: Json | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_merges: {
        Row: {
          created_at: string
          id: string
          merged_at: string | null
          merged_contact_id: string
          primary_contact_id: string
          similarity_score: number
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merged_at?: string | null
          merged_contact_id: string
          primary_contact_id: string
          similarity_score?: number
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merged_at?: string | null
          merged_contact_id?: string
          primary_contact_id?: string
          similarity_score?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_merges_merged_contact_id_fkey"
            columns: ["merged_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_merges_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_merges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          li_customer_id: string | null
          metadata: Json | null
          name: string | null
          phone: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          li_customer_id?: string | null
          metadata?: Json | null
          name?: string | null
          phone: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          li_customer_id?: string | null
          metadata?: Json | null
          name?: string | null
          phone?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_li_customer_id_fkey"
            columns: ["li_customer_id"]
            isOneToOne: false
            referencedRelation: "li_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          payload_json: Json | null
          tenant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          payload_json?: Json | null
          tenant_id: string
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload_json?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          conversation_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_enabled: boolean
          assigned_to: string | null
          awaiting_phone_input: boolean | null
          bot_locked_until: string | null
          bot_state_json: Json | null
          buffered_message_ids: string[] | null
          channel_id: string | null
          chatwoot_conversation_id: number | null
          closed_at: string | null
          contact_id: string
          created_at: string
          current_ai_agent_id: string | null
          handoff_mode: boolean
          id: string
          inbox_id: string | null
          integration_id: string | null
          kanban_column_id: string | null
          last_inbound_at: string | null
          last_incoming_message_id: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          lead_capture_data: Json | null
          lead_capture_state: string | null
          pending_ai_response_at: string | null
          priority: string
          source: string
          status: string
          tenant_id: string
          updated_at: string
          verification_data: Json | null
          verification_state: string | null
        }
        Insert: {
          ai_enabled?: boolean
          assigned_to?: string | null
          awaiting_phone_input?: boolean | null
          bot_locked_until?: string | null
          bot_state_json?: Json | null
          buffered_message_ids?: string[] | null
          channel_id?: string | null
          chatwoot_conversation_id?: number | null
          closed_at?: string | null
          contact_id: string
          created_at?: string
          current_ai_agent_id?: string | null
          handoff_mode?: boolean
          id?: string
          inbox_id?: string | null
          integration_id?: string | null
          kanban_column_id?: string | null
          last_inbound_at?: string | null
          last_incoming_message_id?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          lead_capture_data?: Json | null
          lead_capture_state?: string | null
          pending_ai_response_at?: string | null
          priority?: string
          source?: string
          status?: string
          tenant_id: string
          updated_at?: string
          verification_data?: Json | null
          verification_state?: string | null
        }
        Update: {
          ai_enabled?: boolean
          assigned_to?: string | null
          awaiting_phone_input?: boolean | null
          bot_locked_until?: string | null
          bot_state_json?: Json | null
          buffered_message_ids?: string[] | null
          channel_id?: string | null
          chatwoot_conversation_id?: number | null
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          current_ai_agent_id?: string | null
          handoff_mode?: boolean
          id?: string
          inbox_id?: string | null
          integration_id?: string | null
          kanban_column_id?: string | null
          last_inbound_at?: string | null
          last_incoming_message_id?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          lead_capture_data?: Json | null
          lead_capture_state?: string | null
          pending_ai_response_at?: string | null
          priority?: string
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          verification_data?: Json | null
          verification_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_current_ai_agent_id_fkey"
            columns: ["current_ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_inbox_id_fkey"
            columns: ["inbox_id"]
            isOneToOne: false
            referencedRelation: "inboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_kanban_column_id_fkey"
            columns: ["kanban_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_segments: {
        Row: {
          contact_count: number
          created_at: string
          filters: Json
          id: string
          last_computed_at: string | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_count?: number
          created_at?: string
          filters?: Json
          id?: string
          last_computed_at?: string | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_count?: number
          created_at?: string
          filters?: Json
          id?: string
          last_computed_at?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rfm_category_snapshots: {
        Row: {
          aov: number | null
          category_name: string
          created_at: string
          customer_id: string
          customer_name: string | null
          f_score: number | null
          id: string
          integration_id: string
          last_order_date: string | null
          m_score: number | null
          orders_count: number | null
          r_score: number | null
          recency_days: number | null
          reference_date: string
          revenue_total: number | null
          rfm_score: string | null
          segment_name: string | null
          source_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          aov?: number | null
          category_name: string
          created_at?: string
          customer_id: string
          customer_name?: string | null
          f_score?: number | null
          id?: string
          integration_id: string
          last_order_date?: string | null
          m_score?: number | null
          orders_count?: number | null
          r_score?: number | null
          recency_days?: number | null
          reference_date?: string
          revenue_total?: number | null
          rfm_score?: string | null
          segment_name?: string | null
          source_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          aov?: number | null
          category_name?: string
          created_at?: string
          customer_id?: string
          customer_name?: string | null
          f_score?: number | null
          id?: string
          integration_id?: string
          last_order_date?: string | null
          m_score?: number | null
          orders_count?: number | null
          r_score?: number | null
          recency_days?: number | null
          reference_date?: string
          revenue_total?: number | null
          rfm_score?: string | null
          segment_name?: string | null
          source_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_rfm_category_snapshots_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rfm_category_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rfm_snapshots: {
        Row: {
          aov: number | null
          avg_order_interval_days: number | null
          churn_risk: string | null
          created_at: string
          customer_doc: string | null
          customer_email: string | null
          customer_id: string
          customer_name: string | null
          customer_phone: string | null
          f_score: number | null
          id: string
          ideal_offer_window_end: number | null
          ideal_offer_window_start: number | null
          integration_id: string
          last_order_date: string | null
          m_score: number | null
          orders_count: number | null
          predicted_next_purchase_date: string | null
          purchase_probability_15d: number | null
          purchase_probability_30d: number | null
          purchase_probability_7d: number | null
          r_score: number | null
          recency_days: number | null
          reference_date: string
          revenue_total: number | null
          rfm_score: string | null
          segment_action: string | null
          segment_name: string | null
          source_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          aov?: number | null
          avg_order_interval_days?: number | null
          churn_risk?: string | null
          created_at?: string
          customer_doc?: string | null
          customer_email?: string | null
          customer_id: string
          customer_name?: string | null
          customer_phone?: string | null
          f_score?: number | null
          id?: string
          ideal_offer_window_end?: number | null
          ideal_offer_window_start?: number | null
          integration_id: string
          last_order_date?: string | null
          m_score?: number | null
          orders_count?: number | null
          predicted_next_purchase_date?: string | null
          purchase_probability_15d?: number | null
          purchase_probability_30d?: number | null
          purchase_probability_7d?: number | null
          r_score?: number | null
          recency_days?: number | null
          reference_date?: string
          revenue_total?: number | null
          rfm_score?: string | null
          segment_action?: string | null
          segment_name?: string | null
          source_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          aov?: number | null
          avg_order_interval_days?: number | null
          churn_risk?: string | null
          created_at?: string
          customer_doc?: string | null
          customer_email?: string | null
          customer_id?: string
          customer_name?: string | null
          customer_phone?: string | null
          f_score?: number | null
          id?: string
          ideal_offer_window_end?: number | null
          ideal_offer_window_start?: number | null
          integration_id?: string
          last_order_date?: string | null
          m_score?: number | null
          orders_count?: number | null
          predicted_next_purchase_date?: string | null
          purchase_probability_15d?: number | null
          purchase_probability_30d?: number | null
          purchase_probability_7d?: number | null
          r_score?: number | null
          recency_days?: number | null
          reference_date?: string
          revenue_total?: number | null
          rfm_score?: string | null
          segment_action?: string | null
          segment_name?: string | null
          source_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_rfm_snapshots_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rfm_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          created_at: string
          customer_id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "li_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_queue: {
        Row: {
          attempts: number
          channel_id: string | null
          channel_type: string
          correlation_id: string | null
          created_at: string
          destination: string
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          payload: Json
          retried_at: string | null
          source_item_id: string
          source_queue: string
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          channel_id?: string | null
          channel_type: string
          correlation_id?: string | null
          created_at?: string
          destination: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          payload?: Json
          retried_at?: string | null
          source_item_id: string
          source_queue: string
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          channel_id?: string | null
          channel_type?: string
          correlation_id?: string | null
          created_at?: string
          destination?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          payload?: Json
          retried_at?: string | null
          source_item_id?: string
          source_queue?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaign_logs: {
        Row: {
          campaign_id: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_data: Json | null
          event_type: string
          id: string
          is_test: boolean
          recipient_email: string | null
          recipient_name: string | null
          sender_email: string | null
          sent_at: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          is_test?: boolean
          recipient_email?: string | null
          recipient_name?: string | null
          sender_email?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          is_test?: boolean
          recipient_email?: string | null
          recipient_name?: string | null
          sender_email?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience_reference: string | null
          audience_type: string | null
          campaign_type: Database["public"]["Enums"]["email_campaign_type"]
          completed_at: string | null
          compliance_checked_at: string | null
          content_html: string | null
          content_json: Json | null
          created_at: string
          email_integration_id: string | null
          error_message: string | null
          has_unsubscribe_link: boolean | null
          id: string
          internal_name: string
          is_archived: boolean | null
          preheader: string | null
          reply_to: string | null
          scheduled_at: string | null
          sender_email: string
          sender_name: string
          sent_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["email_campaign_status"]
          subject: string
          template_id: string | null
          tenant_id: string
          total_bounced: number | null
          total_clicked: number | null
          total_complained: number | null
          total_delivered: number | null
          total_opened: number | null
          total_recipients: number | null
          total_sent: number | null
          total_unsubscribed: number | null
          updated_at: string
        }
        Insert: {
          audience_reference?: string | null
          audience_type?: string | null
          campaign_type: Database["public"]["Enums"]["email_campaign_type"]
          completed_at?: string | null
          compliance_checked_at?: string | null
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          email_integration_id?: string | null
          error_message?: string | null
          has_unsubscribe_link?: boolean | null
          id?: string
          internal_name: string
          is_archived?: boolean | null
          preheader?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          sender_email: string
          sender_name: string
          sent_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["email_campaign_status"]
          subject: string
          template_id?: string | null
          tenant_id: string
          total_bounced?: number | null
          total_clicked?: number | null
          total_complained?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_recipients?: number | null
          total_sent?: number | null
          total_unsubscribed?: number | null
          updated_at?: string
        }
        Update: {
          audience_reference?: string | null
          audience_type?: string | null
          campaign_type?: Database["public"]["Enums"]["email_campaign_type"]
          completed_at?: string | null
          compliance_checked_at?: string | null
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          email_integration_id?: string | null
          error_message?: string | null
          has_unsubscribe_link?: boolean | null
          id?: string
          internal_name?: string
          is_archived?: boolean | null
          preheader?: string | null
          reply_to?: string | null
          scheduled_at?: string | null
          sender_email?: string
          sender_name?: string
          sent_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["email_campaign_status"]
          subject?: string
          template_id?: string | null
          tenant_id?: string
          total_bounced?: number | null
          total_clicked?: number | null
          total_complained?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_recipients?: number | null
          total_sent?: number | null
          total_unsubscribed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_email_integration_id_fkey"
            columns: ["email_integration_id"]
            isOneToOne: false
            referencedRelation: "email_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          campaign_id: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          link_url: string | null
          log_id: string | null
          metadata: Json | null
          recipient_email: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          log_id?: string | null
          metadata?: Json | null
          recipient_email: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          log_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "email_campaign_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_integration_senders: {
        Row: {
          created_at: string
          id: string
          integration_id: string
          is_active: boolean
          sender_email: string
          sender_name: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id: string
          is_active?: boolean
          sender_email: string
          sender_name?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string
          is_active?: boolean
          sender_email?: string
          sender_name?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_integration_senders_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "email_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_integration_senders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_integrations: {
        Row: {
          created_at: string
          daily_send_limit: number | null
          id: string
          is_active: boolean
          max_sends_per_second: number | null
          name: string
          reply_to: string | null
          sender_email: string
          sender_name: string | null
          smtp_host: string
          smtp_password: string
          smtp_password_encrypted: string | null
          smtp_port: number
          smtp_secure: boolean | null
          smtp_tls: boolean | null
          smtp_user: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_send_limit?: number | null
          id?: string
          is_active?: boolean
          max_sends_per_second?: number | null
          name: string
          reply_to?: string | null
          sender_email: string
          sender_name?: string | null
          smtp_host: string
          smtp_password: string
          smtp_password_encrypted?: string | null
          smtp_port?: number
          smtp_secure?: boolean | null
          smtp_tls?: boolean | null
          smtp_user: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_send_limit?: number | null
          id?: string
          is_active?: boolean
          max_sends_per_second?: number | null
          name?: string
          reply_to?: string | null
          sender_email?: string
          sender_name?: string | null
          smtp_host?: string
          smtp_password?: string
          smtp_password_encrypted?: string | null
          smtp_port?: number
          smtp_secure?: boolean | null
          smtp_tls?: boolean | null
          smtp_user?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppression_list: {
        Row: {
          campaign_id: string | null
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
          source: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
          source?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
          source?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_suppression_list_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_suppression_list_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          content_html: string | null
          content_json: Json | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          template_type: Database["public"]["Enums"]["email_template_type"]
          tenant_id: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          template_type: Database["public"]["Enums"]["email_template_type"]
          tenant_id: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          template_type?: Database["public"]["Enums"]["email_template_type"]
          tenant_id?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          last_clicked_at: string | null
          last_opened_at: string | null
          recipient_email: string
          recipient_name: string | null
          tenant_id: string
          used_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          tenant_id: string
          used_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          last_clicked_at?: string | null
          last_opened_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          tenant_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribe_tokens_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_unsubscribe_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      function_metrics: {
        Row: {
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          function_name: string
          id: string
          items_dead: number | null
          items_failed: number | null
          items_processed: number | null
          metadata: Json | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name: string
          id?: string
          items_dead?: number | null
          items_failed?: number | null
          items_processed?: number | null
          metadata?: Json | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string
          id?: string
          items_dead?: number | null
          items_failed?: number | null
          items_processed?: number | null
          metadata?: Json | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "function_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_coupons: {
        Row: {
          config_id: string | null
          coupon_code: string
          coupon_description: string | null
          coupon_type: string | null
          coupon_value: number | null
          created_at: string
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_percentage: number
          expires_at: string
          id: string
          integration_id: string | null
          li_coupon_id: number | null
          li_data_fim: string | null
          li_data_inicio: string | null
          li_quantidade_usada: number | null
          li_quantidade_uso_maximo: number | null
          order_id: string | null
          source: string | null
          tenant_id: string | null
          used_at: string | null
          used_in_order_id: string | null
          used_order_value: number | null
        }
        Insert: {
          config_id?: string | null
          coupon_code: string
          coupon_description?: string | null
          coupon_type?: string | null
          coupon_value?: number | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_percentage: number
          expires_at: string
          id?: string
          integration_id?: string | null
          li_coupon_id?: number | null
          li_data_fim?: string | null
          li_data_inicio?: string | null
          li_quantidade_usada?: number | null
          li_quantidade_uso_maximo?: number | null
          order_id?: string | null
          source?: string | null
          tenant_id?: string | null
          used_at?: string | null
          used_in_order_id?: string | null
          used_order_value?: number | null
        }
        Update: {
          config_id?: string | null
          coupon_code?: string
          coupon_description?: string | null
          coupon_type?: string | null
          coupon_value?: number | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_percentage?: number
          expires_at?: string
          id?: string
          integration_id?: string | null
          li_coupon_id?: number | null
          li_data_fim?: string | null
          li_data_inicio?: string | null
          li_quantidade_usada?: number | null
          li_quantidade_uso_maximo?: number | null
          order_id?: string | null
          source?: string | null
          tenant_id?: string | null
          used_at?: string | null
          used_in_order_id?: string | null
          used_order_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_coupons_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "cashback_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_coupons_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_routing_rules: {
        Row: {
          channel: string
          condition_type: string
          condition_value: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          target_inbox_id: string | null
          target_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          condition_type?: string
          condition_value?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          target_inbox_id?: string | null
          target_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          condition_type?: string
          condition_value?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          target_inbox_id?: string | null
          target_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_routing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inboxes: {
        Row: {
          ai_agent_id: string | null
          bot_enabled: boolean
          business_hours_json: Json | null
          channel_id: string
          created_at: string
          id: string
          integration_id: string | null
          is_active: boolean
          name: string
          sla_first_response_minutes: number | null
          sla_resolution_minutes: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_agent_id?: string | null
          bot_enabled?: boolean
          business_hours_json?: Json | null
          channel_id: string
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          name: string
          sla_first_response_minutes?: number | null
          sla_resolution_minutes?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_agent_id?: string | null
          bot_enabled?: boolean
          business_hours_json?: Json | null
          channel_id?: string
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          name?: string
          sla_first_response_minutes?: number | null
          sla_resolution_minutes?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inboxes_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inboxes_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inboxes_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inboxes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_ad_welcome_flows: {
        Row: {
          ad_id: string | null
          adset_id: string | null
          campaign_id: string | null
          channel_id: string
          created_at: string
          flow_id: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          channel_id: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ad_id?: string | null
          adset_id?: string | null
          campaign_id?: string | null
          channel_id?: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_ad_welcome_flows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_ai_flow_drafts: {
        Row: {
          channel_id: string
          converted_flow_id: string | null
          created_at: string | null
          cta: string | null
          data_fields: string[] | null
          generated_edges: Json | null
          generated_nodes: Json | null
          id: string
          include_handoff: boolean | null
          language: string | null
          objective: string | null
          status: string | null
          suggested_fields: string[] | null
          suggested_tags: string[] | null
          tenant_id: string
          tone: string | null
          trigger_type: string | null
          validation_report: Json | null
        }
        Insert: {
          channel_id: string
          converted_flow_id?: string | null
          created_at?: string | null
          cta?: string | null
          data_fields?: string[] | null
          generated_edges?: Json | null
          generated_nodes?: Json | null
          id?: string
          include_handoff?: boolean | null
          language?: string | null
          objective?: string | null
          status?: string | null
          suggested_fields?: string[] | null
          suggested_tags?: string[] | null
          tenant_id: string
          tone?: string | null
          trigger_type?: string | null
          validation_report?: Json | null
        }
        Update: {
          channel_id?: string
          converted_flow_id?: string | null
          created_at?: string | null
          cta?: string | null
          data_fields?: string[] | null
          generated_edges?: Json | null
          generated_nodes?: Json | null
          id?: string
          include_handoff?: boolean | null
          language?: string | null
          objective?: string | null
          status?: string | null
          suggested_fields?: string[] | null
          suggested_tags?: string[] | null
          tenant_id?: string
          tone?: string | null
          trigger_type?: string | null
          validation_report?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_ai_flow_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_blocked_users: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          channel_id: string
          contact_id: string
          id: string
          igsid: string | null
          is_active: boolean | null
          reason: string | null
          tenant_id: string
          unblocked_at: string | null
          username: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          channel_id: string
          contact_id: string
          id?: string
          igsid?: string | null
          is_active?: boolean | null
          reason?: string | null
          tenant_id: string
          unblocked_at?: string | null
          username?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          channel_id?: string
          contact_id?: string
          id?: string
          igsid?: string | null
          is_active?: boolean | null
          reason?: string | null
          tenant_id?: string
          unblocked_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_blocked_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_channel_capabilities: {
        Row: {
          channel_id: string
          comments: boolean
          content_publish: boolean
          created_at: string
          follow_to_dm: boolean
          ice_breakers: boolean
          id: string
          insights: boolean
          live_comments: boolean
          moderation: boolean
          persistent_menu: boolean
          private_replies: boolean
          raw_capabilities: Json | null
          share_to_dm: boolean
          story_mention: boolean
          story_reply: boolean
          tenant_id: string
          updated_at: string
          welcome_ads: boolean
        }
        Insert: {
          channel_id: string
          comments?: boolean
          content_publish?: boolean
          created_at?: string
          follow_to_dm?: boolean
          ice_breakers?: boolean
          id?: string
          insights?: boolean
          live_comments?: boolean
          moderation?: boolean
          persistent_menu?: boolean
          private_replies?: boolean
          raw_capabilities?: Json | null
          share_to_dm?: boolean
          story_mention?: boolean
          story_reply?: boolean
          tenant_id: string
          updated_at?: string
          welcome_ads?: boolean
        }
        Update: {
          channel_id?: string
          comments?: boolean
          content_publish?: boolean
          created_at?: string
          follow_to_dm?: boolean
          ice_breakers?: boolean
          id?: string
          insights?: boolean
          live_comments?: boolean
          moderation?: boolean
          persistent_menu?: boolean
          private_replies?: boolean
          raw_capabilities?: Json | null
          share_to_dm?: boolean
          story_mention?: boolean
          story_reply?: boolean
          tenant_id?: string
          updated_at?: string
          welcome_ads?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "instagram_channel_capabilities_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_channel_capabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_channel_insights: {
        Row: {
          audience_demographics: Json | null
          channel_id: string
          created_at: string | null
          email_contacts: number | null
          followers_count: number | null
          follows_count: number | null
          get_directions_clicks: number | null
          id: string
          impressions: number | null
          insight_date: string
          insights_raw: Json | null
          media_count: number | null
          online_followers: Json | null
          phone_call_clicks: number | null
          profile_views: number | null
          reach: number | null
          synced_at: string | null
          tenant_id: string
          website_clicks: number | null
        }
        Insert: {
          audience_demographics?: Json | null
          channel_id: string
          created_at?: string | null
          email_contacts?: number | null
          followers_count?: number | null
          follows_count?: number | null
          get_directions_clicks?: number | null
          id?: string
          impressions?: number | null
          insight_date: string
          insights_raw?: Json | null
          media_count?: number | null
          online_followers?: Json | null
          phone_call_clicks?: number | null
          profile_views?: number | null
          reach?: number | null
          synced_at?: string | null
          tenant_id: string
          website_clicks?: number | null
        }
        Update: {
          audience_demographics?: Json | null
          channel_id?: string
          created_at?: string | null
          email_contacts?: number | null
          followers_count?: number | null
          follows_count?: number | null
          get_directions_clicks?: number | null
          id?: string
          impressions?: number | null
          insight_date?: string
          insights_raw?: Json | null
          media_count?: number | null
          online_followers?: Json | null
          phone_call_clicks?: number | null
          profile_views?: number | null
          reach?: number | null
          synced_at?: string | null
          tenant_id?: string
          website_clicks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_channel_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_channels: {
        Row: {
          access_token_encrypted: string
          app_mode: string
          created_at: string
          default_locale: string | null
          default_timezone: string | null
          id: string
          ig_user_id: string
          instagram_username: string | null
          last_healthcheck_at: string | null
          last_sync_at: string | null
          metadata: Json | null
          name: string
          status: Database["public"]["Enums"]["instagram_channel_status"]
          tenant_id: string
          token_expires_at: string | null
          token_refresh_at: string | null
          updated_at: string
          webhook_verified: boolean
        }
        Insert: {
          access_token_encrypted: string
          app_mode?: string
          created_at?: string
          default_locale?: string | null
          default_timezone?: string | null
          id?: string
          ig_user_id: string
          instagram_username?: string | null
          last_healthcheck_at?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          name: string
          status?: Database["public"]["Enums"]["instagram_channel_status"]
          tenant_id: string
          token_expires_at?: string | null
          token_refresh_at?: string | null
          updated_at?: string
          webhook_verified?: boolean
        }
        Update: {
          access_token_encrypted?: string
          app_mode?: string
          created_at?: string
          default_locale?: string | null
          default_timezone?: string | null
          id?: string
          ig_user_id?: string
          instagram_username?: string | null
          last_healthcheck_at?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          name?: string
          status?: Database["public"]["Enums"]["instagram_channel_status"]
          tenant_id?: string
          token_expires_at?: string | null
          token_refresh_at?: string | null
          updated_at?: string
          webhook_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "instagram_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_comment_queue: {
        Row: {
          channel_id: string
          commenter_igsid: string | null
          commenter_username: string | null
          created_at: string | null
          flagged_terms: string[] | null
          id: string
          ig_comment_id: string
          ig_media_id: string | null
          is_deleted: boolean | null
          is_hidden: boolean | null
          is_live_comment: boolean | null
          media_type: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: string | null
          parent_comment_id: string | null
          replied_privately: boolean | null
          replied_publicly: boolean | null
          tenant_id: string
          text: string | null
        }
        Insert: {
          channel_id: string
          commenter_igsid?: string | null
          commenter_username?: string | null
          created_at?: string | null
          flagged_terms?: string[] | null
          id?: string
          ig_comment_id: string
          ig_media_id?: string | null
          is_deleted?: boolean | null
          is_hidden?: boolean | null
          is_live_comment?: boolean | null
          media_type?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string | null
          parent_comment_id?: string | null
          replied_privately?: boolean | null
          replied_publicly?: boolean | null
          tenant_id: string
          text?: string | null
        }
        Update: {
          channel_id?: string
          commenter_igsid?: string | null
          commenter_username?: string | null
          created_at?: string | null
          flagged_terms?: string[] | null
          id?: string
          ig_comment_id?: string
          ig_media_id?: string | null
          is_deleted?: boolean | null
          is_hidden?: boolean | null
          is_live_comment?: boolean | null
          media_type?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string | null
          parent_comment_id?: string | null
          replied_privately?: boolean | null
          replied_publicly?: boolean | null
          tenant_id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comment_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_comment_replies_log: {
        Row: {
          channel_id: string
          comment_id: string
          created_at: string
          id: string
          reply_type: string
          tenant_id: string
          watchlist_id: string | null
        }
        Insert: {
          channel_id: string
          comment_id: string
          created_at?: string
          id?: string
          reply_type: string
          tenant_id: string
          watchlist_id?: string | null
        }
        Update: {
          channel_id?: string
          comment_id?: string
          created_at?: string
          id?: string
          reply_type?: string
          tenant_id?: string
          watchlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_comment_replies_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_contact_pauses: {
        Row: {
          channel_id: string
          contact_id: string
          created_at: string
          id: string
          paused_by: string | null
          paused_until: string | null
          reason: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          contact_id: string
          created_at?: string
          id?: string
          paused_by?: string | null
          paused_until?: string | null
          reason?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          paused_by?: string | null
          paused_until?: string | null
          reason?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_contact_pauses_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contact_pauses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contact_pauses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "instagram_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contact_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_contacts: {
        Row: {
          channel_id: string
          created_at: string
          custom_fields: Json | null
          display_name: string | null
          email: string | null
          email_consent_at: string | null
          email_source: string | null
          email_verified: boolean | null
          first_seen_at: string
          human_window_expires_at: string | null
          id: string
          igsid: string
          instagram_username: string | null
          is_blocked: boolean
          last_seen_at: string
          last_user_interaction_at: string | null
          phone: string | null
          phone_consent_at: string | null
          phone_source: string | null
          phone_verified: boolean | null
          profile_pic_url: string | null
          source_first_entry: string | null
          standard_window_expires_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          custom_fields?: Json | null
          display_name?: string | null
          email?: string | null
          email_consent_at?: string | null
          email_source?: string | null
          email_verified?: boolean | null
          first_seen_at?: string
          human_window_expires_at?: string | null
          id?: string
          igsid: string
          instagram_username?: string | null
          is_blocked?: boolean
          last_seen_at?: string
          last_user_interaction_at?: string | null
          phone?: string | null
          phone_consent_at?: string | null
          phone_source?: string | null
          phone_verified?: boolean | null
          profile_pic_url?: string | null
          source_first_entry?: string | null
          standard_window_expires_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          custom_fields?: Json | null
          display_name?: string | null
          email?: string | null
          email_consent_at?: string | null
          email_source?: string | null
          email_verified?: boolean | null
          first_seen_at?: string
          human_window_expires_at?: string | null
          id?: string
          igsid?: string
          instagram_username?: string | null
          is_blocked?: boolean
          last_seen_at?: string
          last_user_interaction_at?: string | null
          phone?: string | null
          phone_consent_at?: string | null
          phone_source?: string | null
          phone_verified?: boolean | null
          profile_pic_url?: string | null
          source_first_entry?: string | null
          standard_window_expires_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_contacts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_content: {
        Row: {
          caption: string | null
          channel_id: string
          content_type: string
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          id: string
          ig_media_id: string | null
          ig_permalink: string | null
          linked_flow_id: string | null
          linked_trigger_type: string | null
          media_urls: string[] | null
          metadata: Json | null
          published_at: string | null
          scheduled_at: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          caption?: string | null
          channel_id: string
          content_type: string
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          ig_media_id?: string | null
          ig_permalink?: string | null
          linked_flow_id?: string | null
          linked_trigger_type?: string | null
          media_urls?: string[] | null
          metadata?: Json | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          caption?: string | null
          channel_id?: string
          content_type?: string
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          id?: string
          ig_media_id?: string | null
          ig_permalink?: string | null
          linked_flow_id?: string | null
          linked_trigger_type?: string | null
          media_urls?: string[] | null
          metadata?: Json | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_content_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_content_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_cta_link_clicks: {
        Row: {
          clicked_at: string | null
          contact_id: string | null
          cta_link_id: string
          id: string
          message_id: string | null
          tenant_id: string
          thread_id: string | null
        }
        Insert: {
          clicked_at?: string | null
          contact_id?: string | null
          cta_link_id: string
          id?: string
          message_id?: string | null
          tenant_id: string
          thread_id?: string | null
        }
        Update: {
          clicked_at?: string | null
          contact_id?: string | null
          cta_link_id?: string
          id?: string
          message_id?: string | null
          tenant_id?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_cta_link_clicks_cta_link_id_fkey"
            columns: ["cta_link_id"]
            isOneToOne: false
            referencedRelation: "instagram_cta_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_cta_link_clicks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_cta_links: {
        Row: {
          channel_id: string
          click_count: number | null
          created_at: string | null
          flow_id: string | null
          id: string
          is_active: boolean | null
          label: string
          node_id: string | null
          ref_key: string | null
          tenant_id: string
          url: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          version_id: string | null
        }
        Insert: {
          channel_id: string
          click_count?: number | null
          created_at?: string | null
          flow_id?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          node_id?: string | null
          ref_key?: string | null
          tenant_id: string
          url: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          version_id?: string | null
        }
        Update: {
          channel_id?: string
          click_count?: number | null
          created_at?: string | null
          flow_id?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          node_id?: string | null
          ref_key?: string | null
          tenant_id?: string
          url?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_cta_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_data_collection_events: {
        Row: {
          channel_id: string
          consent_given: boolean | null
          consent_text: string | null
          contact_id: string
          created_at: string | null
          field_name: string
          field_value: string
          flow_id: string | null
          flow_run_id: string | null
          id: string
          node_id: string | null
          source: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          consent_given?: boolean | null
          consent_text?: string | null
          contact_id: string
          created_at?: string | null
          field_name: string
          field_value: string
          flow_id?: string | null
          flow_run_id?: string | null
          id?: string
          node_id?: string | null
          source?: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          consent_given?: boolean | null
          consent_text?: string | null
          contact_id?: string
          created_at?: string | null
          field_name?: string
          field_value?: string
          flow_id?: string | null
          flow_run_id?: string | null
          id?: string
          node_id?: string | null
          source?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_data_collection_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_deep_links: {
        Row: {
          channel_id: string
          click_count: number
          conversation_count: number
          created_at: string
          flow_id: string | null
          id: string
          is_active: boolean
          metadata: Json | null
          ref_key: string
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          click_count?: number
          conversation_count?: number
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          ref_key: string
          slug: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          click_count?: number
          conversation_count?: number
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json | null
          ref_key?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_deep_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_event_log: {
        Row: {
          channel_id: string | null
          contact_id: string | null
          created_at: string
          event_source: string | null
          event_time: string
          event_type: string
          id: string
          normalized_payload: Json | null
          provider_object_id: string | null
          tenant_id: string
          thread_id: string | null
        }
        Insert: {
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_source?: string | null
          event_time?: string
          event_type: string
          id?: string
          normalized_payload?: Json | null
          provider_object_id?: string | null
          tenant_id: string
          thread_id?: string | null
        }
        Update: {
          channel_id?: string | null
          contact_id?: string | null
          created_at?: string
          event_source?: string | null
          event_time?: string
          event_type?: string
          id?: string
          normalized_payload?: Json | null
          provider_object_id?: string | null
          tenant_id?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_event_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_event_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_event_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_event_log_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "instagram_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_experimental_executions: {
        Row: {
          channel_id: string
          config_id: string | null
          contact_id: string
          created_at: string
          execution_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          config_id?: string | null
          contact_id: string
          created_at?: string
          execution_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          config_id?: string | null
          contact_id?: string
          created_at?: string
          execution_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_experimental_executions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_experimental_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_feature_flags: {
        Row: {
          channel_id: string
          created_at: string
          enabled_at: string | null
          enabled_by: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          enabled_at?: string | null
          enabled_by?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          enabled_at?: string | null
          enabled_by?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_feature_flags_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flow_edges: {
        Row: {
          condition: Json | null
          created_at: string
          id: string
          label: string | null
          source_handle: string | null
          source_node_id: string
          target_node_id: string
          tenant_id: string
          version_id: string
        }
        Insert: {
          condition?: Json | null
          created_at?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id: string
          target_node_id: string
          tenant_id: string
          version_id: string
        }
        Update: {
          condition?: Json | null
          created_at?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_node_id?: string
          target_node_id?: string
          tenant_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_edges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_edges_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flow_nodes: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_entry: boolean
          label: string | null
          node_type: string
          position_x: number
          position_y: number
          tenant_id: string
          version_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_entry?: boolean
          label?: string | null
          node_type: string
          position_x?: number
          position_y?: number
          tenant_id: string
          version_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_entry?: boolean
          label?: string | null
          node_type?: string
          position_x?: number
          position_y?: number
          tenant_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_nodes_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flow_run_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input: Json | null
          node_id: string
          node_type: string
          output: Json | null
          run_id: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json | null
          node_id: string
          node_type: string
          output?: Json | null
          run_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json | null
          node_id?: string
          node_type?: string
          output?: Json | null
          run_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_run_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flow_runs: {
        Row: {
          completed_at: string | null
          contact_id: string
          context: Json
          created_at: string
          current_node_id: string | null
          error_message: string | null
          flow_id: string
          id: string
          idempotency_key: string | null
          paused_by_contact_rule: boolean
          started_at: string
          status: string
          tenant_id: string
          thread_id: string
          trigger_rule_id: string | null
          version_id: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          context?: Json
          created_at?: string
          current_node_id?: string | null
          error_message?: string | null
          flow_id: string
          id?: string
          idempotency_key?: string | null
          paused_by_contact_rule?: boolean
          started_at?: string
          status?: string
          tenant_id: string
          thread_id: string
          trigger_rule_id?: string | null
          version_id: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          context?: Json
          created_at?: string
          current_node_id?: string | null
          error_message?: string | null
          flow_id?: string
          id?: string
          idempotency_key?: string | null
          paused_by_contact_rule?: boolean
          started_at?: string
          status?: string
          tenant_id?: string
          thread_id?: string
          trigger_rule_id?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "instagram_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flow_versions: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          published_at: string | null
          published_by: string | null
          snapshot: Json | null
          status: string
          tenant_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          snapshot?: Json | null
          status?: string
          tenant_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          snapshot?: Json | null
          status?: string
          tenant_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flow_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flow_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_flows: {
        Row: {
          allow_parallel_runs: boolean
          channel_id: string
          created_at: string
          description: string | null
          id: string
          live_version_id: string | null
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_parallel_runs?: boolean
          channel_id: string
          created_at?: string
          description?: string | null
          id?: string
          live_version_id?: string | null
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_parallel_runs?: boolean
          channel_id?: string
          created_at?: string
          description?: string | null
          id?: string
          live_version_id?: string | null
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_flows_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flows_live_version_id_fkey"
            columns: ["live_version_id"]
            isOneToOne: false
            referencedRelation: "instagram_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_flows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_follow_dm_configs: {
        Row: {
          channel_id: string
          created_at: string
          delay_seconds: number
          flow_id: string | null
          id: string
          is_active: boolean
          once_per_user: boolean
          tenant_id: string
          updated_at: string
          welcome_text: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          delay_seconds?: number
          flow_id?: string | null
          id?: string
          is_active?: boolean
          once_per_user?: boolean
          tenant_id: string
          updated_at?: string
          welcome_text?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          delay_seconds?: number
          flow_id?: string | null
          id?: string
          is_active?: boolean
          once_per_user?: boolean
          tenant_id?: string
          updated_at?: string
          welcome_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_follow_dm_configs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_follow_dm_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_ice_breakers: {
        Row: {
          channel_id: string
          created_at: string
          flow_id: string | null
          id: string
          is_active: boolean
          sort_order: number
          tenant_id: string
          text: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          tenant_id: string
          text: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          tenant_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_ice_breakers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_media_insights: {
        Row: {
          caption: string | null
          channel_id: string
          comments: number | null
          created_at: string | null
          dm_leads_captured: number | null
          dm_threads_generated: number | null
          id: string
          ig_media_id: string
          impressions: number | null
          insights_raw: Json | null
          likes: number | null
          media_type: string | null
          permalink: string | null
          plays: number | null
          reach: number | null
          saves: number | null
          shares: number | null
          synced_at: string | null
          tenant_id: string
          timestamp: string | null
          updated_at: string | null
        }
        Insert: {
          caption?: string | null
          channel_id: string
          comments?: number | null
          created_at?: string | null
          dm_leads_captured?: number | null
          dm_threads_generated?: number | null
          id?: string
          ig_media_id: string
          impressions?: number | null
          insights_raw?: Json | null
          likes?: number | null
          media_type?: string | null
          permalink?: string | null
          plays?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          synced_at?: string | null
          tenant_id: string
          timestamp?: string | null
          updated_at?: string | null
        }
        Update: {
          caption?: string | null
          channel_id?: string
          comments?: number | null
          created_at?: string | null
          dm_leads_captured?: number | null
          dm_threads_generated?: number | null
          id?: string
          ig_media_id?: string
          impressions?: number | null
          insights_raw?: Json | null
          likes?: number | null
          media_type?: string | null
          permalink?: string | null
          plays?: number | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          synced_at?: string | null
          tenant_id?: string
          timestamp?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_media_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_media_watchlist: {
        Row: {
          channel_id: string
          created_at: string
          delay_seconds: number | null
          dm_message: string | null
          first_comment_only: boolean
          id: string
          is_active: boolean
          keyword_responses: Json | null
          keywords_exclude: string[] | null
          keywords_include: string[] | null
          media_id: string | null
          media_type: string
          private_reply_enabled: boolean
          private_reply_flow_id: string | null
          reply_public_enabled: boolean
          reply_public_variants: string[] | null
          round_robin_index: number
          rule_name: string | null
          tenant_id: string
          updated_at: string
          watch_mode: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          delay_seconds?: number | null
          dm_message?: string | null
          first_comment_only?: boolean
          id?: string
          is_active?: boolean
          keyword_responses?: Json | null
          keywords_exclude?: string[] | null
          keywords_include?: string[] | null
          media_id?: string | null
          media_type?: string
          private_reply_enabled?: boolean
          private_reply_flow_id?: string | null
          reply_public_enabled?: boolean
          reply_public_variants?: string[] | null
          round_robin_index?: number
          rule_name?: string | null
          tenant_id: string
          updated_at?: string
          watch_mode?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          delay_seconds?: number | null
          dm_message?: string | null
          first_comment_only?: boolean
          id?: string
          is_active?: boolean
          keyword_responses?: Json | null
          keywords_exclude?: string[] | null
          keywords_include?: string[] | null
          media_id?: string | null
          media_type?: string
          private_reply_enabled?: boolean
          private_reply_flow_id?: string | null
          reply_public_enabled?: boolean
          reply_public_variants?: string[] | null
          round_robin_index?: number
          rule_name?: string | null
          tenant_id?: string
          updated_at?: string
          watch_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_media_watchlist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_messages: {
        Row: {
          created_at: string
          cta_click_tracked: boolean | null
          cta_link_id: string | null
          delivery_status: Database["public"]["Enums"]["instagram_delivery_status"]
          direction: Database["public"]["Enums"]["instagram_message_direction"]
          error_code: string | null
          error_message: string | null
          id: string
          media_url: string | null
          message_type: string
          payload: Json | null
          provider_message_id: string | null
          sent_by_user_id: string | null
          tenant_id: string
          text_body: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_click_tracked?: boolean | null
          cta_link_id?: string | null
          delivery_status?: Database["public"]["Enums"]["instagram_delivery_status"]
          direction: Database["public"]["Enums"]["instagram_message_direction"]
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          payload?: Json | null
          provider_message_id?: string | null
          sent_by_user_id?: string | null
          tenant_id: string
          text_body?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_click_tracked?: boolean | null
          cta_link_id?: string | null
          delivery_status?: Database["public"]["Enums"]["instagram_delivery_status"]
          direction?: Database["public"]["Enums"]["instagram_message_direction"]
          error_code?: string | null
          error_message?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          payload?: Json | null
          provider_message_id?: string | null
          sent_by_user_id?: string | null
          tenant_id?: string
          text_body?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "instagram_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_metrics_daily: {
        Row: {
          ad_entry_triggers: number | null
          avg_first_response_seconds: number | null
          avg_human_mode_seconds: number | null
          channel_id: string
          comment_triggers: number | null
          created_at: string | null
          cta_clicks: number | null
          emails_captured: number | null
          flow_metrics: Json | null
          flows_completed: number | null
          flows_started: number | null
          handoffs_to_human: number | null
          id: string
          inbound_messages: number | null
          live_comment_triggers: number | null
          media_metrics: Json | null
          metric_date: string
          new_threads: number | null
          operator_metrics: Json | null
          outbound_messages: number | null
          pauses_count: number | null
          phones_captured: number | null
          private_replies_sent: number | null
          ref_url_entries: number | null
          send_failures: number | null
          story_mention_triggers: number | null
          story_reply_triggers: number | null
          tenant_id: string
          trigger_metrics: Json | null
          updated_at: string | null
        }
        Insert: {
          ad_entry_triggers?: number | null
          avg_first_response_seconds?: number | null
          avg_human_mode_seconds?: number | null
          channel_id: string
          comment_triggers?: number | null
          created_at?: string | null
          cta_clicks?: number | null
          emails_captured?: number | null
          flow_metrics?: Json | null
          flows_completed?: number | null
          flows_started?: number | null
          handoffs_to_human?: number | null
          id?: string
          inbound_messages?: number | null
          live_comment_triggers?: number | null
          media_metrics?: Json | null
          metric_date: string
          new_threads?: number | null
          operator_metrics?: Json | null
          outbound_messages?: number | null
          pauses_count?: number | null
          phones_captured?: number | null
          private_replies_sent?: number | null
          ref_url_entries?: number | null
          send_failures?: number | null
          story_mention_triggers?: number | null
          story_reply_triggers?: number | null
          tenant_id: string
          trigger_metrics?: Json | null
          updated_at?: string | null
        }
        Update: {
          ad_entry_triggers?: number | null
          avg_first_response_seconds?: number | null
          avg_human_mode_seconds?: number | null
          channel_id?: string
          comment_triggers?: number | null
          created_at?: string | null
          cta_clicks?: number | null
          emails_captured?: number | null
          flow_metrics?: Json | null
          flows_completed?: number | null
          flows_started?: number | null
          handoffs_to_human?: number | null
          id?: string
          inbound_messages?: number | null
          live_comment_triggers?: number | null
          media_metrics?: Json | null
          metric_date?: string
          new_threads?: number | null
          operator_metrics?: Json | null
          outbound_messages?: number | null
          pauses_count?: number | null
          phones_captured?: number | null
          private_replies_sent?: number | null
          ref_url_entries?: number | null
          send_failures?: number | null
          story_mention_triggers?: number | null
          story_reply_triggers?: number | null
          tenant_id?: string
          trigger_metrics?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_metrics_daily_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_outbox: {
        Row: {
          attempt_count: number
          channel_id: string
          contact_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          message_kind: string
          payload: Json
          provider_message_id: string | null
          send_after: string
          status: Database["public"]["Enums"]["instagram_outbox_status"]
          tenant_id: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel_id: string
          contact_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          message_kind?: string
          payload: Json
          provider_message_id?: string | null
          send_after?: string
          status?: Database["public"]["Enums"]["instagram_outbox_status"]
          tenant_id: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel_id?: string
          contact_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          message_kind?: string
          payload?: Json
          provider_message_id?: string | null
          send_after?: string
          status?: Database["public"]["Enums"]["instagram_outbox_status"]
          tenant_id?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_outbox_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_outbox_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_outbox_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "instagram_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_persistent_menu_items: {
        Row: {
          action_payload: string | null
          action_type: string
          channel_id: string
          created_at: string
          flow_id: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_payload?: string | null
          action_type?: string
          channel_id: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_payload?: string | null
          action_type?: string
          channel_id?: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_persistent_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_quick_automation_installs: {
        Row: {
          channel_id: string
          flow_id: string
          id: string
          installed_at: string | null
          template_id: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          flow_id: string
          id?: string
          installed_at?: string | null
          template_id: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          flow_id?: string
          id?: string
          installed_at?: string | null
          template_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_quick_automation_installs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "instagram_quick_automation_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_quick_automation_installs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_quick_automation_templates: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          required_capabilities: string[] | null
          slug: string
          sort_order: number | null
          template_edges: Json
          template_nodes: Json
          trigger_config: Json | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          required_capabilities?: string[] | null
          slug: string
          sort_order?: number | null
          template_edges?: Json
          template_nodes?: Json
          trigger_config?: Json | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          required_capabilities?: string[] | null
          slug?: string
          sort_order?: number | null
          template_edges?: Json
          template_nodes?: Json
          trigger_config?: Json | null
        }
        Relationships: []
      }
      instagram_share_dm_configs: {
        Row: {
          channel_id: string
          created_at: string
          flow_id: string | null
          id: string
          is_active: boolean
          once_per_user_per_automation: boolean
          target_media_id: string | null
          target_mode: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          once_per_user_per_automation?: boolean
          target_media_id?: string | null
          target_mode?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          once_per_user_per_automation?: boolean
          target_media_id?: string | null
          target_mode?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_share_dm_configs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_share_dm_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_tags: {
        Row: {
          channel_id: string
          color: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          channel_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          channel_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_tags_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_term_blacklist: {
        Row: {
          action: string | null
          channel_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          term: string
        }
        Insert: {
          action?: string | null
          channel_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          term: string
        }
        Update: {
          action?: string | null
          channel_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_term_blacklist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_threads: {
        Row: {
          assigned_user_id: string | null
          automation_pause_reason: string | null
          automation_pause_source: string | null
          automations_paused_until: string | null
          channel_id: string
          closed_at: string | null
          contact_id: string
          created_at: string
          current_mode: string
          entrypoint_ref: string | null
          entrypoint_type: string | null
          id: string
          is_spam: boolean | null
          last_message_at: string | null
          last_message_preview: string | null
          provider_thread_id: string | null
          spam_marked_at: string | null
          spam_marked_by: string | null
          tenant_id: string
          thread_status: Database["public"]["Enums"]["instagram_thread_status"]
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          automation_pause_reason?: string | null
          automation_pause_source?: string | null
          automations_paused_until?: string | null
          channel_id: string
          closed_at?: string | null
          contact_id: string
          created_at?: string
          current_mode?: string
          entrypoint_ref?: string | null
          entrypoint_type?: string | null
          id?: string
          is_spam?: boolean | null
          last_message_at?: string | null
          last_message_preview?: string | null
          provider_thread_id?: string | null
          spam_marked_at?: string | null
          spam_marked_by?: string | null
          tenant_id: string
          thread_status?: Database["public"]["Enums"]["instagram_thread_status"]
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          automation_pause_reason?: string | null
          automation_pause_source?: string | null
          automations_paused_until?: string | null
          channel_id?: string
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          current_mode?: string
          entrypoint_ref?: string | null
          entrypoint_type?: string | null
          id?: string
          is_spam?: boolean | null
          last_message_at?: string | null
          last_message_preview?: string | null
          provider_thread_id?: string | null
          spam_marked_at?: string | null
          spam_marked_by?: string | null
          tenant_id?: string
          thread_status?: Database["public"]["Enums"]["instagram_thread_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_threads_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_threads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_trigger_rules: {
        Row: {
          config: Json
          created_at: string
          environment: string
          flow_id: string
          id: string
          is_active: boolean
          keyword_match_mode: string | null
          keywords: string[] | null
          priority: number
          tag_filter_ids: string[] | null
          tenant_id: string
          throttle_mode: string
          time_filter: Json | null
          timeout_seconds: number | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          environment?: string
          flow_id: string
          id?: string
          is_active?: boolean
          keyword_match_mode?: string | null
          keywords?: string[] | null
          priority?: number
          tag_filter_ids?: string[] | null
          tenant_id: string
          throttle_mode?: string
          time_filter?: Json | null
          timeout_seconds?: number | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          environment?: string
          flow_id?: string
          id?: string
          is_active?: boolean
          keyword_match_mode?: string | null
          keywords?: string[] | null
          priority?: number
          tag_filter_ids?: string[] | null
          tenant_id?: string
          throttle_mode?: string
          time_filter?: Json | null
          timeout_seconds?: number | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_trigger_rules_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "instagram_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_trigger_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_webhook_deliveries: {
        Row: {
          channel_id: string | null
          created_at: string
          error_message: string | null
          event_hash: string | null
          id: string
          parse_status: string | null
          payload: Json
          processed: boolean
          processed_at: string | null
          provider_delivery_key: string | null
          signature_valid: boolean | null
          tenant_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          event_hash?: string | null
          id?: string
          parse_status?: string | null
          payload: Json
          processed?: boolean
          processed_at?: string | null
          provider_delivery_key?: string | null
          signature_valid?: boolean | null
          tenant_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          event_hash?: string | null
          id?: string
          parse_status?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider_delivery_key?: string | null
          signature_valid?: boolean | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_webhook_deliveries_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "instagram_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key: string | null
          auto_sync_carts: boolean | null
          auto_sync_carts_interval: number | null
          auto_sync_coupons: boolean | null
          auto_sync_coupons_interval: number | null
          auto_sync_customers: boolean | null
          auto_sync_customers_interval: number | null
          auto_sync_enabled: boolean | null
          auto_sync_interval_minutes: number | null
          auto_sync_orders: boolean | null
          auto_sync_orders_interval: number | null
          auto_sync_products: boolean | null
          auto_sync_products_interval: number | null
          auto_sync_shipments: boolean | null
          auto_sync_shipments_interval: number | null
          bling_store_ids: number[] | null
          created_at: string
          error_message: string | null
          id: string
          initial_sync_completed: boolean | null
          last_auto_sync_at: string | null
          last_carts_sync_at: string | null
          last_customers_sync_at: string | null
          last_orders_sync_at: string | null
          last_products_sync_at: string | null
          last_sync_at: string | null
          last_sync_carts_at: string | null
          last_sync_coupons_at: string | null
          last_sync_customers_at: string | null
          last_sync_orders_at: string | null
          last_sync_products_at: string | null
          last_sync_shipments_at: string | null
          metadata: Json | null
          name: string
          status: string
          store_integration_id: string | null
          tenant_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          auto_sync_carts?: boolean | null
          auto_sync_carts_interval?: number | null
          auto_sync_coupons?: boolean | null
          auto_sync_coupons_interval?: number | null
          auto_sync_customers?: boolean | null
          auto_sync_customers_interval?: number | null
          auto_sync_enabled?: boolean | null
          auto_sync_interval_minutes?: number | null
          auto_sync_orders?: boolean | null
          auto_sync_orders_interval?: number | null
          auto_sync_products?: boolean | null
          auto_sync_products_interval?: number | null
          auto_sync_shipments?: boolean | null
          auto_sync_shipments_interval?: number | null
          bling_store_ids?: number[] | null
          created_at?: string
          error_message?: string | null
          id?: string
          initial_sync_completed?: boolean | null
          last_auto_sync_at?: string | null
          last_carts_sync_at?: string | null
          last_customers_sync_at?: string | null
          last_orders_sync_at?: string | null
          last_products_sync_at?: string | null
          last_sync_at?: string | null
          last_sync_carts_at?: string | null
          last_sync_coupons_at?: string | null
          last_sync_customers_at?: string | null
          last_sync_orders_at?: string | null
          last_sync_products_at?: string | null
          last_sync_shipments_at?: string | null
          metadata?: Json | null
          name: string
          status?: string
          store_integration_id?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          auto_sync_carts?: boolean | null
          auto_sync_carts_interval?: number | null
          auto_sync_coupons?: boolean | null
          auto_sync_coupons_interval?: number | null
          auto_sync_customers?: boolean | null
          auto_sync_customers_interval?: number | null
          auto_sync_enabled?: boolean | null
          auto_sync_interval_minutes?: number | null
          auto_sync_orders?: boolean | null
          auto_sync_orders_interval?: number | null
          auto_sync_products?: boolean | null
          auto_sync_products_interval?: number | null
          auto_sync_shipments?: boolean | null
          auto_sync_shipments_interval?: number | null
          bling_store_ids?: number[] | null
          created_at?: string
          error_message?: string | null
          id?: string
          initial_sync_completed?: boolean | null
          last_auto_sync_at?: string | null
          last_carts_sync_at?: string | null
          last_customers_sync_at?: string | null
          last_orders_sync_at?: string | null
          last_products_sync_at?: string | null
          last_sync_at?: string | null
          last_sync_carts_at?: string | null
          last_sync_coupons_at?: string | null
          last_sync_customers_at?: string | null
          last_sync_orders_at?: string | null
          last_sync_products_at?: string | null
          last_sync_shipments_at?: string | null
          metadata?: Json | null
          name?: string
          status?: string
          store_integration_id?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_store_integration_id_fkey"
            columns: ["store_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default_for_new: boolean
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default_for_new?: boolean
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default_for_new?: boolean
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          email: string | null
          id: string
          integration_id: string | null
          metadata: Json | null
          name: string | null
          phone: string | null
          source: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          integration_id?: string | null
          metadata?: Json | null
          name?: string | null
          phone?: string | null
          source?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          integration_id?: string | null
          metadata?: Json | null
          name?: string | null
          phone?: string | null
          source?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      li_customers: {
        Row: {
          address_json: Json | null
          doc: string | null
          email: string | null
          id: string
          integration_id: string
          loja_integrada_customer_id: number
          name: string
          phone: string | null
          raw_json: Json | null
          tenant_id: string
          updated_at_local: string
          updated_at_remote: string | null
        }
        Insert: {
          address_json?: Json | null
          doc?: string | null
          email?: string | null
          id?: string
          integration_id: string
          loja_integrada_customer_id: number
          name: string
          phone?: string | null
          raw_json?: Json | null
          tenant_id: string
          updated_at_local?: string
          updated_at_remote?: string | null
        }
        Update: {
          address_json?: Json | null
          doc?: string | null
          email?: string | null
          id?: string
          integration_id?: string
          loja_integrada_customer_id?: number
          name?: string
          phone?: string | null
          raw_json?: Json | null
          tenant_id?: string
          updated_at_local?: string
          updated_at_remote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "li_customers_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      li_order_items: {
        Row: {
          id: string
          loja_integrada_product_id: number | null
          name: string
          order_id: string
          price: number | null
          qty: number
          raw_json: Json | null
          sku: string | null
          tenant_id: string
        }
        Insert: {
          id?: string
          loja_integrada_product_id?: number | null
          name: string
          order_id: string
          price?: number | null
          qty?: number
          raw_json?: Json | null
          sku?: string | null
          tenant_id: string
        }
        Update: {
          id?: string
          loja_integrada_product_id?: number | null
          name?: string
          order_id?: string
          price?: number | null
          qty?: number
          raw_json?: Json | null
          sku?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "li_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "li_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      li_orders: {
        Row: {
          created_at_remote: string | null
          customer_id: string | null
          id: string
          integration_id: string
          items_json: Json | null
          last_status_check_at: string | null
          loja_integrada_order_id: number
          order_number: string
          payment_json: Json | null
          raw_json: Json | null
          shipping_json: Json | null
          status_id: number | null
          status_name: string | null
          tenant_id: string
          totals_json: Json | null
          updated_at_local: string
          updated_at_remote: string | null
        }
        Insert: {
          created_at_remote?: string | null
          customer_id?: string | null
          id?: string
          integration_id: string
          items_json?: Json | null
          last_status_check_at?: string | null
          loja_integrada_order_id: number
          order_number: string
          payment_json?: Json | null
          raw_json?: Json | null
          shipping_json?: Json | null
          status_id?: number | null
          status_name?: string | null
          tenant_id: string
          totals_json?: Json | null
          updated_at_local?: string
          updated_at_remote?: string | null
        }
        Update: {
          created_at_remote?: string | null
          customer_id?: string | null
          id?: string
          integration_id?: string
          items_json?: Json | null
          last_status_check_at?: string | null
          loja_integrada_order_id?: number
          order_number?: string
          payment_json?: Json | null
          raw_json?: Json | null
          shipping_json?: Json | null
          status_id?: number | null
          status_name?: string | null
          tenant_id?: string
          totals_json?: Json | null
          updated_at_local?: string
          updated_at_remote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "li_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "li_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_orders_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      li_products: {
        Row: {
          active: boolean | null
          cost_price: number | null
          id: string
          image_url: string | null
          integration_id: string
          loja_integrada_product_id: number
          name: string
          price: number | null
          promotional_price: number | null
          raw_json: Json | null
          sku: string | null
          stock: number | null
          stock_managed: boolean | null
          tenant_id: string
          updated_at_local: string
          updated_at_remote: string | null
          variations_json: Json | null
        }
        Insert: {
          active?: boolean | null
          cost_price?: number | null
          id?: string
          image_url?: string | null
          integration_id: string
          loja_integrada_product_id: number
          name: string
          price?: number | null
          promotional_price?: number | null
          raw_json?: Json | null
          sku?: string | null
          stock?: number | null
          stock_managed?: boolean | null
          tenant_id: string
          updated_at_local?: string
          updated_at_remote?: string | null
          variations_json?: Json | null
        }
        Update: {
          active?: boolean | null
          cost_price?: number | null
          id?: string
          image_url?: string | null
          integration_id?: string
          loja_integrada_product_id?: number
          name?: string
          price?: number | null
          promotional_price?: number | null
          raw_json?: Json | null
          sku?: string | null
          stock?: number | null
          stock_managed?: boolean | null
          tenant_id?: string
          updated_at_local?: string
          updated_at_remote?: string | null
          variations_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "li_products_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      li_sync_state: {
        Row: {
          entity_type: string
          id: string
          integration_id: string
          last_cursor: string | null
          last_offset: number | null
          last_synced_at: string | null
          records_synced: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          entity_type: string
          id?: string
          integration_id: string
          last_cursor?: string | null
          last_offset?: number | null
          last_synced_at?: string | null
          records_synced?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          entity_type?: string
          id?: string
          integration_id?: string
          last_cursor?: string | null
          last_offset?: number | null
          last_synced_at?: string | null
          records_synced?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "li_sync_state_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_sync_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      li_webhook_events: {
        Row: {
          dedupe_key: string
          error: string | null
          event_type: string
          id: string
          integration_id: string | null
          payload_json: Json | null
          processed_at: string | null
          received_at: string
          resource_id: string | null
          resource_type: string
          retry_count: number
          status: string
          tenant_id: string | null
        }
        Insert: {
          dedupe_key: string
          error?: string | null
          event_type: string
          id?: string
          integration_id?: string | null
          payload_json?: Json | null
          processed_at?: string | null
          received_at?: string
          resource_id?: string | null
          resource_type: string
          retry_count?: number
          status?: string
          tenant_id?: string | null
        }
        Update: {
          dedupe_key?: string
          error?: string | null
          event_type?: string
          id?: string
          integration_id?: string | null
          payload_json?: Json | null
          processed_at?: string | null
          received_at?: string
          resource_id?: string | null
          resource_type?: string
          retry_count?: number
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "li_webhook_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "li_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      me_auto_sync_configs: {
        Row: {
          created_at: string
          id: string
          integration_id: string
          interval_minutes: number
          is_active: boolean
          last_sync_at: string | null
          next_sync_at: string | null
          sync_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id: string
          interval_minutes?: number
          is_active?: boolean
          last_sync_at?: string | null
          next_sync_at?: string | null
          sync_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string
          interval_minutes?: number
          is_active?: boolean
          last_sync_at?: string | null
          next_sync_at?: string | null
          sync_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_auto_sync_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_auto_sync_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      me_shipments: {
        Row: {
          additional_info: Json | null
          agency_address: Json | null
          agency_name: string | null
          authorization_code: string | null
          billed_weight: number | null
          bling_order_id: string | null
          canceled_at: string | null
          carrier: string | null
          collect: boolean | null
          conciliation: Json | null
          contract: string | null
          created_at: string | null
          cte_key: string | null
          delivered_at: string | null
          delivery_max: number | null
          delivery_min: number | null
          dimensions: Json | null
          discount: number | null
          estimated_delivery_at: string | null
          expired_at: string | null
          external_order_number: string | null
          financial_details: Json | null
          format: string | null
          from_address: Json | null
          generated_at: string | null
          height: number | null
          id: string
          insurance_value: number | null
          integration_id: string | null
          invoice: Json | null
          last_sync_at: string | null
          last_tracking_at: string | null
          length: number | null
          li_order_id: string | null
          me_id: string
          non_commercial: boolean | null
          order_id: string | null
          order_number: string | null
          own_hand: boolean | null
          paid_at: string | null
          posted_at: string | null
          preview_url: string | null
          price: number | null
          print_url: string | null
          products: Json | null
          protocol: string | null
          quote: number | null
          raw_data: Json | null
          receipt: boolean | null
          receiver_address: Json | null
          receiver_city: string | null
          receiver_document: string | null
          receiver_email: string | null
          receiver_name: string | null
          receiver_note: string | null
          receiver_phone: string | null
          receiver_state: string | null
          sender_document: string | null
          sender_email: string | null
          sender_name: string | null
          sender_phone: string | null
          service_details: Json | null
          service_name: string | null
          status: string | null
          synced_at: string | null
          tags: Json | null
          tenant_id: string
          to_address: Json | null
          tracking_code: string | null
          tracking_events: Json | null
          updated_at: string | null
          volumes: Json | null
          weight: number | null
          width: number | null
        }
        Insert: {
          additional_info?: Json | null
          agency_address?: Json | null
          agency_name?: string | null
          authorization_code?: string | null
          billed_weight?: number | null
          bling_order_id?: string | null
          canceled_at?: string | null
          carrier?: string | null
          collect?: boolean | null
          conciliation?: Json | null
          contract?: string | null
          created_at?: string | null
          cte_key?: string | null
          delivered_at?: string | null
          delivery_max?: number | null
          delivery_min?: number | null
          dimensions?: Json | null
          discount?: number | null
          estimated_delivery_at?: string | null
          expired_at?: string | null
          external_order_number?: string | null
          financial_details?: Json | null
          format?: string | null
          from_address?: Json | null
          generated_at?: string | null
          height?: number | null
          id?: string
          insurance_value?: number | null
          integration_id?: string | null
          invoice?: Json | null
          last_sync_at?: string | null
          last_tracking_at?: string | null
          length?: number | null
          li_order_id?: string | null
          me_id: string
          non_commercial?: boolean | null
          order_id?: string | null
          order_number?: string | null
          own_hand?: boolean | null
          paid_at?: string | null
          posted_at?: string | null
          preview_url?: string | null
          price?: number | null
          print_url?: string | null
          products?: Json | null
          protocol?: string | null
          quote?: number | null
          raw_data?: Json | null
          receipt?: boolean | null
          receiver_address?: Json | null
          receiver_city?: string | null
          receiver_document?: string | null
          receiver_email?: string | null
          receiver_name?: string | null
          receiver_note?: string | null
          receiver_phone?: string | null
          receiver_state?: string | null
          sender_document?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          service_details?: Json | null
          service_name?: string | null
          status?: string | null
          synced_at?: string | null
          tags?: Json | null
          tenant_id: string
          to_address?: Json | null
          tracking_code?: string | null
          tracking_events?: Json | null
          updated_at?: string | null
          volumes?: Json | null
          weight?: number | null
          width?: number | null
        }
        Update: {
          additional_info?: Json | null
          agency_address?: Json | null
          agency_name?: string | null
          authorization_code?: string | null
          billed_weight?: number | null
          bling_order_id?: string | null
          canceled_at?: string | null
          carrier?: string | null
          collect?: boolean | null
          conciliation?: Json | null
          contract?: string | null
          created_at?: string | null
          cte_key?: string | null
          delivered_at?: string | null
          delivery_max?: number | null
          delivery_min?: number | null
          dimensions?: Json | null
          discount?: number | null
          estimated_delivery_at?: string | null
          expired_at?: string | null
          external_order_number?: string | null
          financial_details?: Json | null
          format?: string | null
          from_address?: Json | null
          generated_at?: string | null
          height?: number | null
          id?: string
          insurance_value?: number | null
          integration_id?: string | null
          invoice?: Json | null
          last_sync_at?: string | null
          last_tracking_at?: string | null
          length?: number | null
          li_order_id?: string | null
          me_id?: string
          non_commercial?: boolean | null
          order_id?: string | null
          order_number?: string | null
          own_hand?: boolean | null
          paid_at?: string | null
          posted_at?: string | null
          preview_url?: string | null
          price?: number | null
          print_url?: string | null
          products?: Json | null
          protocol?: string | null
          quote?: number | null
          raw_data?: Json | null
          receipt?: boolean | null
          receiver_address?: Json | null
          receiver_city?: string | null
          receiver_document?: string | null
          receiver_email?: string | null
          receiver_name?: string | null
          receiver_note?: string | null
          receiver_phone?: string | null
          receiver_state?: string | null
          sender_document?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          service_details?: Json | null
          service_name?: string | null
          status?: string | null
          synced_at?: string | null
          tags?: Json | null
          tenant_id?: string
          to_address?: Json | null
          tracking_code?: string | null
          tracking_events?: Json | null
          updated_at?: string | null
          volumes?: Json | null
          weight?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "me_shipments_bling_order_id_fkey"
            columns: ["bling_order_id"]
            isOneToOne: false
            referencedRelation: "bling_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_shipments_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      me_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_page: number | null
          cursor_data: Json | null
          error_message: string | null
          id: string
          integration_id: string | null
          items_linked: number | null
          items_saved: number | null
          items_total: number | null
          started_at: string | null
          status: string
          tenant_id: string
          total_pages: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_page?: number | null
          cursor_data?: Json | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          items_linked?: number | null
          items_saved?: number | null
          items_total?: number | null
          started_at?: string | null
          status?: string
          tenant_id: string
          total_pages?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_page?: number | null
          cursor_data?: Json | null
          error_message?: string | null
          id?: string
          integration_id?: string | null
          items_linked?: number | null
          items_saved?: number | null
          items_total?: number | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          total_pages?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "me_sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      melhor_envio_tokens: {
        Row: {
          access_token: string
          access_token_encrypted: string | null
          created_at: string | null
          environment: string | null
          expires_at: string
          id: string
          refresh_token: string
          refresh_token_encrypted: string | null
          tenant_id: string
          updated_at: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          access_token: string
          access_token_encrypted?: string | null
          created_at?: string | null
          environment?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          refresh_token_encrypted?: string | null
          tenant_id: string
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          access_token?: string
          access_token_encrypted?: string | null
          created_at?: string | null
          environment?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          refresh_token_encrypted?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "melhor_envio_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["module_permission"]
          team_member_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["module_permission"]
          team_member_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["module_permission"]
          team_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_permissions_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      message_queue: {
        Row: {
          channel: string
          created_at: string
          email_integration_id: string | null
          html_content: string | null
          id: string
          last_error: string | null
          max_retries: number
          message_content: string
          metadata: Json | null
          next_retry_at: string
          recipient: string
          reference_id: string | null
          reference_type: string | null
          retry_count: number
          sent_at: string | null
          status: string
          subject: string | null
          tenant_id: string
          updated_at: string
          whatsapp_integration_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          email_integration_id?: string | null
          html_content?: string | null
          id?: string
          last_error?: string | null
          max_retries?: number
          message_content: string
          metadata?: Json | null
          next_retry_at?: string
          recipient: string
          reference_id?: string | null
          reference_type?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          email_integration_id?: string | null
          html_content?: string | null
          id?: string
          last_error?: string | null
          max_retries?: number
          message_content?: string
          metadata?: Json | null
          next_retry_at?: string
          recipient?: string
          reference_id?: string | null
          reference_type?: string | null
          retry_count?: number
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_integration_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          chatwoot_message_id: number | null
          content: string
          content_type: string
          conversation_id: string
          created_at: string
          direction: string
          error_json: Json | null
          id: string
          media_url: string | null
          metadata: Json | null
          provider_message_id: string | null
          sender_id: string | null
          sender_type: string
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          chatwoot_message_id?: number | null
          content: string
          content_type?: string
          conversation_id: string
          created_at?: string
          direction?: string
          error_json?: Json | null
          id?: string
          media_url?: string | null
          metadata?: Json | null
          provider_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          status?: string
          tenant_id: string
          type?: string
        }
        Update: {
          chatwoot_message_id?: number | null
          content?: string
          content_type?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error_json?: Json | null
          id?: string
          media_url?: string | null
          metadata?: Json | null
          provider_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string
          desktop_notifications: boolean
          id: string
          new_conversation_sound: string | null
          new_message_sound: string | null
          sound_enabled: boolean
          sound_volume: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desktop_notifications?: boolean
          id?: string
          new_conversation_sound?: string | null
          new_message_sound?: string | null
          sound_enabled?: boolean
          sound_volume?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desktop_notifications?: boolean
          id?: string
          new_conversation_sound?: string | null
          new_message_sound?: string | null
          sound_enabled?: boolean
          sound_volume?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string | null
          expires_at: string
          frontend_url: string | null
          id: string
          metadata: Json | null
          provider: string
          redirect_path: string | null
          state: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          frontend_url?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          redirect_path?: string | null
          state: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          frontend_url?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          redirect_path?: string | null
          state?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      order_notification_configs: {
        Row: {
          created_at: string | null
          email_integration_id: string | null
          id: string
          integration_id: string | null
          is_active: boolean | null
          name: string
          send_via_email: boolean | null
          send_via_whatsapp: boolean | null
          tenant_id: string
          tokens_per_execution: number | null
          updated_at: string | null
          whatsapp_integration_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_integration_id?: string | null
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          name?: string
          send_via_email?: boolean | null
          send_via_whatsapp?: boolean | null
          tenant_id: string
          tokens_per_execution?: number | null
          updated_at?: string | null
          whatsapp_integration_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_integration_id?: string | null
          id?: string
          integration_id?: string | null
          is_active?: boolean | null
          name?: string
          send_via_email?: boolean | null
          send_via_whatsapp?: boolean | null
          tenant_id?: string
          tokens_per_execution?: number | null
          updated_at?: string | null
          whatsapp_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_notification_configs_email_integration_id_fkey"
            columns: ["email_integration_id"]
            isOneToOne: false
            referencedRelation: "email_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notification_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notification_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notification_configs_whatsapp_integration_id_fkey"
            columns: ["whatsapp_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notification_executions: {
        Row: {
          channel: string | null
          config_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_phone: string | null
          error_message: string | null
          id: string
          message_sent: string | null
          order_id: string
          order_number: string | null
          rule_id: string | null
          status: string | null
          status_name: string | null
          tenant_id: string
          tokens_used: number | null
        }
        Insert: {
          channel?: string | null
          config_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          message_sent?: string | null
          order_id: string
          order_number?: string | null
          rule_id?: string | null
          status?: string | null
          status_name?: string | null
          tenant_id: string
          tokens_used?: number | null
        }
        Update: {
          channel?: string | null
          config_id?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_phone?: string | null
          error_message?: string | null
          id?: string
          message_sent?: string | null
          order_id?: string
          order_number?: string | null
          rule_id?: string | null
          status?: string | null
          status_name?: string | null
          tenant_id?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_notification_executions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "order_notification_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notification_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "order_notification_status_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notification_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notification_status_rules: {
        Row: {
          config_id: string
          created_at: string | null
          delay_minutes: number | null
          email_body: string | null
          email_subject: string | null
          id: string
          is_enabled: boolean | null
          message_template: string
          status_id: number | null
          status_name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          config_id: string
          created_at?: string | null
          delay_minutes?: number | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_enabled?: boolean | null
          message_template: string
          status_id?: number | null
          status_name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          config_id?: string
          created_at?: string | null
          delay_minutes?: number | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          is_enabled?: boolean | null
          message_template?: string
          status_id?: number | null
          status_name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_notification_status_rules_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "order_notification_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notification_status_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_queue: {
        Row: {
          attempts: number
          channel_id: string
          created_at: string
          id: string
          last_error: string | null
          message_id: string | null
          next_retry_at: string
          payload_json: Json
          status: string
          tenant_id: string
          to_phone_e164: string
        }
        Insert: {
          attempts?: number
          channel_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id?: string | null
          next_retry_at?: string
          payload_json: Json
          status?: string
          tenant_id: string
          to_phone_e164: string
        }
        Update: {
          attempts?: number
          channel_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id?: string | null
          next_retry_at?: string
          payload_json?: Json
          status?: string
          tenant_id?: string
          to_phone_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          avatar_url: string | null
          checklist_dismissed: boolean | null
          company_name: string | null
          created_at: string
          id: string
          notification_prefs: Json | null
          onboarding_completed: boolean | null
          owner_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          checklist_dismissed?: boolean | null
          company_name?: string | null
          created_at?: string
          id?: string
          notification_prefs?: Json | null
          onboarding_completed?: boolean | null
          owner_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_tenant_id?: string | null
          avatar_url?: string | null
          checklist_dismissed?: boolean | null
          company_name?: string | null
          created_at?: string
          id?: string
          notification_prefs?: Json | null
          onboarding_completed?: boolean | null
          owner_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          id: string
          is_favorite: boolean | null
          shortcut: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          id?: string
          is_favorite?: boolean | null
          shortcut?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          id?: string
          is_favorite?: boolean | null
          shortcut?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reactivation_configs: {
        Row: {
          activated_at: string | null
          coupon_discount_percent: number
          coupon_duration_days: number
          created_at: string | null
          id: string
          inactivity_days: number
          integration_id: string | null
          is_active: boolean | null
          max_cycles: number
          message_template: string
          name: string
          resend_interval_days: number | null
          tenant_id: string
          tokens_per_execution: number
          updated_at: string | null
          whatsapp_integration_id: string | null
        }
        Insert: {
          activated_at?: string | null
          coupon_discount_percent?: number
          coupon_duration_days?: number
          created_at?: string | null
          id?: string
          inactivity_days?: number
          integration_id?: string | null
          is_active?: boolean | null
          max_cycles?: number
          message_template?: string
          name?: string
          resend_interval_days?: number | null
          tenant_id: string
          tokens_per_execution?: number
          updated_at?: string | null
          whatsapp_integration_id?: string | null
        }
        Update: {
          activated_at?: string | null
          coupon_discount_percent?: number
          coupon_duration_days?: number
          created_at?: string | null
          id?: string
          inactivity_days?: number
          integration_id?: string | null
          is_active?: boolean | null
          max_cycles?: number
          message_template?: string
          name?: string
          resend_interval_days?: number | null
          tenant_id?: string
          tokens_per_execution?: number
          updated_at?: string | null
          whatsapp_integration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_configs_whatsapp_integration_id_fkey"
            columns: ["whatsapp_integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      reactivation_cycle_steps: {
        Row: {
          config_id: string
          coupon_discount_percent: number | null
          coupon_duration_days: number | null
          created_at: string
          delay_days: number
          id: string
          is_active: boolean
          message_template: string
          step_number: number
          tenant_id: string
          updated_at: string
          use_custom_coupon: boolean
        }
        Insert: {
          config_id: string
          coupon_discount_percent?: number | null
          coupon_duration_days?: number | null
          created_at?: string
          delay_days?: number
          id?: string
          is_active?: boolean
          message_template?: string
          step_number?: number
          tenant_id: string
          updated_at?: string
          use_custom_coupon?: boolean
        }
        Update: {
          config_id?: string
          coupon_discount_percent?: number | null
          coupon_duration_days?: number | null
          created_at?: string
          delay_days?: number
          id?: string
          is_active?: boolean
          message_template?: string
          step_number?: number
          tenant_id?: string
          updated_at?: string
          use_custom_coupon?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_cycle_steps_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "reactivation_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_cycle_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reactivation_executions: {
        Row: {
          config_id: string | null
          coupon_code: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          cycle_step: number | null
          days_inactive: number | null
          error_message: string | null
          id: string
          last_order_date: string | null
          status: string | null
          tenant_id: string
          tokens_used: number | null
        }
        Insert: {
          config_id?: string | null
          coupon_code?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          cycle_step?: number | null
          days_inactive?: number | null
          error_message?: string | null
          id?: string
          last_order_date?: string | null
          status?: string | null
          tenant_id: string
          tokens_used?: number | null
        }
        Update: {
          config_id?: string | null
          coupon_code?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          cycle_step?: number | null
          days_inactive?: number | null
          error_message?: string | null
          id?: string
          last_order_date?: string | null
          status?: string | null
          tenant_id?: string
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reactivation_executions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "reactivation_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactivation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      receptionist_configs: {
        Row: {
          created_at: string
          human_handoff_message: string
          id: string
          is_active: boolean
          lead_capture_enabled: boolean | null
          lead_capture_name_message: string | null
          lead_capture_phone_message: string | null
          lead_capture_success_message: string | null
          list_button_text: string | null
          list_title: string | null
          menu_format: string
          menu_options: Json
          menu_trigger_keywords: Json
          name: string
          target_column_id: string | null
          tenant_id: string
          updated_at: string
          welcome_message: string
        }
        Insert: {
          created_at?: string
          human_handoff_message?: string
          id?: string
          is_active?: boolean
          lead_capture_enabled?: boolean | null
          lead_capture_name_message?: string | null
          lead_capture_phone_message?: string | null
          lead_capture_success_message?: string | null
          list_button_text?: string | null
          list_title?: string | null
          menu_format?: string
          menu_options?: Json
          menu_trigger_keywords?: Json
          name?: string
          target_column_id?: string | null
          tenant_id: string
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          created_at?: string
          human_handoff_message?: string
          id?: string
          is_active?: boolean
          lead_capture_enabled?: boolean | null
          lead_capture_name_message?: string | null
          lead_capture_phone_message?: string | null
          lead_capture_success_message?: string | null
          list_button_text?: string | null
          list_title?: string | null
          menu_format?: string
          menu_options?: Json
          menu_trigger_keywords?: Json
          name?: string
          target_column_id?: string | null
          tenant_id?: string
          updated_at?: string
          welcome_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "receptionist_configs_target_column_id_fkey"
            columns: ["target_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receptionist_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfm_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string
          id: string
          integration_id: string
          is_read: boolean
          metadata: Json | null
          reference_date: string
          severity: string
          tenant_id: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          description: string
          id?: string
          integration_id: string
          is_read?: boolean
          metadata?: Json | null
          reference_date: string
          severity?: string
          tenant_id: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          integration_id?: string
          is_read?: boolean
          metadata?: Json | null
          reference_date?: string
          severity?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfm_alerts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfm_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfm_audience_members: {
        Row: {
          audience_id: string
          created_at: string
          id: string
          snapshot_id: string
          tenant_id: string
        }
        Insert: {
          audience_id: string
          created_at?: string
          id?: string
          snapshot_id: string
          tenant_id: string
        }
        Update: {
          audience_id?: string
          created_at?: string
          id?: string
          snapshot_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfm_audience_members_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "rfm_audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfm_audience_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rfm_audiences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          integration_id: string
          is_active: boolean
          last_calculated_at: string | null
          member_count: number
          name: string
          rules: Json
          tenant_id: string
          total_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          integration_id: string
          is_active?: boolean
          last_calculated_at?: string | null
          member_count?: number
          name: string
          rules?: Json
          tenant_id: string
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          integration_id?: string
          is_active?: boolean
          last_calculated_at?: string | null
          member_count?: number
          name?: string
          rules?: Json
          tenant_id?: string
          total_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfm_audiences_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfm_audiences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_token: string
          invite_token_hash: string | null
          invited_by: string
          permissions: Json | null
          role: string
          status: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_token?: string
          invite_token_hash?: string | null
          invited_by: string
          permissions?: Json | null
          role?: string
          status?: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invite_token_hash?: string | null
          invited_by?: string
          permissions?: Json | null
          role?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_ai_credentials: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          provider: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          provider?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          provider?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_api_keys: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_tokens: {
        Row: {
          balance: number
          created_at: string
          id: string
          plan_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          plan_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          plan_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_tokens_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "token_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_webhooks: {
        Row: {
          created_at: string
          events: string[]
          failure_count: number
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          secret: string | null
          success_count: number
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          secret?: string | null
          success_count?: number
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          secret?: string | null
          success_count?: number
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_whitelabel: {
        Row: {
          colors: Json
          company_name: string | null
          created_at: string
          custom_domain: string | null
          domain_verified: boolean
          favicon_url: string | null
          hide_branding: boolean
          id: string
          logo_url: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          colors?: Json
          company_name?: string | null
          created_at?: string
          custom_domain?: string | null
          domain_verified?: boolean
          favicon_url?: string | null
          hide_branding?: boolean
          id?: string
          logo_url?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          colors?: Json
          company_name?: string | null
          created_at?: string
          custom_domain?: string | null
          domain_verified?: boolean
          favicon_url?: string | null
          hide_branding?: boolean
          id?: string
          logo_url?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_whitelabel_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      token_plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          tokens: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          tokens: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          tokens?: number
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          channel_id: string | null
          created_at: string
          error_json: Json | null
          event_type: string
          id: string
          payload_json: Json
          processed_at: string | null
          processing_status: string
          provider: string
          provider_message_id: string | null
          received_at: string
          tenant_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error_json?: Json | null
          event_type: string
          id?: string
          payload_json: Json
          processed_at?: string | null
          processing_status?: string
          provider: string
          provider_message_id?: string | null
          received_at?: string
          tenant_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error_json?: Json | null
          event_type?: string
          id?: string
          payload_json?: Json
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_message_id?: string | null
          received_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          access_token: string | null
          created_at: string
          display_name: string
          id: string
          integration_id: string | null
          metadata_json: Json | null
          phone_e164: string | null
          provider: string
          provider_account_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          waba_id: string | null
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          display_name: string
          id?: string
          integration_id?: string | null
          metadata_json?: Json | null
          phone_e164?: string | null
          provider: string
          provider_account_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          waba_id?: string | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          display_name?: string
          id?: string
          integration_id?: string | null
          metadata_json?: Json | null
          phone_e164?: string | null
          provider?: string
          provider_account_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          waba_id?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_channels_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_message_to_buffer: {
        Args: {
          _conversation_id: string
          _delay_seconds?: number
          _message_id: string
        }
        Returns: undefined
      }
      add_tokens: {
        Args: {
          _amount: number
          _description?: string
          _reference_id?: string
          _tenant_id: string
          _type: string
        }
        Returns: boolean
      }
      clear_message_buffer: {
        Args: { _conversation_id: string }
        Returns: string[]
      }
      decrypt_secret: { Args: { _ciphertext: string }; Returns: string }
      deduct_tokens: {
        Args: {
          _amount: number
          _description?: string
          _reference_id?: string
          _tenant_id: string
          _type: string
        }
        Returns: boolean
      }
      delete_account_data: { Args: { _user_id: string }; Returns: Json }
      encrypt_secret: { Args: { _plaintext: string }; Returns: string }
      estimate_email_audience: {
        Args: { _audience_reference?: Json; _audience_type: string }
        Returns: Json
      }
      get_cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      get_cron_last_run: {
        Args: never
        Returns: {
          end_time: string
          job_pid: number
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      get_dashboard_stats: { Args: { _tenant_id: string }; Returns: Json }
      get_internal_headers: { Args: never; Returns: Json }
      get_me_cron_job_status: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      get_me_cron_last_run: {
        Args: never
        Returns: {
          end_time: string
          job_pid: number
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      get_tenant_token_balance: {
        Args: { _tenant_id: string }
        Returns: number
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      get_user_tenants: {
        Args: { _user_id: string }
        Returns: {
          role: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      has_enough_tokens: {
        Args: { _amount: number; _tenant_id: string }
        Returns: boolean
      }
      has_module_permission: {
        Args: {
          _module: Database["public"]["Enums"]["module_permission"]
          _require_edit?: boolean
          _user_id: string
        }
        Returns: boolean
      }
      increment_campaign_unsubscribed: {
        Args: { _campaign_id: string; _tenant_id: string }
        Returns: undefined
      }
      increment_cta_click_count: {
        Args: { p_cta_link_id: string }
        Returns: undefined
      }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      leave_team_memberships: { Args: { _user_id: string }; Returns: Json }
      link_me_shipments_to_orders: {
        Args: {
          p_me_integration_id: string
          p_store_integration_id: string
          p_store_type: string
        }
        Returns: Json
      }
      map_evolution_status: { Args: { status: string }; Returns: string }
      mask_secret: { Args: { _plaintext: string }; Returns: string }
      release_bot_lock: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      release_bulk_campaign_lock: {
        Args: { _campaign_id: string; _next_send_seconds: number }
        Returns: undefined
      }
      set_active_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      store_cron_secret: { Args: { _secret: string }; Returns: undefined }
      try_acquire_bot_lock: {
        Args: { _conversation_id: string; _lock_seconds?: number }
        Returns: boolean
      }
      try_acquire_bulk_campaign_lock: {
        Args: { _campaign_id: string; _lock_seconds?: number }
        Returns: boolean
      }
    }
    Enums: {
      email_campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "sent"
        | "paused"
        | "canceled"
        | "error"
      email_campaign_type:
        | "newsletter"
        | "promotion"
        | "relationship"
        | "automation"
        | "update"
      email_template_type:
        | "newsletter"
        | "promotional"
        | "reactivation"
        | "launch"
        | "relationship"
      instagram_channel_status:
        | "connected"
        | "expiring"
        | "expired"
        | "error"
        | "disconnected"
      instagram_delivery_status:
        | "pending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
      instagram_message_direction:
        | "incoming"
        | "outgoing"
        | "inbound"
        | "outbound"
      instagram_outbox_status:
        | "queued"
        | "processing"
        | "sent"
        | "failed"
        | "dead_letter"
        | "pending"
        | "retry"
        | "sending"
        | "dead"
      instagram_thread_status:
        | "open"
        | "pending"
        | "bot_active"
        | "human_active"
        | "paused"
        | "closed"
        | "spam"
        | "blocked"
      module_permission:
        | "dashboard"
        | "sales"
        | "clients"
        | "conversations"
        | "automations"
        | "integrations"
        | "settings"
        | "coupons"
        | "products"
        | "contacts"
        | "tenants"
      team_role: "owner" | "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      email_campaign_status: [
        "draft",
        "scheduled",
        "sending",
        "sent",
        "paused",
        "canceled",
        "error",
      ],
      email_campaign_type: [
        "newsletter",
        "promotion",
        "relationship",
        "automation",
        "update",
      ],
      email_template_type: [
        "newsletter",
        "promotional",
        "reactivation",
        "launch",
        "relationship",
      ],
      instagram_channel_status: [
        "connected",
        "expiring",
        "expired",
        "error",
        "disconnected",
      ],
      instagram_delivery_status: [
        "pending",
        "sent",
        "delivered",
        "read",
        "failed",
      ],
      instagram_message_direction: [
        "incoming",
        "outgoing",
        "inbound",
        "outbound",
      ],
      instagram_outbox_status: [
        "queued",
        "processing",
        "sent",
        "failed",
        "dead_letter",
        "pending",
        "retry",
        "sending",
        "dead",
      ],
      instagram_thread_status: [
        "open",
        "pending",
        "bot_active",
        "human_active",
        "paused",
        "closed",
        "spam",
        "blocked",
      ],
      module_permission: [
        "dashboard",
        "sales",
        "clients",
        "conversations",
        "automations",
        "integrations",
        "settings",
        "coupons",
        "products",
        "contacts",
        "tenants",
      ],
      team_role: ["owner", "admin", "member"],
    },
  },
} as const
