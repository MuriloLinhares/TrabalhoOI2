import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { supabaseConfigurado } from './lib/supabase'
import Layout from './components/Layout'
import { RotaAdmin, RotaLogado, RotaVisitante } from './components/Rotas'
import Inicio from './pages/Inicio'
import Cadastro from './pages/Cadastro'
import Login from './pages/Login'
import EsqueciSenha from './pages/EsqueciSenha'
import RedefinirSenha from './pages/RedefinirSenha'
import Feed from './pages/Feed'
import Perfil from './pages/Perfil'
import FormPublicacao from './pages/FormPublicacao'
import VerPublicacao from './pages/VerPublicacao'
import Chat from './pages/Chat'
import Admin from './pages/admin/Admin'
import Termos from './pages/Termos'
import Sobre from './pages/Sobre'
import NaoEncontrada from './pages/NaoEncontrada'

export default function App() {
  if (!supabaseConfigurado) {
    return (
      <div className="formulario-centro cartao">
        <h1>Falta configurar o Supabase</h1>
        <p>
          Copie o arquivo <code>.env.example</code> para <code>.env</code>, preencha com a URL e a
          chave do seu projeto e reinicie o <code>npm run dev</code>. O passo a passo está no README.
        </p>
      </div>
    )
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Inicio />} />
            <Route path="termos" element={<Termos />} />
            <Route path="sobre" element={<Sobre />} />
            <Route path="redefinir-senha" element={<RedefinirSenha />} />

            <Route element={<RotaVisitante />}>
              <Route path="cadastro" element={<Cadastro />} />
              <Route path="login" element={<Login />} />
              <Route path="esqueci-senha" element={<EsqueciSenha />} />
            </Route>

            <Route element={<RotaLogado />}>
              <Route path="feed" element={<Feed />} />
              <Route path="perfil" element={<Perfil />} />
              <Route path="publicar" element={<FormPublicacao key="nova" />} />
              <Route path="publicacao/:id" element={<VerPublicacao />} />
              <Route path="publicacao/:id/editar" element={<FormPublicacao key="editar" />} />
              <Route path="chat" element={<Chat />} />
              <Route path="chat/:grupoId" element={<Chat />} />
              <Route element={<RotaAdmin />}>
                <Route path="admin" element={<Admin />} />
              </Route>
            </Route>

            <Route path="*" element={<NaoEncontrada />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
