import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { getActiveToken, setActiveToken, removeActiveToken } from '../utils/tokenHelper';

export interface User {
  id: string;
  email: string;
  role: 'SYSTEM_ADMIN' | 'AUCTION_OWNER' | 'APPROVER' | 'OBSERVER' | 'VENDOR';
  company: {
    id: string;
    name: string;
    logoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  vendorLogin: (email: string, password: string, auctionId?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate auth state on load
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = getActiveToken();
      const storedRefreshToken = localStorage.getItem('refreshToken');

      if (storedToken) {
        try {
          setToken(storedToken);
          // Set authorization header globally for axios
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          
          // Verify/Fetch current user details
          const res = await axios.get(`${API_URL}/auth/me`);
          setUser(res.data.data);
        } catch {
          // If expired, try refreshing (only if refreshToken exists, which vendors do not have)
          if (storedRefreshToken) {
            try {
              const refreshRes = await axios.post(`${API_URL}/auth/refresh`, {
                refreshToken: storedRefreshToken,
              });
              const newAccessToken = refreshRes.data.data.accessToken;
              setActiveToken(newAccessToken);
              setToken(newAccessToken);
              axios.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
              
              const meRes = await axios.get(`${API_URL}/auth/me`);
              setUser(meRes.data.data);
            } catch {
              removeActiveToken();
              localStorage.removeItem('refreshToken');
            }
          } else {
            removeActiveToken();
          }
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { accessToken, refreshToken, user: loggedUser } = res.data.data;

      setActiveToken(accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setToken(accessToken);
      setUser(loggedUser);
      axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    } finally {
      setLoading(false);
    }
  };

  const vendorLogin = async (email: string, password: string, auctionId?: string) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/vendor-login`, { email, password, auctionId });
      const { accessToken, user: loggedUser } = res.data.data;

      setActiveToken(accessToken, auctionId);
      // For transient vendor sessions, clear refresh token
      localStorage.removeItem('refreshToken');
      setToken(accessToken);
      setUser(loggedUser);
      axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    removeActiveToken();
    localStorage.removeItem('refreshToken');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, vendorLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
