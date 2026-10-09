import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import Carregando from '../components/Carregando'

const MAX_LETRAS = 1000
const POR_PAGINA = 50
// Mensagens apagadas por outra pessoa não geram aviso em tempo real:
// a conversa é relida de tempos em tempos para elas sumirem.
const RELER_A_CADA_MS = 30000

// Tela 7: grupos de chat (RF24–RF28). Em tela larga, lista e conversa
// ficam lado a lado; no celular, uma de cada vez.
export default function Chat() {
  const { grupoId } = useParams()
  const [grupos, setGrupos] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.rpc('listar_grupos').then(({ data, error }) => {
      if (error) setErro(traduzirErro(error))
      setGrupos(data ?? [])
    })
  }, [])

  if (grupos === null) return <Carregando texto="Carregando grupos…" />

  const grupo = grupos.find((g) => String(g.id) === grupoId)

  return (
    <div className={`chat ${grupoId ? 'chat--conversa-aberta' : ''}`}>
      <aside className="chat__grupos cartao" aria-label="Grupos de chat">
        <h1>Chat</h1>
        {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
        {!erro && grupos.length === 0 && (
          <p className="texto-suave">Nenhum grupo disponível ainda. Os administradores criam os grupos.</p>
        )}
        <ul className="chat__lista-grupos">
          {grupos.map((g) => (
            <li key={g.id}>
              <Link
                to={`/chat/${g.id}`}
                className={`chat__grupo ${String(g.id) === grupoId ? 'chat__grupo--ativo' : ''}`}
                aria-current={String(g.id) === grupoId ? 'page' : undefined}
              >
                <span className="chat__grupo-nome">{g.nome}</span>
                <span className="chat__grupo-info">
                  {publicoDoGrupo(g)}
                  {!g.ativo && ' · arquivado'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat__conversa cartao">
        {grupo ? (
          <Conversa key={grupo.id} grupo={grupo} />
        ) : grupoId ? (
          <div className="estado-vazio">
            <h2>Grupo não encontrado</h2>
            <p>Ele pode ter sido arquivado ou não é do seu curso.</p>
            <Link to="/chat" className="botao">Ver grupos</Link>
          </div>
        ) : (
          <div className="estado-vazio">
            <h2>Escolha um grupo</h2>
            <p>As mensagens aparecem na hora, sem recarregar a página.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function publicoDoGrupo(g) {
  if (!g.curso_sigla) return 'Aberto a todos'
  if (!g.periodo) return `Só ${g.curso_sigla}`
  return `Só ${g.curso_sigla} · ${g.periodo}º período`
}

function Conversa({ grupo }) {
  const { perfil, ehAdmin } = useAuth()
  const [mensagens, setMensagens] = useState(null)
  const [temAnteriores, setTemAnteriores] = useState(false)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aoVivo, setAoVivo] = useState(false)
  const rolagem = useRef(null)
  const ultimoId = useRef(null)
  const grudadoNoFim = useRef(true)

  // Junta mensagens novas sem repetir e mantém em ordem.
  const juntar = useCallback((novas) => {
    setMensagens((atuais) => {
      const porId = new Map((atuais ?? []).map((m) => [m.id, m]))
      novas.forEach((m) => porId.set(m.id, m))
      const lista = [...porId.values()].sort((a, b) => a.id - b.id)
      ultimoId.current = lista.at(-1)?.id ?? null
      return lista
    })
  }, [])

  const reler = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_mensagens', { p_grupo_id: grupo.id, p_limite: POR_PAGINA })
    if (error) return setErro(traduzirErro(error))
    setMensagens((atuais) => {
      // Mantém as páginas antigas já carregadas e troca o trecho recente.
      const menorNovo = data[0]?.id ?? Infinity
      const antigas = (atuais ?? []).filter((m) => m.id < menorNovo)
      const lista = [...antigas, ...data]
      ultimoId.current = lista.at(-1)?.id ?? null
      return lista
    })
    setTemAnteriores((t) => t || data.length === POR_PAGINA)
  }, [grupo.id])

  const buscarNovas = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_mensagens', {
      p_grupo_id: grupo.id,
      p_depois_de: ultimoId.current,
    })
    if (!error) juntar(data)
  }, [grupo.id, juntar])

  // Carrega e assina o tempo real (RF26).
  useEffect(() => {
    reler()
    const canal = supabase
      .channel(`chat-grupo-${grupo.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `grupo_id=eq.${grupo.id}` },
        () => buscarNovas(),
      )
      .subscribe((status) => setAoVivo(status === 'SUBSCRIBED'))
    const timer = setInterval(reler, RELER_A_CADA_MS)
    return () => {
      clearInterval(timer)
      supabase.removeChannel(canal)
    }
  }, [grupo.id, reler, buscarNovas])

  // Desce até a última mensagem, a não ser que a pessoa tenha subido
  // para ler mensagens antigas.
  useLayoutEffect(() => {
    const el = rolagem.current
    if (el && grudadoNoFim.current) el.scrollTop = el.scrollHeight
  }, [mensagens])

  function aoRolar() {
    const el = rolagem.current
    grudadoNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function carregarAnteriores() {
    const el = rolagem.current
    const alturaAntes = el.scrollHeight
    const { data, error } = await supabase.rpc('listar_mensagens', {
      p_grupo_id: grupo.id,
      p_antes_de: mensagens[0]?.id,
      p_limite: POR_PAGINA,
    })
    if (error) return setErro(traduzirErro(error))
    setTemAnteriores(data.length === POR_PAGINA)
    grudadoNoFim.current = false
    juntar(data)
    // Mantém na tela a mesma mensagem que a pessoa estava lendo.
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - alturaAntes })
  }

  async function enviar(e) {
    e?.preventDefault()
    if (!texto.trim() || enviando) return
    setEnviando(true)
    setErro('')
    const { error } = await supabase.rpc('enviar_mensagem', { p_grupo_id: grupo.id, p_texto: texto })
    setEnviando(false)
    if (error) return setErro(traduzirErro(error))
    setTexto('')
    grudadoNoFim.current = true
    buscarNovas()
  }

  async function apagar(m) {
    const deOutro = m.autor_id !== perfil.id
    if (!window.confirm(deOutro ? `Apagar a mensagem de ${m.autor_nome}? Fica no registro dos admins.` : 'Apagar sua mensagem?')) return
    const { error } = await supabase.rpc('excluir_mensagem', { p_id: m.id })
    if (error) return setErro(traduzirErro(error))
    setMensagens((lista) => lista.filter((x) => x.id !== m.id))
  }

  return (
    <>
      <header className="chat__topo">
        <Link to="/chat" className="chat__voltar">← Grupos</Link>
        <div>
          <h2>{grupo.nome}</h2>
          <p className="texto-suave">
            {grupo.descricao || publicoDoGrupo(grupo)}
          </p>
        </div>
        <span className={`chat__status ${aoVivo ? 'chat__status--ok' : ''}`}>
          {aoVivo ? '● ao vivo' : '○ conectando…'}
        </span>
      </header>

      <div className="chat__mensagens" ref={rolagem} onScroll={aoRolar} aria-live="polite" aria-label={`Mensagens de ${grupo.nome}`}>
        {mensagens === null ? (
          <Carregando texto="Carregando mensagens…" />
        ) : (
          <>
            {temAnteriores && (
              <div className="texto-centro">
                <button className="botao botao--secundario botao--pequeno" onClick={carregarAnteriores}>
                  Carregar mensagens anteriores
                </button>
              </div>
            )}
            {mensagens.length === 0 && (
              <p className="estado-vazio">Nenhuma mensagem ainda. Puxe o assunto!</p>
            )}
            {mensagens.map((m, i) => {
              const minha = m.autor_id === perfil.id
              const anterior = mensagens[i - 1]
              const novoDia = !anterior || dia(anterior.criado_em) !== dia(m.criado_em)
              return (
                <div key={m.id}>
                  {novoDia && <p className="chat__dia"><span>{dia(m.criado_em)}</span></p>}
                  <div className={`mensagem ${minha ? 'mensagem--minha' : ''}`}>
                    <p className="mensagem__autor">
                      <strong>{minha ? 'Você' : m.autor_nome}</strong>
                      {m.autor_curso && <span> · {m.autor_curso}</span>}
                      <span> · {hora(m.criado_em)}</span>
                    </p>
                    <p className="mensagem__texto">{m.texto}</p>
                    {(minha || ehAdmin) && grupo.ativo && (
                      <button className="botao-link botao-link--perigo mensagem__apagar" onClick={() => apagar(m)}>
                        Apagar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {grupo.ativo ? (
        <form className="chat__envio" onSubmit={enviar}>
          <label htmlFor="mensagem" className="so-leitor">Mensagem para {grupo.nome}</label>
          <textarea
            id="mensagem"
            rows={2}
            maxLength={MAX_LETRAS}
            placeholder="Escreva uma mensagem…"
            title="Enter envia, Shift+Enter pula linha"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                enviar()
              }
            }}
          />
          <button className="botao" disabled={enviando || !texto.trim()}>Enviar</button>
        </form>
      ) : (
        <p className="aviso">Este grupo está arquivado: dá para ler, mas não para mandar mensagens.</p>
      )}
      {erro && <p className="mensagem-erro chat__erro" role="alert">{erro}</p>}
    </>
  )
}

function dia(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
