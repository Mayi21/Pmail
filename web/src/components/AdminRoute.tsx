/**
 * Admin Route Protection Component
 * Ensures only admin users can access admin routes
 */

import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserInfo } from '../hooks/useUserInfo';

interface AdminRouteProps {
  children: ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { data: userInfo, isLoading } = useUserInfo();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-4 border-black"></div>
          <p className="mt-4 text-lg font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!userInfo?.data?.user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to dashboard if not admin
  if (userInfo?.data?.user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  // Render children if user is admin
  return <>{children}</>;
}
