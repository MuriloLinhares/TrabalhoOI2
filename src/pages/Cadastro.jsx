import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DOMINIO_EMAIL, supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'

const ANO_ATUAL = new Date().getFullYear()
const ANOS = Array.from({ length: 7 }, (_, i) => ANO_ATUAL - i)

// RF01–RF04, RF06.
export default function Cadastro() {
  const [cursos, setCursos] = useState(null)
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
    cursoId: '',
    anoIngresso: String(ANO_ATUAL),
    periodoIngresso: '1',
    aceite: false,
  })
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    supabase
      .from('cursos')
      .select('id, nome, tipo_periodo')
      .order('nome')
      .then(({ data, error }) => {
        if (error) setErroGeral(traduzirErro(error))
        setCursos(data ?? [])
      })
  }, [])

  const cursoEscolhido = cursos?.find((c) => String(c.id) === form.cursoId)
  const semestral = cursoEscolhido?.tipo_periodo === 'semestral'

  function mudar(campo) {
    return (e) => {
      const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm((f) => ({ ...f, [campo]: valor }))
    }
  }

  function validar() {
    const e = {}
    if (form.nome.trim().length < 3) e.nome = 'Digite seu nome completo.'
    if (!form.email.trim().toLowerCase().endsWith(DOMINIO_EMAIL)) {
      e.email = `Use seu e-mail institucional (${DOMINIO_EMAIL}).`
    }
    if (form.senha.length < 8) e.senha = 'A senha precisa ter pelo menos 8 caracteres.'
    if (form.confirmarSenha !== form.senha) e.confirmarSenha = 'As senhas não são iguais.'
    if (!form.cursoId) e.cursoId = 'Escolha seu curso.'
    if (!form.aceite) e.aceite = 'É preciso aceitar os termos para criar a conta.'
    return e
  }

  async function enviar(ev) {
    ev.preventDefault()
    setErroGeral('')
    const e = validar()
    setErros(e)
    if (Object.keys(e).length) return

    setEnviando(true)
    const { error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.senha,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          nome: form.nome.trim(),
          curso_id: Number(form.cursoId),
          ano_ingresso: Number(form.anoIngresso),
          periodo_ingresso: semestral ? Number(form.periodoIngresso) : 1,
          aceite_termos: true,
        },
      },
    })
    setEnviando(false)
    if (error) return setErroGeral(traduzirErro(error))
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="formulario-centro cartao">
        <h1>Confira seu e-mail</h1>
        <p>
          Enviamos um link de confirmação para <strong>{form.email.trim().toLowerCase()}</strong>.
          Clique nele para ativar sua conta e depois faça login.
        </p>
        <p className="texto-suave">Não chegou? Olhe a pasta de spam ou lixo eletrônico.</p>
        <Link to="/login" className="botao">Ir para o login</Link>
      </div>
    )
  }

  return (
    <form className="formulario-centro cartao" onSubmit={enviar} noValidate>
      <h1>Criar conta</h1>

      <Campo id="nome" rotulo="Nome completo" erro={erros.nome}>
        <input id="nome" autoComplete="name" value={form.nome} onChange={mudar('nome')} />
      </Campo>

      <Campo id="email" rotulo="E-mail institucional" erro={erros.email} dica={`Termina com ${DOMINIO_EMAIL}`}>
        <input id="email" type="email" autoComplete="email" value={form.email} onChange={mudar('email')} />
      </Campo>

      <Campo id="senha" rotulo="Senha" erro={erros.senha} dica="Mínimo de 8 caracteres">
        <input id="senha" type="password" autoComplete="new-password" value={form.senha} onChange={mudar('senha')} />
      </Campo>

      <Campo id="confirmarSenha" rotulo="Repita a senha" erro={erros.confirmarSenha}>
        <input id="confirmarSenha" type="password" autoComplete="new-password"
          value={form.confirmarSenha} onChange={mudar('confirmarSenha')} />
      </Campo>

      <Campo id="cursoId" rotulo="Curso" erro={erros.cursoId}>
        <select id="cursoId" value={form.cursoId} onChange={mudar('cursoId')} disabled={!cursos}>
          <option value="">{cursos ? 'Escolha seu curso…' : 'Carregando cursos…'}</option>
          {cursos?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>

      <fieldset className="campo">
        <legend>Quando você entrou no curso?</legend>
        <div className="linha-campos">
          <select aria-label="Ano de ingresso" value={form.anoIngresso} onChange={mudar('anoIngresso')}>
            {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {semestral && (
            <select aria-label="Semestre de ingresso" value={form.periodoIngresso} onChange={mudar('periodoIngresso')}>
              <option value="1">1º semestre</option>
              <option value="2">2º semestre</option>
            </select>
          )}
        </div>
        <p className="campo__dica">
          Informe quando você <strong>entrou</strong>, não o período de agora: o HelpIF calcula sozinho.
        </p>
      </fieldset>

      <div className="campo">
        <label className="caixa-marcar">
          <input type="checkbox" checked={form.aceite} onChange={mudar('aceite')} />
          <span>
            Li e aceito os <Link to="/termos" target="_blank">termos de uso e a política de privacidade</Link>.
          </span>
        </label>
        {erros.aceite && <p className="campo__erro">{erros.aceite}</p>}
      </div>

      {erroGeral && <p className="mensagem-erro" role="alert">{erroGeral}</p>}

      <button className="botao botao--largo" disabled={enviando}>
        {enviando ? 'Criando conta…' : 'Criar conta'}
      </button>
      <p className="texto-centro">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </form>
  )
}

export function Campo({ id, rotulo, erro, dica, children }) {
  return (
    <div className={`campo ${erro ? 'campo--com-erro' : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {dica && !erro && <p className="campo__dica">{dica}</p>}
      {erro && <p className="campo__erro">{erro}</p>}
    </div>
  )
}
