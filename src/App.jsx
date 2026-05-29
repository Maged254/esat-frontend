import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import NewAuditPage from './pages/NewAuditPage';
import AuditHistoryPage from './pages/AuditHistoryPage';
import NCRPage from './pages/NCRPage';
import PurchaseRequestsPage from './pages/PurchaseRequestsPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading ESAT...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="audit/new" element={<NewAuditPage />} />
            <Route path="audit/new/:employeeId" element={<NewAuditPage />} />
            <Route path="history" element={<AuditHistoryPage />} />
            <Route path="ncr" element={<NCRPage />} />
            <Route path="purchase-requests" element={<PurchaseRequestsPage />} />
            <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="admin" element={
              <ProtectedRoute roles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
