import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { PublicOnly, RequireAuth } from './auth/Guards'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import TorneosPage from './pages/torneos/TorneosPage'
import TorneoDetailPage from './pages/torneos/TorneoDetailPage'
import EquiposPage from './pages/equipos/EquiposPage'
import EquipoPage from './pages/equipos/EquipoPage'
import JugadorPage from './pages/jugadores/JugadorPage'
import FormacionesPage from './pages/formaciones/FormacionesPage'
import FormacionPage from './pages/formaciones/FormacionPage'
import ConvocatoriasPage from './pages/convocatorias/ConvocatoriasPage'
import ConvocatoriaPage from './pages/convocatorias/ConvocatoriaPage'
import PartidosPage from './pages/partidos/PartidosPage'
import PartidoPage from './pages/partidos/PartidoPage'
import PublicPortalPage from './pages/PublicPortalPage'
import PublicResourcePage from './pages/PublicResourcePage'
import './index.css'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/publico/torneos" element={<PublicPortalPage />} />
          <Route path="/publico/torneos/:id" element={<PublicPortalPage />} />
          <Route path="/publico/torneos/:torneoId/temporadas/:id" element={<PublicResourcePage />} />
          <Route path="/publico/competencias/:id" element={<PublicResourcePage />} />
          <Route path="/publico/partidos/:id" element={<PublicResourcePage />} />
          <Route path="/publico/equipos/:id" element={<PublicResourcePage />} />
          <Route path="/" element={<PublicPortalPage />} />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnly>
                <RegisterPage />
              </PublicOnly>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/torneos"
            element={
              <RequireAuth>
                <TorneosPage />
              </RequireAuth>
            }
          />
          <Route
            path="/torneos/:id"
            element={
              <RequireAuth>
                <TorneoDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/equipos"
            element={
              <RequireAuth>
                <EquiposPage />
              </RequireAuth>
            }
          />
          <Route
            path="/equipos/:id"
            element={
              <RequireAuth>
                <EquipoPage />
              </RequireAuth>
            }
          />
          <Route
            path="/jugadores/:id"
            element={
              <RequireAuth>
                <JugadorPage />
              </RequireAuth>
            }
          />
          <Route
            path="/formaciones"
            element={
              <RequireAuth>
                <FormacionesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/formaciones/:id"
            element={
              <RequireAuth>
                <FormacionPage />
              </RequireAuth>
            }
          />
          <Route
            path="/convocatorias"
            element={
              <RequireAuth>
                <ConvocatoriasPage />
              </RequireAuth>
            }
          />
          <Route
            path="/convocatorias/:id"
            element={
              <RequireAuth>
                <ConvocatoriaPage />
              </RequireAuth>
            }
          />
          <Route path="/partidos" element={<RequireAuth><PartidosPage /></RequireAuth>} />
          <Route path="/partidos/:id" element={<RequireAuth><PartidoPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
