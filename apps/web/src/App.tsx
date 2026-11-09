import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Spinner } from './components/ui'
import { AppLayout } from './components/layout/AppLayout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Roles } from './pages/Roles'
import { RoleDetail } from './pages/RoleDetail'
import { Candidates } from './pages/Candidates'
import { CandidateDetail } from './pages/CandidateDetail'
import { Interviews } from './pages/Interviews'
import { Feedback } from './pages/Feedback'
import { Offers } from './pages/Offers'
import { Projects } from './pages/Projects'
import { Joining } from './pages/Joining'
import { Offboarding } from './pages/Offboarding'
import { Notifications } from './pages/Notifications'
import { AdminConfig } from './pages/AdminConfig'
import { NotFound } from './pages/NotFound'

/** Redirects /pipeline/:roleId → /roles/:roleId */
function PipelineRedirect() {
  const { roleId } = useParams<{ roleId: string }>()
  return <Navigate to={`/roles/${roleId}`} replace />
}

function AppRoutes() {
  const { me, loading } = useAuth()
  if (loading) return <Spinner fullPage />

  if (!me) {
    return (
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="login" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="roles" element={<Roles />} />
        <Route path="roles/:id" element={<RoleDetail />} />
        <Route path="candidates" element={<Candidates />} />
        <Route path="candidates/:id" element={<CandidateDetail />} />
        {/* Kanban pipeline retired — redirect to role hub */}
        <Route path="pipeline" element={<Navigate to="/roles" replace />} />
        <Route path="pipeline/:roleId" element={<PipelineRedirect />} />
        <Route path="interviews" element={<Interviews />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="offers" element={<Offers />} />
        <Route path="projects" element={<Projects />} />
        <Route path="joining" element={<Joining />} />
        <Route path="offboarding" element={<Offboarding />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="admin" element={<AdminConfig />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
