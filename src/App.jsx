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
import AuditDetailPage from './pages/AuditDetailPage';
import PPERequestTrackerPage from './pages/PPERequestTrackerPage';
import SafetyCommitmentPage from './pages/SafetyCommitmentPage';
import GraphsPage from './pages/GraphsPage';
import AuditCoveragePage from './pages/AuditCoveragePage';
import CasualsPage from './pages/CasualsPage';
import RequestPPEPage from './pages/RequestPPEPage';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading ESAT...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function PageGuard({ children, pageKey }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const pa = Array.isArray(user.page_access) ? user.page_access : [];
  // admin = full access
  if (user.role === 'admin') return children;
  if (pa.includes(pageKey)) return children;
  // blocked: go to Dashboard if allowed, else first allowed page, else profile
  if (pa.includes('/')) return <Navigate to="/" replace />;
  return <Navigate to={pa[0] || '/profile'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/safety-commitment" element={<ProtectedRoute><SafetyCommitmentPage /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<PageGuard pageKey="/"><DashboardPage /></PageGuard>} />
            <Route path="employees" element={<PageGuard pageKey="/employees"><EmployeesPage /></PageGuard>} />
            <Route path="casuals" element={<PageGuard pageKey="/casuals"><CasualsPage /></PageGuard>} />
            <Route path="audit/new" element={<PageGuard pageKey="/audit/new"><NewAuditPage /></PageGuard>} />
            <Route path="request-ppe" element={<PageGuard pageKey="/request-ppe"><RequestPPEPage /></PageGuard>} />
            <Route path="audit/new/:employeeId" element={<PageGuard pageKey="/audit/new"><NewAuditPage /></PageGuard>} />
            <Route path="history" element={<PageGuard pageKey="/history"><AuditHistoryPage /></PageGuard>} />
            <Route path="audit-coverage" element={<PageGuard pageKey="/audit-coverage"><AuditCoveragePage /></PageGuard>} />
            <Route path="audits/:auditId" element={<AuditDetailPage />} />
            <Route path="ncr" element={<PageGuard pageKey="/ncr"><NCRPage /></PageGuard>} />
            <Route path="purchase-requests" element={<PurchaseRequestsPage />} />
            <Route path="ppe-tracker" element={<PageGuard pageKey="/ppe-tracker"><PPERequestTrackerPage /></PageGuard>} />
            <Route path="graphs" element={<PageGuard pageKey="/graphs"><GraphsPage /></PageGuard>} />
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
