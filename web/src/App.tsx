import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MailboxPage from './pages/MailboxPage';
import EmailDetailPage from './pages/EmailDetailPage';
import SettingsPage from './pages/SettingsPage';
import GuestDashboardPage from './pages/GuestDashboardPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminTiers from './pages/admin/AdminTiers';
import AdminRedemption from './pages/admin/AdminRedemption';
import AdminSettings from './pages/admin/AdminSettings';
import AdminBackup from './pages/admin/AdminBackup';
import AdminDomains from './pages/admin/AdminDomains';
import AdminAnnouncements from './pages/admin/AdminAnnouncements';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AnnouncementDialog from './components/AnnouncementDialog';
import NotFoundPage from './pages/NotFoundPage';

// Store
import { useAuthStore } from './stores/authStore';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  const { checkAuth } = useAuthStore();

  // Check authentication on app load
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="App">
          {/* Skip to content accessibility link */}
          <a href="#main-content" className="skip-to-content">Skip to content</a>

          {/* Toast notifications */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className: '',
              style: {
                background: '#FFFFFF',
                color: '#1a1a2e',
                border: '3px solid #1a1a2e',
                borderRadius: '16px',
                padding: '16px',
                minWidth: '320px',
                fontWeight: '500',
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              },
              success: {
                style: {
                  borderLeft: '6px solid #5FD068',
                },
                iconTheme: {
                  primary: '#5FD068',
                  secondary: '#FFFFFF',
                },
              },
              error: {
                style: {
                  borderLeft: '6px solid #FF5252',
                },
                iconTheme: {
                  primary: '#FF5252',
                  secondary: '#FFFFFF',
                },
              },
            }}
          />

          {/* Routes */}
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/guest" element={<GuestDashboardPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Navigate to="/dashboard" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mailbox/:address"
              element={
                <ProtectedRoute>
                  <MailboxPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email/:id"
              element={
                <ProtectedRoute>
                  <EmailDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/tiers"
              element={
                <AdminRoute>
                  <AdminTiers />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/redemption"
              element={
                <AdminRoute>
                  <AdminRedemption />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <AdminRoute>
                  <AdminSettings />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/backup"
              element={
                <AdminRoute>
                  <AdminBackup />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/domains"
              element={
                <AdminRoute>
                  <AdminDomains />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/announcements"
              element={
                <AdminRoute>
                  <AdminAnnouncements />
                </AdminRoute>
              }
            />

            {/* 404 route */}
            <Route
              path="*"
              element={<NotFoundPage />}
            />
          </Routes>

          {/* Announcement Dialog - 全局公告弹窗 */}
          <AnnouncementDialog />
        </div>
      </Router>

      {/* React Query Devtools */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export default App;