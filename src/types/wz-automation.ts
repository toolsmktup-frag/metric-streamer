// Types for WhatsApp Automation module (wz_* tables)

export interface WzInstance {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface WzFlow {
  id: string;
  name: string;
  description: string | null;
  platform: string;
  product_filter: string | null;
  is_active: boolean;
  nodes: any[];
  edges: any[];
  created_at: string;
  updated_at: string;
}

export interface WzExecution {
  id: string;
  flow_id: string;
  contact_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  trigger_event: string | null;
  trigger_payload: any;
  variables: Record<string, any>;
  status: string;
  current_node_id: string | null;
  started_at: string;
  finished_at: string | null;
  // joined
  flow_name?: string;
}

export interface WzScheduledStep {
  id: string;
  execution_id: string;
  node_id: string;
  run_at: string;
  status: string;
  retry_count: number;
  created_at: string;
}

export interface LeadFunnelAutomation {
  id: string;
  funnel_id: string;
  wz_flow_id: string;
  trigger_events: string[];
  is_active: boolean;
  show_in_automations: boolean;
  created_at: string;
  // joined
  wz_flow?: WzFlow;
}

export interface WzExecutionLog {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: string;
  status: string;
  input_data: any;
  output_data: any;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}
