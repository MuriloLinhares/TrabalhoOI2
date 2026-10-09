import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import AvisoPeriodo from '../components/AvisoPeriodo'
import BarraProgresso from '../components/BarraProgresso'
import ListaPublicacoes from '../components/ListaPublicacoes'
import { Campo } from './Cadastro'

// RF11, RF36, RF37, "minhas publicações" e favoritos (tela 8).
export default function Perfil() {
  const { perfil, progresso } = useAuth()
  if (!perfil) return null

  const ingresso = perfil.curso?.tipo_periodo === 'semestral'
    ? `${perfil.ano_ingresso}/${perfil.periodo_ingresso}`
    : perfil.ano_ingresso

  return (
    <div className="perfil">
      <AvisoPeriodo />

      <section className="cartao perfil__topo">
        <div className="avatar" aria-hidden="true">{perfil.curso?.sigla}</div>
        <div>
          <h1>{perfil.nome}</h1>
          <p className="texto-suave">{perfil.email}</p>
          <p>
            {perfil.curso?.nome} · ingresso em {ingresso}
            {perfil.perfil === 'admin' && <span className="pilula pilula--admin">Administrador</span>}
          </p>
        </div>
      </section>

      <section className="cartao">
        <h2>Progresso do curso</h2>
        <BarraProgresso progresso={progresso} />
        <p className="campo__dica">
          O período é calculado a partir do seu ingresso. Se reprovou ou trancou, corrija quando o
          aviso de início de período aparecer. Para trocar de curso, fale com um administrador.
        </p>
      </section>

      <section className="perfil__publicacoes">
        <h2>Minhas publicações</h2>
        <ListaPublicacoes
          filtros={{ p_autor_id: perfil.id }}
          vazio={
            <div className="estado-vazio cartao">
              <p>Você ainda não publicou nenhum material.</p>
              <Link to="/publicar" className="botao">Publicar o primeiro</Link>
            </div>
          }
        />
      </section>

      <section className="perfil__publicacoes">
        <h2>Meus favoritos</h2>
        <ListaPublicacoes
          filtros={{ p_favoritos: true }}
          vazio={
            <div className="estado-vazio cartao">
              <p>Nada salvo ainda. Use "Salvar nos favoritos" num material para achar ele rápido aqui.</p>
            </div>
          }
        />
      </section>

      <EditarNome />
      <TrocarSenha />
      <ExcluirConta />
    </div>
  )
}

function EditarNome() {
  const { perfil, recarregarPerfil } = useAuth()
  const [nome, setNome] = useState(perfil.nome)
  const [mensagem, setMensagem] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    if (nome.trim().length < 3) return setMensagem({ erro: 'Digite seu nome completo.' })
    setEnviando(true)
    const { error } = await supabase.from('usuarios').update({ nome: nome.trim() }).eq('id', perfil.id)
    setEnviando(false)
    if (error) return setMensagem({ erro: traduzirErro(error) })
    setMensagem({ ok: 'Nome atualizado.' })
    recarregarPerfil()
  }

  return (
    <form className="cartao" onSubmit={salvar}>
      <h2>Seus dados</h2>
      <Campo id="nome" rotulo="Nome completo">
        <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </Campo>
      <Mensagem {...mensagem} />
      <button className="botao" disabled={enviando || nome.trim() === perfil.nome}>Salvar nome</button>
    </form>
  )
}

function TrocarSenha() {
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mensagem, setMensagem] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    if (senha.length < 8) return setMensagem({ erro: 'A senha precisa ter pelo menos 8 caracteres.' })
    if (senha !== confirmar) return setMensagem({ erro: 'As senhas não são iguais.' })
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) return setMensagem({ erro: traduzirErro(error) })
    setSenha('')
    setConfirmar('')
    setMensagem({ ok: 'Senha alterada.' })
  }

  return (
    <form className="cartao" onSubmit={salvar}>
      <h2>Trocar senha</h2>
      <Campo id="nova-senha" rotulo="Nova senha" dica="Mínimo de 8 caracteres">
        <input id="nova-senha" type="password" autoComplete="new-password"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
      </Campo>
      <Campo id="confirmar-senha" rotulo="Repita a nova senha">
        <input id="confirmar-senha" type="password" autoComplete="new-password"
          value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
      </Campo>
      <Mensagem {...mensagem} />
      <button className="botao" disabled={enviando || !senha}>Trocar senha</button>
    </form>
  )
}

function ExcluirConta() {
  const { sair } = useAuth()
  const [confirmando, setConfirmando] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navigate = useNavigate()

  async function excluir() {
    setEnviando(true)
    const { error } = await supabase.rpc('excluir_minha_conta')
    if (error) {
      setEnviando(false)
      return setErro(traduzirErro(error))
    }
    await sair()
    navigate('/', { replace: true })
  }

  return (
    <section className="cartao zona-perigo">
      <h2>Excluir minha conta</h2>
      <p>
        Seus dados pessoais são apagados. Materiais e comentários que você publicou continuam no
        HelpIF, mas aparecem como "Usuário removido". Não dá para desfazer.
      </p>
      {!confirmando ? (
        <button className="botao botao--perigo" onClick={() => setConfirmando(true)}>
          Quero excluir minha conta
        </button>
      ) : (
        <>
          <Campo id="confirmar-exclusao" rotulo='Para confirmar, digite EXCLUIR'>
            <input id="confirmar-exclusao" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
          <div className="linha-botoes">
            <button className="botao botao--perigo" disabled={texto !== 'EXCLUIR' || enviando} onClick={excluir}>
              {enviando ? 'Excluindo…' : 'Excluir definitivamente'}
            </button>
            <button className="botao botao--secundario" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </>
      )}
    </section>
  )
}

function Mensagem({ ok, erro }) {
  if (erro) return <p className="mensagem-erro" role="alert">{erro}</p>
  if (ok) return <p className="mensagem-ok" role="status">{ok}</p>
  return null
}
