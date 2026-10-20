export type LeaderboardSortKey = 'composite' | 'fillRate' | 'settleP50' | 'slippage';
export type LeaderboardDirection = 'asc' | 'desc';

export interface AnchorLeaderboardEntry {
  anchorId: string;
  anchorName: string;
  corridorId: string | null;
  composite: number;
  fillRate: number;
  settleP10: number;
  slippage: number;
}
