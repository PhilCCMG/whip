import { useParams } from 'react-router';

export function useCampaignId(): string {
  const { campaignId } = useParams();
  if (!campaignId) throw new Error('Route is missing :campaignId');
  return campaignId;
}

export const campaignPath = (id: string, sub = '') =>
  `/c/${encodeURIComponent(id)}${sub ? `/${sub}` : ''}`;
