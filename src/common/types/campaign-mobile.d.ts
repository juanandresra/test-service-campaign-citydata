export interface CampaignMobileResponse {
  id: string;
  organizationId: string;
  organizationName: string | null;
  name: string;
  details?: string;
  campaigns: {
    id: string;
    name: string;
    type: string;
    startsAt: Date | null;
    endsAt: Date | null;
    currentFormVersion: string | null;
    form: unknown;
  }[];
}

export interface ResearchResponse {
  id: string;
  organizationId: string;
  name: string;
  details?: string;
}

export interface OrganizationResponse {
  id: string;
  name: string;
}
