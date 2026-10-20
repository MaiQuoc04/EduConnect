import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

// Add each screen from the screen list under the protected layout, e.g.
//   <Route path="students" element={<ProtectedRoute roles={['SCHOOL_MANAGER']}><StudentListPage /></ProtectedRoute>} />
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
