import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './providers/AuthProvider';
import { getActiveToken } from './utils/tokenHelper';

import Layout from './pages/Layout';
import Dashboard from './pages/Dashboard';
import AuctionList from './pages/AuctionList';
import AuctionWizard from './pages/AuctionWizard';
import AuctionDetail from './pages/AuctionDetail';
import AdminLiveConsole from './pages/AdminLiveConsole';
import Reports from './pages/Reports';
import ReportsDetail from './pages/ReportsDetail';
import AuditTrail from './pages/AuditTrail';
import SettingsPage from './pages/SettingsPage';

import AdminLogin from './pages/AdminLogin';
import VendorLogin from './pages/VendorLogin';
import VendorTermsGateway from './pages/VendorTermsGateway';
import VendorLiveConsole from './pages/VendorLiveConsole';
import VendorLobby from './pages/VendorLobby';

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{ children: React.ReactElement; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const isVendorRoute = location.pathname.startsWith('/vendor/');

  useEffect(() => {
    if (user) {
      if (isVendorRoute && user.role !== 'VENDOR') {
        logout();
      } else if (!isVendorRoute && user.role === 'VENDOR') {
        logout();
      }
    }
  }, [user, isVendorRoute, logout]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-neutral-100 dark:bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  // Show transition loader while useEffect handles the logout
  if (user) {
    if (isVendorRoute && user.role !== 'VENDOR') {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#070708]">
          <div className="text-xs text-zinc-400">Switching to Vendor Portal...</div>
        </div>
      );
    }
    if (!isVendorRoute && user.role === 'VENDOR') {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#070708]">
          <div className="text-xs text-zinc-400">Switching to Admin Portal...</div>
        </div>
      );
    }
  }

  if (!user) {
    if (isVendorRoute) {
      const parts = location.pathname.split('/');
      const auctionId = parts[3];
      const search = location.search;
      if (auctionId) {
        return <Navigate to={`/vendor/login?id=${auctionId}`} replace />;
      }
      return <Navigate to={`/vendor/login${search}`} replace />;
    }
    return <Navigate to="/admin/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'VENDOR') {
      const token = getActiveToken();
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.auctionId) {
            return <Navigate to={`/vendor/auctions/${payload.auctionId}/terms`} replace />;
          }
        } catch {
          // Malformed token: fall through to the vendor login redirect.
        }
      }
      return <Navigate to="/vendor/login" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const AppContent: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Authentication */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/vendor/login" element={<VendorLogin />} />
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />

      {/* Corporate Admin Layout & Nested Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute allowedRoles={['SYSTEM_ADMIN', 'AUCTION_OWNER', 'APPROVER', 'OBSERVER']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        
        {/* Auctions */}
        <Route path="auctions" element={<AuctionList />} />
        <Route path="auctions/create" element={<AuctionWizard />} />
        <Route path="auctions/:id/edit" element={<AuctionWizard />} />
        <Route path="auctions/:id" element={<AuctionDetail />} />
        <Route path="auctions/:id/live" element={<AdminLiveConsole />} />

        {/* Reports */}
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportsDetail />} />

        {/* Audit Log */}
        <Route path="audit-trail" element={<AuditTrail />} />

        {/* Settings */}
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Vendor Live Scopes Gateway */}
      <Route
        path="/vendor/auctions/:id/terms"
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorTermsGateway />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendor/auctions/:id/lobby"
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorLobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendor/auctions/:id/live"
        element={
          <ProtectedRoute allowedRoles={['VENDOR']}>
            <VendorLiveConsole />
          </ProtectedRoute>
        }
      />

      <Route 
        path="*" 
        element={
          <Navigate 
            to={
              !user 
                ? "/admin/login" 
                : user.role === 'VENDOR'
                ? "/vendor/login"
                : "/dashboard"
            } 
            replace 
          />
        } 
      />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
