export interface LeadCampaign {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string;
  traffic_funnel_id: string | null;
  ignore_traffic_funnel?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadFunnel {
  id: string;
  organization_id: string;
  campaign_id: string | null;
  name: string;
  description: string | null;
  color: string;
  webhook_token: string;
  is_active: boolean;
  sort_order: number;
  traffic_funnel_id: string | null;
  ignore_traffic_funnel?: boolean;
  meta_pixel_id: string | null;
  meta_access_token: string | null;
  created_at: string;
  updated_at: string;
  lead_funnel_stages?: LeadFunnelStage[];
  stage_transition_rules?: StageTransitionRule[];
  lead_funnel_campaigns?: { lead_campaign_id: string }[];
  lead_funnel_traffic_funnels?: { traffic_funnel_id: string }[];
}

export type PageType = 'capture' | 'sales' | 'checkout' | 'thankyou' | 'upsell' | 'downsell' | 'content';

export interface LeadFunnelStage {
  id: string;
  funnel_id: string;
  name: string;
  color: string;
  sort_order: number;
  page_type: PageType | null;
  page_url: string | null;
  thumbnail_url: string | null;
  position_x: number;
  position_y: number;
  hide_values: boolean;
  conversion_base_stage_id: string | null;
  visual_parent_stage_id: string | null;
  created_at: string;
}

export type ValueClassification = 'positive' | 'pending' | 'negative';

export interface StageTransitionRule {
  id: string;
  funnel_id: string;
  event_name: string;
  from_stage_id: string | null;
  to_stage_id: string;
  value_classification: ValueClassification | null;
  created_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  assigned_to: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  funnel_id: string;
  event_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LeadStagePosition {
  id: string;
  lead_id: string;
  funnel_id: string;
  stage_id: string;
  entered_at: string;
  lead?: Lead;
}

export interface FunnelSourceNode {
  id: string;
  funnel_id: string;
  source_type: string;
  label: string;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface FunnelEdge {
  id: string;
  funnel_id: string;
  source_node_id: string;
  target_node_id: string;
  source_type: string;
  created_at: string;
}

export interface LeadFunnelGroupSyncConfig {
  id: string;
  funnel_id: string;
  instance_id: string;
  group_ids: string[];
  in_group_stage_id: string | null;
  not_in_group_stage_id: string | null;
  invited_stage_id: string | null;
  left_group_stage_id: string | null;
  auto_move_on_join: boolean;
  auto_move_on_leave: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadFunnelGroupSyncRun {
  id: string;
  config_id: string | null;
  funnel_id: string;
  instance_id: string | null;
  mode: string;
  group_ids: string[];
  total_positions: number;
  matched_count: number;
  missing_count: number;
  invalid_phone_count: number;
  moved_in_count: number;
  moved_out_count: number;
  invited_count: number;
  failed_invite_count: number;
  status: string;
  error_message: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}
