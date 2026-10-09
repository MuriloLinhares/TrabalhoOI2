import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import { formatarDataHora } from '../lib/materiais'

const MAX_LETRAS = 2000

// Comentários de uma publicação (RF16). O autor apaga os próprios e o
// admin apaga qualquer um (fica no registro de ações).
export default function Comentarios({ publicacaoId }) {
  const { perfil, ehAdmin } = useAuth()
  const [lista, setLista] = useState(null)
  const [erroLista, setErroLista] = useState('')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_comentarios', { p_publicacao_id: publicacaoId })
    setErroLista(error ? traduzirErro(error) : '')
    setLista(data ?? [])
  }, [publicacaoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim()) return setErro('Escreva o comentário.')
    setEnviando(true)
    setErro('')
    const { error } = await supabase.rpc('comentar', { p_publicacao_id: publicacaoId, p_texto: texto })
    setEnviando(false)
    if (error) return setErro(traduzirErro(error))
    setTexto('')
    carregar()
  }

  async function apagar(c) {
    const deOutro = c.autor_id !== perfil.id
    const pergunta = deOutro
      ? `Apagar o comentário de ${c.autor_nome}? A ação fica no registro dos admins.`
      : 'Apagar seu comentário?'
    if (!window.confirm(pergunta)) return
    const { error } = await supabase.rpc('excluir_comentario', { p_id: c.id })
    if (error) return setErro(traduzirErro(error))
    carregar()
  }

  return (
    <section className="cartao comentarios" aria-labelledby="titulo-comentarios">
      <h2 id="titulo-comentarios">Comentários{lista?.length ? ` (${lista.length})` : ''}</h2>

      {erroLista && <p className="mensagem-erro" role="alert">{erroLista}</p>}
      {lista === null ? (
        <p className="texto-suave">Carregando comentários…</p>
      ) : lista.length === 0 ? (
        <p className="texto-suave">Ninguém comentou ainda. Tirou alguma dúvida com este material? Conte aqui.</p>
      ) : (
        <ul className="comentarios__lista">
          {lista.map((c) => (
            <li key={c.id} className="comentario">
              <p className="comentario__autor">
                <strong>{c.autor_nome}</strong>
                {c.autor_curso && <span className="texto-suave"> · {c.autor_curso}</span>}
                <span className="texto-suave"> · {formatarDataHora(c.criado_em)}</span>
              </p>
              <p className="comentario__texto">{c.texto}</p>
              {(c.autor_id === perfil.id || ehAdmin) && (
                <button className="botao-link botao-link--perigo" onClick={() => apagar(c)}>Apagar</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={enviar} className="comentarios__form">
        <label htmlFor="novo-comentario">Escreva um comentário</label>
        <textarea
          id="novo-comentario"
          rows={3}
          maxLength={MAX_LETRAS}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Dúvida, agradecimento, correção…"
        />
        <div className="linha-botoes comentarios__rodape">
          <span className="campo__dica">{texto.length} de {MAX_LETRAS}</span>
          <button className="botao" disabled={enviando || !texto.trim()}>
            {enviando ? 'Enviando…' : 'Comentar'}
          </button>
        </div>
        {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      </form>
    </section>
  )
}
