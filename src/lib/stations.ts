export interface PartnerTv {
  id: string;
  name: string;
  logo_url: string | null;
  category: string;
  region: string | null;
  description: string | null;
  live_stream_url: string;
  is_active: boolean;
  viewer_count: number;
}

