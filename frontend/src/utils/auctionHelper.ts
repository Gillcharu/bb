export const getAuctionDisplayId = (id: string | undefined, title: string | undefined) => {
  const cleanTitle = title?.toLowerCase() || '';
  if (cleanTitle.includes('catalyst') || cleanTitle.includes('cisco')) {
    return { 
      id: 'AUC-BB-2026-0042', 
      ref: 'BB-RFQ-2026-104',
      basePrice: 1850000,
      decrement: 25000
    };
  }
  if (cleanTitle.includes('poweredge') || cleanTitle.includes('dell')) {
    return { 
      id: 'AUC-BB-2026-0041', 
      ref: 'BB-RFQ-2026-103',
      basePrice: 4200000,
      decrement: 50000
    };
  }
  if (cleanTitle.includes('laptop') || cleanTitle.includes('employee refresh')) {
    return { 
      id: 'AUC-BB-2026-0043', 
      ref: 'BB-RFQ-2026-105',
      basePrice: 1275000,
      decrement: 10000
    };
  }
  if (cleanTitle.includes('annual maintenance') || cleanTitle.includes('devices')) {
    return { 
      id: 'AUC-BB-2026-0039', 
      ref: 'BB-AMC-2026-018',
      basePrice: 850000,
      decrement: 0
    };
  }
  if (cleanTitle.includes('ups') || cleanTitle.includes('power distribution')) {
    return { 
      id: 'AUC-BB-2026-0044', 
      ref: 'BB-RFQ-2026-106',
      basePrice: 900000,
      decrement: 15000
    };
  }
  // Fallback
  const shortId = id ? id.split('-')[0].toUpperCase() : 'RFQ-2026-104';
  return { 
    id: `AUC-${shortId}`, 
    ref: `BB-RFQ-2026-${shortId.slice(0, 3)}`,
    basePrice: 10000,
    decrement: 100
  };
};
