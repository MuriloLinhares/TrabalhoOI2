import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Logo from './Logo'

export default function Layout() {
  const { sessao, perfil, ehAdmin, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const navigate = useNavigate()

  async function aoSair() {
    await sair()
    navigate('/')
  }

  const fechar = () => setMenuAberto(false)

  return (
    <div className="pagina">
      <header className="cabecalho">
        <div className="cabecalho__conteudo">
          <Link to={sessao ? '/feed' : '/'} className="cabecalho__logo" onClick={fechar}>
            <Logo />
          </Link>

          {sessao && (
            <>
              <button
                className="cabecalho__menu-botao"
                aria-expanded={menuAberto}
                aria-controls="menu-principal"
                onClick={() => setMenuAberto((v) => !v)}
              >
                {menuAberto ? 'Fechar' : 'Menu'}
              </button>
              <nav
                id="menu-principal"
                className={`cabecalho__nav ${menuAberto ? 'cabecalho__nav--aberto' : ''}`}
              >
                <NavLink to="/feed" onClick={fechar}>Feed</NavLink>
                <NavLink to="/publicar" onClick={fechar}>Publicar</NavLink>
                <NavLink to="/chat" onClick={fechar}>Chat</NavLink>
                <NavLink to="/perfil" onClick={fechar}>Meu perfil</NavLink>
                {ehAdmin && <NavLink to="/admin" onClick={fechar}>Painel do admin</NavLink>}
                <button className="botao-link" onClick={aoSair}>Sair</button>
                {perfil?.curso && (
                  <span className="selo-curso" title={perfil.curso.nome}>
                    {perfil.curso.sigla}
                  </span>
                )}
              </nav>
            </>
          )}

          {!sessao && (
            <nav className="cabecalho__nav cabecalho__nav--publico">
              <Link to="/login">Entrar</Link>
              <Link to="/cadastro" className="botao botao--pequeno">Criar conta</Link>
            </nav>
          )}
        </div>
      </header>

      <main className="conteudo">
        <Outlet />
      </main>

      <footer className="rodape">
        <span>HelpIF · IFSC Campus Chapecó · Oficina de Integração</span>
        <Link to="/sobre">Sobre</Link>
        <Link to="/termos">Termos de uso e privacidade</Link>
      </footer>
    </div>
  )
}
