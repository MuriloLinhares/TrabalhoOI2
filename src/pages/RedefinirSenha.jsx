import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import Carregando from '../components/Carregando'
import { Campo } from './Cadastro'

// Página aberta pelo link do e-mail de "esqueci minha senha".
export default function RedefinirSenha() {
  const { sessao, carregando, setRecuperandoSenha } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navigate = useNavigate()

  if (carregando) return <Carregando />
  if (!sessao) {
    return (
      <div className="formulario-centro cartao">
        <h1>Link inválido ou expirado</h1>
        <p>Peça um novo link de recuperação de senha.</p>
        <Link to="/esqueci-senha" className="botao">Pedir novo link</Link>
      </div>
    )
  }

  async function enviar(e) {
    e.preventDefault()
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== confirmar) return setErro('As senhas não são iguais.')
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) return setErro(traduzirErro(error))
    setRecuperandoSenha(false)
    navigate('/feed', { replace: true })
  }

  return (
    <form className="formulario-centro cartao" onSubmit={enviar}>
      <h1>Criar nova senha</h1>
      <Campo id="senha" rotulo="Nova senha" dica="Mínimo de 8 caracteres">
        <input id="senha" type="password" autoComplete="new-password"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      <Campo id="confirmar" rotulo="Repita a nova senha">
        <input id="confirmar" type="password" autoComplete="new-password"
          value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
      </Campo>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      <button className="botao botao--largo" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  )
}
