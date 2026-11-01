import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ToastProvider } from "./context/ToastContext.jsx";
import { PreferencesProvider } from "./context/PreferencesContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import Layout from "./layouts/Layout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import MaintenancePage from "./pages/MaintenancePage.jsx";

// Auth screens
import Onboarding from "./pages/auth/Onboarding.jsx";
import Login from "./pages/auth/Login.jsx";
import Register from "./pages/auth/Register.jsx";
import VerifyOtp from "./pages/auth/VerifyOtp.jsx";
import ForgotPassword from "./pages/auth/ForgotPassword.jsx";
import ResetPassword from "./pages/auth/ResetPassword.jsx";

// Existing app screens (from earlier work - untouched for now, later modules will revisit these)
import Dashboard from "./pages/Dashboard.jsx";
import Wallet from "./pages/Wallet.jsx";
import Transactions from "./pages/Transactions.jsx";
import Profile from "./pages/Profile.jsx";
import Referral from "./pages/Referral.jsx";
import Notifications from "./pages/Notifications.jsx";
import Settings from "./pages/Settings.jsx";

// Profile sub-pages
import EditProfile from "./pages/profile/EditProfile.jsx";
import ChangePassword from "./pages/profile/ChangePassword.jsx";
import ChangePin from "./pages/profile/ChangePin.jsx";
import DeviceManagement from "./pages/profile/DeviceManagement.jsx";

// Admin module
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import AdminUserDetail from "./pages/admin/AdminUserDetail.jsx";
import AdminTransactions from "./pages/admin/AdminTransactions.jsx";
import AdminReconciliation from "./pages/admin/AdminReconciliation.jsx";
import BusinessControlCenter from "./pages/admin/BusinessControlCenter.jsx";
import PricingSettings from "./pages/admin/PricingSettings.jsx";
import ServiceToggles from "./pages/admin/ServiceToggles.jsx";
import BankAccounts from "./pages/admin/BankAccounts.jsx";
import ApiCredentials from "./pages/admin/ApiCredentials.jsx";
import MembershipSettings from "./pages/admin/MembershipSettings.jsx";
import CompanyWallet from "./pages/admin/CompanyWallet.jsx";
import Reports from "./pages/admin/Reports.jsx";
import AdminNotifications from "./pages/admin/AdminNotifications.jsx";
import AdminActivityLogPage from "./pages/admin/AdminActivityLog.jsx";
import FinancialAuditTrail from "./pages/admin/FinancialAuditTrail.jsx";
import WebhookLogs from "./pages/admin/WebhookLogs.jsx";
import AdminPinSetup from "./pages/admin/AdminPinSetup.jsx";
import SystemSettings from "./pages/admin/SystemSettings.jsx";
import Verification from "./pages/Verification.jsx";
import AdminKyc from "./pages/admin/AdminKyc.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import Support from "./pages/Support.jsx";
import AdminSupport from "./pages/admin/AdminSupport.jsx";
import PromotionalReserve from "./pages/admin/PromotionalReserve.jsx";

// Wallet module
import FundWallet from "./pages/wallet/FundWallet.jsx";
import SwiftVaultTransfer from "./pages/wallet/SwiftVaultTransfer.jsx";
import Beneficiaries from "./pages/wallet/Beneficiaries.jsx";
import Receipt from "./pages/wallet/Receipt.jsx";

// VTU Services module
import VtuHub from "./pages/vtu/VtuHub.jsx";
import Airtime from "./pages/vtu/Airtime.jsx";
import Data from "./pages/vtu/Data.jsx";
import Cable from "./pages/vtu/Cable.jsx";
import Electricity from "./pages/vtu/Electricity.jsx";
import Betting from "./pages/vtu/Betting.jsx";
import Education from "./pages/vtu/Education.jsx";
import RechargeCard from "./pages/vtu/RechargeCard.jsx";

export default function App() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    const handler = () => setMaintenanceMode(true);
    window.addEventListener("swiftvault-maintenance-mode", handler);
    return () => window.removeEventListener("swiftvault-maintenance-mode", handler);
  }, []);

  if (maintenanceMode) {
    return <MaintenancePage />;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <PreferencesProvider>
          <AuthProvider>
            <BrowserRouter>
            <Routes>
              {/* Auth flow */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Authenticated app - wrapped in responsive Layout shell */}
              <Route
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/wallet/fund" element={<FundWallet />} />
                <Route path="/wallet/beneficiaries" element={<Beneficiaries />} />
                <Route path="/transfer" element={<SwiftVaultTransfer />} />
                <Route path="/receipt/:reference" element={<Receipt />} />
                <Route path="/vtu" element={<VtuHub />} />
                <Route path="/vtu/airtime" element={<Airtime />} />
                <Route path="/vtu/data" element={<Data />} />
                <Route path="/vtu/cable" element={<Cable />} />
                <Route path="/vtu/electricity" element={<Electricity />} />
                <Route path="/vtu/betting" element={<Betting />} />
                <Route path="/vtu/education" element={<Education />} />
                <Route path="/vtu/recharge-card" element={<RechargeCard />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/edit" element={<EditProfile />} />
                <Route path="/profile/change-password" element={<ChangePassword />} />
                <Route path="/profile/change-pin" element={<ChangePin />} />
                <Route path="/profile/devices" element={<DeviceManagement />} />
                <Route path="/referrals" element={<Referral />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/verification" element={<Verification />} />
                <Route path="/support" element={<Support />} />
              </Route>

              {/* Admin panel - separate layout, requires admin role */}
              <Route
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/users/:userId" element={<AdminUserDetail />} />
                <Route path="/admin/kyc" element={<AdminKyc />} />
                <Route path="/admin/transactions" element={<AdminTransactions />} />
                <Route path="/admin/reconciliation" element={<AdminReconciliation />} />
                <Route path="/admin/business-control" element={<BusinessControlCenter />} />
                <Route path="/admin/business-control/pricing" element={<PricingSettings />} />
                <Route path="/admin/business-control/services" element={<ServiceToggles />} />
                <Route path="/admin/business-control/bank-accounts" element={<BankAccounts />} />
                <Route path="/admin/business-control/credentials" element={<ApiCredentials />} />
                <Route path="/admin/business-control/membership" element={<MembershipSettings />} />
                <Route path="/admin/company-wallet" element={<CompanyWallet />} />
                <Route path="/admin/promotional-reserve" element={<PromotionalReserve />} />
                <Route path="/admin/reports" element={<Reports />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/admin/activity-log" element={<AdminActivityLogPage />} />
                <Route path="/admin/financial-audit" element={<FinancialAuditTrail />} />
                <Route path="/admin/webhook-logs" element={<WebhookLogs />} />
                <Route path="/admin/support" element={<AdminSupport />} />
                <Route path="/admin/pin-setup" element={<AdminPinSetup />} />
                <Route path="/admin/system-settings" element={<SystemSettings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </AuthProvider>
        </PreferencesProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
