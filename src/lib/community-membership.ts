import { addMonths } from "date-fns";
export function communitySwitchDate(joinedAt: string): Date {
  return addMonths(new Date(joinedAt), 6);
}
export function canJoinCommunity(membership: { community_id: string; switch_allowed_at: string } | null, communityId: string, now = new Date()): boolean {
  return !membership || membership.community_id === communityId || now >= new Date(membership.switch_allowed_at);
}