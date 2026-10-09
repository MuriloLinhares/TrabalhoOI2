import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { traduzirErro } from '../../lib/erros'
import { formatarDataHora, tipoMaterial } from '../../lib/materiais'
import { Mensagem } from './Crud'

const POR_PAGINA = 25
const FILTROS_VAZIOS = { busca: '', autor: '', situacao: 'todas' }

// Todas as publicações, inclusive as apagadas, com quem postou (nome e
// e-mail). Ações: ver, verificar, apagar e restaurar (RF18, RF35).
export default function Publicacoes() {
  const [campos, setCampos] = useState(FILTROS_VAZIOS)
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS)
  const [pagina, setPagina] = useState(0)
  const [linhas, setLinhas] = useState(null)
  const [total, setTotal] = useState(0)
  const [mensagem, setMensagem] = useState(null)
  const [ocupado, setOcupado] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_listar_publicacoes', {
      p_busca: filtros.busca || null,
      p_autor: filtros.autor || null,
      p_situacao: filtros.situacao,
      p_limite: POR_PAGINA,
      p_pular: pagina * POR_PAGINA,
    })
    if (error) {
      setMensagem({ erro: traduzirErro(error) })
      return setLinhas([])
    }
    setLinhas(data)
    setTotal(Number(data[0]?.total ?? 0))
  }, [filtros, pagina])

  useEffect(() => {
    carregar()
  }, [carregar])

  function filtrar(e) {
    e.preventDefault()
    setPagina(0)
    setFiltros({ busca: campos.busca.trim(), autor: campos.autor.trim(), situacao: campos.situacao })
  }

  function limpar() {
    setCampos(FILTROS_VAZIOS)
    setFiltros(FILTROS_VAZIOS)
    setPagina(0)
  }

  async function acao(p, funcao, args, textoOk, pergunta) {
    if (pergunta && !window.confirm(pergunta)) return
    setOcupado(p.id)
    setMensagem(null)
    const { error } = await supabase.rpc(funcao, args)
    setOcupado(null)
    if (error) return setMensagem({ erro: traduzirErro(error) })
    setMensagem({ ok: textoOk })
    carregar()
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <section>
      <form className="cartao" onSubmit={filtrar}>
        <h2>Todas as publicações</h2>
        <div className="admin-form__campos">
          <div className="campo">
            <label htmlFor="adm-pub-busca">Título ou descrição</label>
            <input id="adm-pub-busca" type="search" value={campos.busca}
              onChange={(e) => setCampos((c) => ({ ...c, busca: e.target.value }))} />
          </div>
          <div className="campo">
            <label htmlFor="adm-pub-autor">Autor (nome ou e-mail)</label>
            <input id="adm-pub-autor" type="search" value={campos.autor}
              onChange={(e) => setCampos((c) => ({ ...c, autor: e.target.value }))} />
          </div>
          <div className="campo">
            <label htmlFor="adm-pub-situacao">Situação</label>
            <select id="adm-pub-situacao" value={campos.situacao}
              onChange={(e) => setCampos((c) => ({ ...c, situacao: e.target.value }))}>
              <option value="todas">Todas</option>
              <option value="ativas">No ar</option>
              <option value="apagadas">Apagadas</option>
            </select>
          </div>
        </div>
        <div className="linha-botoes">
          <button className="botao">Filtrar</button>
          <button type="button" className="botao botao--secundario" onClick={limpar}>Limpar</button>
        </div>
      </form>

      <Mensagem {...mensagem} />

      {linhas === null ? (
        <p className="texto-suave">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="estado-vazio">Nenhuma publicação encontrada.</p>
      ) : (
        <>
          <p className="texto-suave">{total} {total === 1 ? 'publicação' : 'publicações'}</p>
          <div className="rolagem-tabela">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Publicação</th>
                  <th scope="col">Quem postou</th>
                  <th scope="col">Data</th>
                  <th scope="col">Números</th>
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="so-leitor">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => {
                  const apagada = Boolean(p.excluido_em)
                  return (
                    <tr key={p.id} className={apagada ? 'tabela__linha--apagada' : ''}>
                      <td>
                        {apagada ? <strong>{p.titulo}</strong> : <Link to={`/publicacao/${p.id}`}>{p.titulo}</Link>}
                        <div className="texto-suave tabela__sub">
                          {tipoMaterial(p.tipo_material).rotulo} · {p.materia_nome}
                        </div>
                      </td>
                      <td>
                        {p.autor_nome}
                        {p.autor_curso && <span className="texto-suave"> · {p.autor_curso}</span>}
                        {p.autor_email && <div className="texto-suave tabela__sub">{p.autor_email}</div>}
                      </td>
                      <td className="tabela__nao-quebra">{formatarDataHora(p.criado_em)}</td>
                      <td className="tabela__nao-quebra">
                        👍 {p.total_curtidas} · 💬 {p.total_comentarios} · 📎 {p.total_anexos}
                      </td>
                      <td>
                        {apagada ? (
                          <span className="etiqueta etiqueta--apagada" title={`Apagada em ${formatarDataHora(p.excluido_em)}`}>Apagada</span>
                        ) : (
                          <span className="etiqueta">No ar</span>
                        )}
                        {p.verificado && <span className="etiqueta etiqueta--verificado">✓ Verificado</span>}
                      </td>
                      <td className="tabela__acoes">
                        {apagada ? (
                          <button className="botao-link" disabled={ocupado === p.id}
                            onClick={() => acao(p, 'restaurar_publicacao', { p_id: p.id }, 'Publicação restaurada.')}>
                            Restaurar
                          </button>
                        ) : (
                          <>
                            <button className="botao-link" disabled={ocupado === p.id}
                              onClick={() => acao(p, 'marcar_verificado', { p_id: p.id, p_verificado: !p.verificado },
                                p.verificado ? 'Selo retirado.' : 'Marcada como verificada.')}>
                              {p.verificado ? 'Tirar selo' : 'Verificar'}
                            </button>
                            <button className="botao-link botao-link--perigo" disabled={ocupado === p.id}
                              onClick={() => acao(p, 'excluir_publicacao', { p_id: p.id }, 'Publicação apagada.',
                                `Apagar "${p.titulo}", de ${p.autor_nome}?`)}>
                              Apagar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {paginas > 1 && (
            <div className="paginacao">
              <button className="botao botao--secundario botao--pequeno" disabled={pagina === 0}
                onClick={() => setPagina((n) => n - 1)}>← Anterior</button>
              <span>Página {pagina + 1} de {paginas}</span>
              <button className="botao botao--secundario botao--pequeno" disabled={pagina + 1 >= paginas}
                onClick={() => setPagina((n) => n + 1)}>Próxima →</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
