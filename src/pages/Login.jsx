import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import { Campo } from './Cadastro'

// RF05.
export default function Login() {
  const { contaBloqueada, setContaBloqueada } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setContaBloqueada(false)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })
    setEnviando(false)
    if (error) setErro(traduzirErro(error))
    // Se deu certo, a rota de visitante leva para o feed sozinha.
  }

  return (
    <form className="formulario-centro cartao" onSubmit={enviar}>
      <h1>Entrar</h1>

      {contaBloqueada && (
        <p className="mensagem-erro" role="alert">
          Sua conta está bloqueada. Procure um administrador do HelpIF.
        </p>
      )}

      <Campo id="email" rotulo="E-mail institucional">
        <input id="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      <Campo id="senha" rotulo="Senha">
        <input id="senha" type="password" autoComplete="current-password" required
          value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>

      <p className="texto-direita">
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
      </p>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

      <button className="botao botao--largo" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="texto-centro">
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </form>
  )
}
