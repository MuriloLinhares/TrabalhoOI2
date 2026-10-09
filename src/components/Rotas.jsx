import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Carregando from './Carregando'

// Só para quem está logado; os outros vão para o login.
export function RotaLogado() {
  const { sessao, carregando } = useAuth()
  const local = useLocation()
  if (carregando) return <Carregando />
  if (!sessao) return <Navigate to="/login" replace state={{ voltarPara: local.pathname }} />
  return <Outlet />
}

// Só para administradores.
export function RotaAdmin() {
  const { ehAdmin, carregando } = useAuth()
  if (carregando) return <Carregando />
  if (!ehAdmin) return <Navigate to="/feed" replace />
  return <Outlet />
}

// Login e cadastro: quem já está logado vai direto ao feed.
export function RotaVisitante() {
  const { sessao, carregando, recuperandoSenha } = useAuth()
  const local = useLocation()
  if (carregando) return <Carregando />
  if (recuperandoSenha) return <Navigate to="/redefinir-senha" replace />
  if (sessao) return <Navigate to={local.state?.voltarPara ?? '/feed'} replace />
  return <Outlet />
}
