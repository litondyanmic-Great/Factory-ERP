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
import InventoryList from './pages/inventory/InventoryList';
import NewItem from './pages/inventory/NewItem';
import ItemDetail from './pages/inventory/ItemDetail';
import UsersAdmin from './pages/admin/UsersAdmin';

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
              path="/inventory/:id"
              element={
                <ProtectedRoute permission="inventory:view">
                  <ItemDetail />
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
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
