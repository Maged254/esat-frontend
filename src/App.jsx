import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import OutsourcePage from './pages/OutsourcePage';
import NewAuditPage from './pages/NewAuditPage';
import AuditHistoryPage from './pages/AuditHistoryPage';
import NCRPage from './pages/NCRPage';
import PurchaseRequestsPage from './pages/PurchaseRequestsPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import AuditDetailPage from './pages/AuditDetailPage';
import PPERequestTrackerPage from './pages/PPERequestTrackerPage';
import SafetyCommitmentPage from './pages/SafetyCommitmentPage';
import AuditsPage from './pages/AuditsPage';
import RequestsPage from './pages/RequestsPage';
import RepeatRequestsPage from './pages/RepeatRequestsPage';
import AuditCoveragePage from './pages/AuditCoveragePage';
import CasualsPage from './pages/CasualsPage';
import ChangeHistoryPage from './pages/ChangeHistoryPage';
import RequestPPEPage from './pages/RequestPPEPage';
import RequestTrainingPage from './pages/RequestTrainingPage';
import UpdateTrainingRecordsPage from './pages/UpdateTrainingRecordsPage';
import TrainingTrackerPage from './pages/TrainingTrackerPage';
import MobileLinesPage from './pages/MobileLinesPage';
import MobileCataloguePage from './pages/MobileCataloguePage';
import AvailableLinesPage from './pages/AvailableLinesPage';
import MobileLineRequestsPage from './pages/MobileLineRequestsPage';
import PpeAssignmentHistoryPage from './pages/PpeAssignmentHistoryPage';
import MobileDashboardPage from './pages/MobileDashboardPage';
import TrainingDashboardPage from './pages/TrainingDashboardPage';
import ForcedPasswordResetPage from './pages/ForcedPasswordResetPage';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading OneHub...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_reset_password) return <ForcedPasswordResetPage />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function PageGuard({ children, pageKey, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const pa = Array.isArray(user.page_access) ? user.page_access : [];
  // admin = full access
  if (user.role === 'admin') return children;
  // Role-locked pages (e.g. Update Training Records) are gated by role, not by the
  // per-user page_access grant, so they can't be handed to the wrong role.
  if (roles) return roles.includes(user.role) ? children : <Navigate to={pa.includes('/') ? '/' : (pa[0] || '/profile')} replace />;
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
            <Route path="outsource" element={<PageGuard pageKey="/outsource"><OutsourcePage /></PageGuard>} />
            <Route path="casuals" element={<PageGuard pageKey="/casuals"><CasualsPage /></PageGuard>} />
            <Route path="employees/change-log" element={<PageGuard pageKey="/employees/change-log"><ChangeHistoryPage /></PageGuard>} />
            <Route path="audit/new" element={<PageGuard pageKey="/audit/new" roles={['admin','ehs_officer','ehs_manager','supervisor']}><NewAuditPage /></PageGuard>} />
            <Route path="request-ppe" element={<PageGuard pageKey="/request-ppe"><RequestPPEPage /></PageGuard>} />
            <Route path="training/request" element={<PageGuard pageKey="/training/request" roles={['admin','ehs_manager']}><RequestTrainingPage /></PageGuard>} />
            <Route path="training/update" element={<PageGuard pageKey="/training/update" roles={['admin','hr']}><UpdateTrainingRecordsPage /></PageGuard>} />
            <Route path="training/tracker" element={<PageGuard pageKey="/training/tracker"><TrainingTrackerPage /></PageGuard>} />
            <Route path="ppe-assignment-history" element={<PageGuard pageKey="/ppe-assignment-history" roles={['admin']}><PpeAssignmentHistoryPage /></PageGuard>} />
            <Route path="mobile-lines" element={<PageGuard pageKey="/mobile-lines" roles={['admin','hr','supervisor','project_director']}><MobileLinesPage /></PageGuard>} />
            <Route path="mobile-lines/dashboard" element={<PageGuard pageKey="/mobile-lines/dashboard" roles={['admin','hr','supervisor','project_director']}><MobileDashboardPage /></PageGuard>} />
            <Route path="mobile-lines/available" element={<PageGuard pageKey="/mobile-lines/available" roles={['admin','hr']}><AvailableLinesPage /></PageGuard>} />
            <Route path="mobile-lines/requests" element={<PageGuard pageKey="/mobile-lines/requests" roles={['admin','hr']}><MobileLineRequestsPage /></PageGuard>} />
            <Route path="mobile-lines/catalogue" element={<PageGuard pageKey="/mobile-lines/catalogue" roles={['admin']}><MobileCataloguePage /></PageGuard>} />
            <Route path="training/dashboard" element={<PageGuard pageKey="/training/dashboard"><TrainingDashboardPage /></PageGuard>} />
            <Route path="audit/new/:employeeId" element={<PageGuard pageKey="/audit/new"><NewAuditPage /></PageGuard>} />
            <Route path="history" element={<PageGuard pageKey="/history"><AuditHistoryPage /></PageGuard>} />
            <Route path="audit-coverage" element={<PageGuard pageKey="/audit-coverage"><AuditCoveragePage /></PageGuard>} />
            <Route path="audits/:auditId" element={<AuditDetailPage />} />
            <Route path="ncr" element={<PageGuard pageKey="/ncr"><NCRPage /></PageGuard>} />
            <Route path="purchase-requests" element={<PurchaseRequestsPage />} />
            <Route path="ppe-tracker" element={<PageGuard pageKey="/ppe-tracker"><PPERequestTrackerPage /></PageGuard>} />
            <Route path="audits" element={<PageGuard pageKey="/audits"><AuditsPage /></PageGuard>} />
            <Route path="requests" element={<PageGuard pageKey="/requests"><RequestsPage /></PageGuard>} />
            <Route path="repeat-requests" element={<PageGuard pageKey="/repeat-requests"><RepeatRequestsPage /></PageGuard>} />
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
