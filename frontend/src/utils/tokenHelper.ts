export const getActiveToken = (auctionId?: string) => {
  if (auctionId) {
    const vToken = localStorage.getItem(`token_${auctionId}`);
    if (vToken) return vToken;
  }
  
  const path = window.location.pathname;
  if (path.includes('/vendor/auctions/')) {
    const parts = path.split('/');
    const pathAuctionId = parts[3];
    if (pathAuctionId) {
      const vToken = localStorage.getItem(`token_${pathAuctionId}`);
      if (vToken) return vToken;
    }
  }

  const params = new URLSearchParams(window.location.search);
  const paramId = params.get('id') || params.get('auctionId');
  if (paramId) {
    const vToken = localStorage.getItem(`token_${paramId}`);
    if (vToken) return vToken;
  }

  return localStorage.getItem('token');
};

export const setActiveToken = (token: string, auctionId?: string) => {
  if (auctionId) {
    localStorage.setItem(`token_${auctionId}`, token);
  } else {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'VENDOR' && payload.auctionId) {
        localStorage.setItem(`token_${payload.auctionId}`, token);
        return;
      }
    } catch (e) {
      // Ignore
    }
    localStorage.setItem('token', token);
  }
};

export const removeActiveToken = (auctionId?: string) => {
  if (auctionId) {
    localStorage.removeItem(`token_${auctionId}`);
  } else {
    const path = window.location.pathname;
    if (path.includes('/vendor/auctions/')) {
      const parts = path.split('/');
      const pathAuctionId = parts[3];
      if (pathAuctionId) {
        localStorage.removeItem(`token_${pathAuctionId}`);
      }
    }
    const params = new URLSearchParams(window.location.search);
    const paramId = params.get('id') || params.get('auctionId');
    if (paramId) {
      localStorage.removeItem(`token_${paramId}`);
    }
    localStorage.removeItem('token');
  }
};
