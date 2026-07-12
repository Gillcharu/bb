// Derives the short human-readable auction reference from the real record ID.
// All commercial figures (base price, decrement) come from the auction's
// BidRuleSnapshot — never from hardcoded values.
export const getAuctionDisplayId = (id: string | undefined) => {
  if (!id) {
    return { id: '—', ref: '—' };
  }
  const short = id.split('-')[0].toUpperCase();
  return {
    id: `AUC-${short}`,
    ref: `REF-${short}`,
  };
};
