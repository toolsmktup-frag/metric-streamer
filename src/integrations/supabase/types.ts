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
      ad_creatives: {
        Row: {
          ad_id: string
          angle: string | null
          created_at: string
          description: string | null
          format: string | null
          hook: string | null
          id: string
          updated_at: string
        }
        Insert: {
          ad_id: string
          angle?: string | null
          created_at?: string
          description?: string | null
          format?: string | null
          hook?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          ad_id?: string
          angle?: string | null
          created_at?: string
          description?: string | null
          format?: string | null
          hook?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_change_log: {
        Row: {
          created_at: string
          detected_at: string
          entity_id: string
          entity_name: string | null
          entity_type: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          created_at?: string
          detected_at?: string
          entity_id: string
          entity_name?: string | null
          entity_type: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          created_at?: string
          detected_at?: string
          entity_id?: string
          entity_name?: string | null
          entity_type?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      customer_identity_links: {
        Row: {
          confidence: string
          created_at: string
          id: string
          identifier_type: string
          identifier_value: string
          organization_id: string
          unified_customer_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          id?: string
          identifier_type: string
          identifier_value: string
          organization_id: string
          unified_customer_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          id?: string
          identifier_type?: string
          identifier_value?: string
          organization_id?: string
          unified_customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_identity_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_identity_links_unified_customer_id_fkey"
            columns: ["unified_customer_id"]
            isOneToOne: false
            referencedRelation: "unified_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_purchases: {
        Row: {
          created_at: string
          gross_amount: number
          id: string
          imported_from: string | null
          installments: number | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          net_amount: number | null
          offer_id: string | null
          offer_name: string | null
          organization_id: string
          payment_method: string | null
          platform: string
          platform_order_id: string | null
          platform_transaction_id: string | null
          product_id: string | null
          product_name: string
          product_type: string | null
          purchased_at: string
          raw_data: Json | null
          status: string
          unified_customer_id: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          gross_amount?: number
          id?: string
          imported_from?: string | null
          installments?: number | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          net_amount?: number | null
          offer_id?: string | null
          offer_name?: string | null
          organization_id: string
          payment_method?: string | null
          platform: string
          platform_order_id?: string | null
          platform_transaction_id?: string | null
          product_id?: string | null
          product_name: string
          product_type?: string | null
          purchased_at: string
          raw_data?: Json | null
          status?: string
          unified_customer_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          gross_amount?: number
          id?: string
          imported_from?: string | null
          installments?: number | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          net_amount?: number | null
          offer_id?: string | null
          offer_name?: string | null
          organization_id?: string
          payment_method?: string | null
          platform?: string
          platform_order_id?: string | null
          platform_transaction_id?: string | null
          product_id?: string | null
          product_name?: string
          product_type?: string | null
          purchased_at?: string
          raw_data?: Json | null
          status?: string
          unified_customer_id?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_purchases_unified_customer_id_fkey"
            columns: ["unified_customer_id"]
            isOneToOne: false
            referencedRelation: "unified_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_analyses: {
        Row: {
          alerts: string | null
          analysis_date: string
          bottlenecks: string | null
          created_at: string
          id: string
          raw_response: string | null
          successes: string | null
          suggestions: string | null
        }
        Insert: {
          alerts?: string | null
          analysis_date?: string
          bottlenecks?: string | null
          created_at?: string
          id?: string
          raw_response?: string | null
          successes?: string | null
          suggestions?: string | null
        }
        Update: {
          alerts?: string | null
          analysis_date?: string
          bottlenecks?: string | null
          created_at?: string
          id?: string
          raw_response?: string | null
          successes?: string | null
          suggestions?: string | null
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          created_by: string | null
          error_detail: string | null
          error_rows: number | null
          file_name: string | null
          finished_at: string | null
          id: string
          imported_rows: number | null
          organization_id: string
          platform: string
          skipped_rows: number | null
          started_at: string | null
          status: string
          total_rows: number | null
        }
        Insert: {
          created_by?: string | null
          error_detail?: string | null
          error_rows?: number | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          imported_rows?: number | null
          organization_id: string
          platform: string
          skipped_rows?: number | null
          started_at?: string | null
          status?: string
          total_rows?: number | null
        }
        Update: {
          created_by?: string | null
          error_detail?: string | null
          error_rows?: number | null
          file_name?: string | null
          finished_at?: string | null
          id?: string
          imported_rows?: number | null
          organization_id?: string
          platform?: string
          skipped_rows?: number | null
          started_at?: string | null
          status?: string
          total_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          account_id: string
          created_at: string | null
          currency: string | null
          id: string
          name: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      meta_ads: {
        Row: {
          adset_id: string
          campaign_id: string
          created_at: string | null
          creative: Json | null
          id: string
          name: string
          organization_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          adset_id: string
          campaign_id: string
          created_at?: string | null
          creative?: Json | null
          id: string
          name: string
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          adset_id?: string
          campaign_id?: string
          created_at?: string | null
          creative?: Json | null
          id?: string
          name?: string
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          campaign_id: string
          created_at: string | null
          id: string
          name: string
          organization_id: string | null
          status: string
          targeting: Json | null
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          id: string
          name: string
          organization_id?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          status?: string
          targeting?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_adsets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          account_id: string
          created_at: string | null
          daily_budget: number | null
          id: string
          lifetime_budget: number | null
          name: string
          objective: string | null
          organization_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          daily_budget?: number | null
          id: string
          lifetime_budget?: number | null
          name: string
          objective?: string | null
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          daily_budget?: number | null
          id?: string
          lifetime_budget?: number | null
          name?: string
          objective?: string | null
          organization_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_demographic_insights: {
        Row: {
          actions: Json | null
          age: string | null
          clicks: number | null
          date_start: string
          gender: string | null
          id: string
          impressions: number | null
          reach: number | null
          spend: number | null
        }
        Insert: {
          actions?: Json | null
          age?: string | null
          clicks?: number | null
          date_start: string
          gender?: string | null
          id?: string
          impressions?: number | null
          reach?: number | null
          spend?: number | null
        }
        Update: {
          actions?: Json | null
          age?: string | null
          clicks?: number | null
          date_start?: string
          gender?: string | null
          id?: string
          impressions?: number | null
          reach?: number | null
          spend?: number | null
        }
        Relationships: []
      }
      meta_device_insights: {
        Row: {
          actions: Json | null
          clicks: number | null
          date_start: string
          id: string
          impression_device: string | null
          impressions: number | null
          platform_position: string | null
          publisher_platform: string | null
          reach: number | null
          spend: number | null
        }
        Insert: {
          actions?: Json | null
          clicks?: number | null
          date_start: string
          id?: string
          impression_device?: string | null
          impressions?: number | null
          platform_position?: string | null
          publisher_platform?: string | null
          reach?: number | null
          spend?: number | null
        }
        Update: {
          actions?: Json | null
          clicks?: number | null
          date_start?: string
          id?: string
          impression_device?: string | null
          impressions?: number | null
          platform_position?: string | null
          publisher_platform?: string | null
          reach?: number | null
          spend?: number | null
        }
        Relationships: []
      }
      meta_geo_insights: {
        Row: {
          actions: Json | null
          clicks: number | null
          country: string | null
          date_start: string
          id: string
          impressions: number | null
          reach: number | null
          spend: number | null
        }
        Insert: {
          actions?: Json | null
          clicks?: number | null
          country?: string | null
          date_start: string
          id?: string
          impressions?: number | null
          reach?: number | null
          spend?: number | null
        }
        Update: {
          actions?: Json | null
          clicks?: number | null
          country?: string | null
          date_start?: string
          id?: string
          impressions?: number | null
          reach?: number | null
          spend?: number | null
        }
        Relationships: []
      }
      meta_insights: {
        Row: {
          actions: Json | null
          clicks: number | null
          cost_per_action_type: Json | null
          cpc: number | null
          cpm: number | null
          created_at: string | null
          ctr: number | null
          date_start: string
          date_stop: string
          id: string
          impressions: number | null
          link_clicks: number | null
          object_id: string
          object_type: string
          organization_id: string | null
          reach: number | null
          spend: number | null
        }
        Insert: {
          actions?: Json | null
          clicks?: number | null
          cost_per_action_type?: Json | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date_start: string
          date_stop: string
          id?: string
          impressions?: number | null
          link_clicks?: number | null
          object_id: string
          object_type: string
          organization_id?: string | null
          reach?: number | null
          spend?: number | null
        }
        Update: {
          actions?: Json | null
          clicks?: number | null
          cost_per_action_type?: Json | null
          cpc?: number | null
          cpm?: number | null
          created_at?: string | null
          ctr?: number | null
          date_start?: string
          date_stop?: string
          id?: string
          impressions?: number | null
          link_clicks?: number | null
          object_id?: string
          object_type?: string
          organization_id?: string | null
          reach?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_sync_log: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          records_synced: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          records_synced?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticto_transactions: {
        Row: {
          created_at: string
          customer_code: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          installments: number | null
          is_paid_traffic: boolean
          meta_ad_id: string | null
          meta_ad_name: string | null
          meta_adset_id: string | null
          meta_adset_name: string | null
          meta_campaign_id: string | null
          meta_campaign_name: string | null
          offer_code: string | null
          offer_id: string | null
          offer_name: string | null
          order_date: string | null
          order_hash: string | null
          order_id: number | null
          organization_id: string | null
          paid_amount: number
          payment_method: string | null
          product_id: number | null
          product_name: string | null
          raw_payload: Json | null
          sck: string | null
          src: string | null
          status: string
          status_date: string | null
          transaction_hash: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          customer_code?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          installments?: number | null
          is_paid_traffic?: boolean
          meta_ad_id?: string | null
          meta_ad_name?: string | null
          meta_adset_id?: string | null
          meta_adset_name?: string | null
          meta_campaign_id?: string | null
          meta_campaign_name?: string | null
          offer_code?: string | null
          offer_id?: string | null
          offer_name?: string | null
          order_date?: string | null
          order_hash?: string | null
          order_id?: number | null
          organization_id?: string | null
          paid_amount?: number
          payment_method?: string | null
          product_id?: number | null
          product_name?: string | null
          raw_payload?: Json | null
          sck?: string | null
          src?: string | null
          status: string
          status_date?: string | null
          transaction_hash?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          customer_code?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          installments?: number | null
          is_paid_traffic?: boolean
          meta_ad_id?: string | null
          meta_ad_name?: string | null
          meta_adset_id?: string | null
          meta_adset_name?: string | null
          meta_campaign_id?: string | null
          meta_campaign_name?: string | null
          offer_code?: string | null
          offer_id?: string | null
          offer_name?: string | null
          order_date?: string | null
          order_hash?: string | null
          order_id?: number | null
          organization_id?: string | null
          paid_amount?: number
          payment_method?: string | null
          product_id?: number | null
          product_name?: string | null
          raw_payload?: Json | null
          sck?: string | null
          src?: string | null
          status?: string
          status_date?: string | null
          transaction_hash?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticto_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_customers: {
        Row: {
          created_at: string
          first_purchase_at: string | null
          full_name: string | null
          id: string
          identity_confidence: string
          last_purchase_at: string | null
          needs_review: boolean
          organization_id: string
          primary_cpf: string | null
          primary_email: string | null
          primary_phone: string | null
          review_reason: string | null
          total_orders: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_purchase_at?: string | null
          full_name?: string | null
          id?: string
          identity_confidence?: string
          last_purchase_at?: string | null
          needs_review?: boolean
          organization_id: string
          primary_cpf?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          review_reason?: string | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_purchase_at?: string | null
          full_name?: string | null
          id?: string
          identity_confidence?: string
          last_purchase_at?: string | null
          needs_review?: boolean
          organization_id?: string
          primary_cpf?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          review_reason?: string | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unified_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          organization_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          organization_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          organization_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolve_or_create_customer: {
        Args: {
          p_cpf?: string
          p_email?: string
          p_name?: string
          p_org_id: string
          p_phone?: string
        }
        Returns: string
      }
      trigger_meta_sync_auto: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
