import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Shell from './components/Shell';

import Login from './pages/Login';
import Signup from './pages/Signup';
import PendingApproval from './pages/PendingApproval';
import Dashboard from './pages/Dashboard';
import StylesList from './pages/production/StylesList';
import NewStyle from './pages/production/NewStyle';
import StyleDetail from './pages/production/StyleDetail';
import StyleFullReport from './pages/production/StyleFullReport';
import InventoryList from './pages/inventory/InventoryList';
import NewItem from './pages/inventory/NewItem';
import ItemDetail from './pages/inventory/ItemDetail';
import StyleYarnTracking from './pages/inventory/StyleYarnTracking';
import WindingQueue from './pages/inventory/WindingQueue';
import UsersAdmin from './pages/admin/UsersAdmin';
import Settings from './pages/admin/Settings';
import DataCleanup from './pages/admin/DataCleanup';
import QualityDashboard from './pages/quality/QualityDashboard';
import QCEntry from './pages/quality/QCEntry';
import QualityReports from './pages/quality/QualityReports';
import ZeroThreadReport from './pages/quality/ZeroThreadReport';
import QualityTrends from './pages/quality/QualityTrends';
import ShipmentTracking from './pages/quality/ShipmentTracking';
import IEDashboard from './pages/ie/IEDashboard';
import StyleAccessoryTracking from './pages/inventory/StyleAccessoryTracking';
import YarnBlockManager from './pages/inventory/YarnBlockManager';
import YarnLeftoverBank from './pages/inventory/YarnLeftoverBank';
import ReportsCenter from './pages/ReportsCenter';
import DailyProductionSheet from './pages/DailyProductionSheet';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pending" element={<PendingApproval />} />

          <Route
            element={
              <ProtectedRoute>
                <Shell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />

            <Route
              path="/production"
              element={
                <ProtectedRoute permission="style:view">
                  <StylesList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/production/new"
              element={
                <ProtectedRoute permission="style:create">
                  <NewStyle />
                </ProtectedRoute>
              }
            />
            <Route
              path="/production/:id"
              element={
                <ProtectedRoute permission="style:view">
                  <StyleDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/production/:id/report"
              element={
                <ProtectedRoute permission="style:view">
                  <StyleFullReport />
                </ProtectedRoute>
              }
            />

            <Route
              path="/inventory"
              element={
                <ProtectedRoute permission="inventory:view">
                  <InventoryList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/new"
              element={
                <ProtectedRoute permission="inventory:manage">
                  <NewItem />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/yarn-tracking"
              element={
                <ProtectedRoute permission="inventory:view">
                  <StyleYarnTracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/winding"
              element={
                <ProtectedRoute permission="inventory:view">
                  <WindingQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/accessory-tracking"
              element={
                <ProtectedRoute permission="inventory:view">
                  <StyleAccessoryTracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/yarn-blocks"
              element={
                <ProtectedRoute permission="inventory:view">
                  <YarnBlockManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/yarn-leftover"
              element={
                <ProtectedRoute permission="inventory:view">
                  <YarnLeftoverBank />
                </ProtectedRoute>
              }
            />

            <Route
              path="/reports"
              element={
                <ProtectedRoute permission="report:view">
                  <ReportsCenter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/daily-sheet"
              element={
                <ProtectedRoute permission="report:view">
                  <DailyProductionSheet />
                </ProtectedRoute>
              }
            />
            <Route
              path="/inventory/:id"
              element={
                <ProtectedRoute permission="inventory:view">
                  <ItemDetail />
                </ProtectedRoute>
              }
            />

            <Route
              path="/quality"
              element={
                <ProtectedRoute permission="quality:view">
                  <QualityDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quality/entry"
              element={
                <ProtectedRoute permission="quality:entry">
                  <QCEntry />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quality/reports"
              element={
                <ProtectedRoute permission="quality:view">
                  <QualityReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quality/zero-thread"
              element={
                <ProtectedRoute permission="quality:view">
                  <ZeroThreadReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quality/trends"
              element={
                <ProtectedRoute permission="quality:view">
                  <QualityTrends />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quality/shipment"
              element={
                <ProtectedRoute permission="shipment:view">
                  <ShipmentTracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ie"
              element={
                <ProtectedRoute permission="ie:view">
                  <IEDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/users"
              element={
                <ProtectedRoute permission="admin:only">
                  <UsersAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute permission="admin:only">
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/data-cleanup"
              element={
                <ProtectedRoute permission="admin:only">
                  <DataCleanup />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
