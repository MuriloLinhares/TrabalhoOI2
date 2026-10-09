import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import { formatarDataHora, formatarTamanho, tipoMaterial } from '../lib/materiais'
import { ListaTags, SeloVerificado } from '../components/CartaoPublicacao'
import Carregando from '../components/Carregando'
import Comentarios from '../components/Comentarios'

// Tela 5: material, anexos, útil/favoritos/comentários (RF16),
// editar/apagar (autor ou admin) e selo "verificado" (RF18).
// Denúncias entram na Fase 4.
export default function VerPublicacao() {
  const { id } = useParams()
  const { perfil, ehAdmin } = useAuth()
  const navigate = useNavigate()
  const [pub, setPub] = useState(undefined)
  const [anexos, setAnexos] = useState([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    async function carregar() {
      const [{ data: pubs, error }, { data: lista, error: erroAnexos }] = await Promise.all([
        supabase.rpc('buscar_publicacoes', { p_id: Number(id) }),
        supabase.from('anexos').select('id, tipo, url, caminho, nome_original, tipo_mime, tamanho')
          .eq('publicacao_id', id).order('id'),
      ])
      if (error || erroAnexos) {
        setErro(traduzirErro(error ?? erroAnexos))
        return setPub(null)
      }
      setPub(pubs[0] ?? null)
      setAnexos(lista)
    }
    if (/^\d+$/.test(id)) carregar()
    else setPub(null)
  }, [id])

  if (pub === undefined) return <Carregando />
  if (erro) return <p className="mensagem-erro cartao" role="alert">{erro}</p>
  if (pub === null) {
    return (
      <div className="estado-vazio cartao">
        <h1>Publicação não encontrada</h1>
        <p>Ela pode ter sido apagada pelo autor ou pela moderação.</p>
        <Link to="/feed" className="botao">Voltar ao feed</Link>
      </div>
    )
  }

  const tipo = tipoMaterial(pub.tipo_material)
  const podeMexer = pub.autor_id === perfil.id || ehAdmin

  // RF41: o arquivo é privado; gera um link que vale 60 segundos.
  async function baixar(anexo) {
    setAviso('')
    const { data, error } = await supabase.storage
      .from('anexos')
      .createSignedUrl(anexo.caminho, 60, { download: anexo.nome_original })
    if (error) return setAviso(traduzirErro(error))
    window.location.assign(data.signedUrl)
  }

  async function apagar() {
    const deOutro = pub.autor_id !== perfil.id
    const pergunta = deOutro
      ? `Apagar "${pub.titulo}", publicado por ${pub.autor_nome}? A ação fica no registro dos admins.`
      : `Apagar "${pub.titulo}"? Ela some do feed.`
    if (!window.confirm(pergunta)) return
    setOcupado(true)
    const { error } = await supabase.rpc('excluir_publicacao', { p_id: pub.id })
    setOcupado(false)
    if (error) return setAviso(traduzirErro(error))
    navigate('/feed', { replace: true })
  }

  async function verificar() {
    setOcupado(true)
    const { error } = await supabase.rpc('marcar_verificado', { p_id: pub.id, p_verificado: !pub.verificado })
    setOcupado(false)
    if (error) return setAviso(traduzirErro(error))
    setPub((p) => ({ ...p, verificado: !p.verificado }))
  }

  // Muda na tela na hora e desfaz se o banco recusar.
  async function alternar(funcao, campo, contador) {
    const valor = !pub[campo]
    const mudar = (v) => setPub((p) => ({
      ...p,
      [campo]: v,
      ...(contador && { [contador]: p[contador] + (v ? 1 : -1) }),
    }))
    setAviso('')
    mudar(valor)
    const { error } = await supabase.rpc(funcao, {
      p_publicacao_id: pub.id,
      [funcao === 'curtir' ? 'p_curtir' : 'p_favoritar']: valor,
    })
    if (error) {
      mudar(!valor)
      setAviso(traduzirErro(error))
    }
  }

  return (
    <article className="ver-pub">
      <Link to="/feed" className="voltar">← Voltar ao feed</Link>

      <section className="cartao">
        <p className="cartao-pub__linha-topo">
          <span aria-hidden="true">{tipo.icone}</span> <span>{tipo.rotulo}</span> · <span>{pub.materia_nome}</span>
          {pub.verificado && <SeloVerificado />}
        </p>
        <h1>{pub.titulo}</h1>
        <p className="cartao-pub__meta">
          Por {pub.autor_nome}{pub.autor_curso && ` · ${pub.autor_curso}`} · {formatarDataHora(pub.criado_em)}
          {pub.atualizado_em && ` · editado em ${formatarDataHora(pub.atualizado_em)}`}
        </p>
        <ListaTags tags={pub.tags} />
        {pub.descricao && <p className="ver-pub__descricao">{pub.descricao}</p>}

        <div className="linha-botoes ver-pub__interacoes">
          {pub.autor_id === perfil.id ? (
            <span className="texto-suave">👍 {pub.total_curtidas} {pub.total_curtidas === 1 ? 'pessoa achou' : 'pessoas acharam'} útil</span>
          ) : (
            <button
              className={`botao botao--pequeno ${pub.curtiu ? '' : 'botao--secundario'}`}
              aria-pressed={pub.curtiu}
              onClick={() => alternar('curtir', 'curtiu', 'total_curtidas')}
            >
              👍 Útil · {pub.total_curtidas}
            </button>
          )}
          <button
            className={`botao botao--pequeno ${pub.favoritou ? '' : 'botao--secundario'}`}
            aria-pressed={pub.favoritou}
            onClick={() => alternar('favoritar', 'favoritou')}
          >
            {pub.favoritou ? '★ Nos favoritos' : '☆ Salvar nos favoritos'}
          </button>
        </div>

        {podeMexer && (
          <div className="linha-botoes ver-pub__acoes">
            <Link to={`/publicacao/${pub.id}/editar`} className="botao botao--secundario botao--pequeno">Editar</Link>
            <button className="botao botao--perigo botao--pequeno" disabled={ocupado} onClick={apagar}>Apagar</button>
            {ehAdmin && (
              <button className="botao botao--secundario botao--pequeno" disabled={ocupado} onClick={verificar}>
                {pub.verificado ? 'Tirar selo de verificado' : 'Marcar como verificado'}
              </button>
            )}
          </div>
        )}
        {aviso && <p className="mensagem-erro" role="alert">{aviso}</p>}
      </section>

      <section className="cartao">
        <h2>Anexos</h2>
        {anexos.length === 0 ? (
          <p className="texto-suave">Esta publicação não tem anexos.</p>
        ) : (
          <ul className="lista-anexos">
            {anexos.map((a) => (
              <li key={a.id}>
                {a.tipo === 'link' ? (
                  <>
                    <span>🔗 {a.nome_original}</span>
                    <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="botao botao--secundario botao--pequeno">
                      Abrir link <span className="so-leitor">(abre em outra aba, site externo)</span>
                    </a>
                  </>
                ) : (
                  <>
                    <span>📎 {a.nome_original} <span className="texto-suave">({formatarTamanho(a.tamanho)})</span></span>
                    <button className="botao botao--pequeno" onClick={() => baixar(a)}>Baixar</button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {anexos.some((a) => a.tipo === 'link') && (
          <p className="campo__dica">Links levam para sites fora do HelpIF. Confira o endereço antes de abrir.</p>
        )}
      </section>

      <Comentarios publicacaoId={pub.id} />
    </article>
  )
}
