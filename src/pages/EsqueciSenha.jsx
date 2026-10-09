import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import { Campo } from './Cadastro'

// RF05: "esqueci minha senha".
export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setEnviando(false)
    if (error) return setErro(traduzirErro(error))
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="formulario-centro cartao">
        <h1>Confira seu e-mail</h1>
        <p>Se existir uma conta com esse e-mail, você vai receber um link para criar uma nova senha.</p>
        <Link to="/login">Voltar para o login</Link>
      </div>
    )
  }

  return (
    <form className="formulario-centro cartao" onSubmit={enviar}>
      <h1>Esqueci minha senha</h1>
      <p>Digite seu e-mail institucional. Vamos enviar um link para você criar uma senha nova.</p>
      <Campo id="email" rotulo="E-mail institucional">
        <input id="email" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </Campo>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      <button className="botao botao--largo" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar link'}
      </button>
      <p className="texto-centro"><Link to="/login">Voltar para o login</Link></p>
    </form>
  )
}
