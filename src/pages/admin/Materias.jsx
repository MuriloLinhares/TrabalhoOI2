import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { traduzirErro } from '../../lib/erros'
import { Campo } from '../Cadastro'
import { Mensagem, useLista } from './Crud'

const consultaMaterias = () =>
  supabase
    .from('materias')
    .select('id, nome, tecnica, curso_materias(curso_id, periodo_sugerido, curso:cursos(sigla, nome))')
    .order('nome')

const consultaCursos = () =>
  supabase.from('cursos').select('id, nome, sigla, tipo_periodo, duracao_periodos').order('nome')

const FORM_VAZIO = { nome: '', tecnica: false, cursos: {} }

// RF23 e RF29. Uma matéria pode estar em vários cursos (ex.: Português),
// por isso o formulário tem uma lista de cursos com o período de cada um.
// form.cursos = { [curso_id]: 'período sugerido' ('' = sem período) }
export default function Materias() {
  const { linhas, erro, recarregar } = useLista(consultaMaterias)
  const [cursos, setCursos] = useState(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [editando, setEditando] = useState(null)
  const [mensagem, setMensagem] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    consultaCursos().then(({ data, error }) => {
      if (error) setMensagem({ erro: traduzirErro(error) })
      setCursos(data ?? [])
    })
  }, [])

  function limpar() {
    setForm(FORM_VAZIO)
    setEditando(null)
  }

  function editar(m) {
    setForm({
      nome: m.nome,
      tecnica: m.tecnica,
      cursos: Object.fromEntries(m.curso_materias.map((v) => [v.curso_id, v.periodo_sugerido == null ? '' : String(v.periodo_sugerido)])),
    })
    setEditando(m)
    setMensagem(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function marcarCurso(cursoId, marcado) {
    setForm((f) => {
      const novos = { ...f.cursos }
      if (marcado) novos[cursoId] = ''
      else delete novos[cursoId]
      return { ...f, cursos: novos }
    })
  }

  function mudarPeriodo(cursoId, valor) {
    setForm((f) => ({ ...f, cursos: { ...f.cursos, [cursoId]: valor } }))
  }

  async function salvar(e) {
    e.preventDefault()
    if (form.nome.trim().length < 2) return setMensagem({ erro: 'Preencha o nome da matéria.' })
    if (Object.keys(form.cursos).length === 0) {
      return setMensagem({ erro: 'Escolha pelo menos um curso. Sem curso, a matéria não aparece nos filtros do feed.' })
    }

    setEnviando(true)
    try {
      const dados = { nome: form.nome.trim(), tecnica: form.tecnica }
      let materiaId = editando?.id
      if (editando) {
        const { error } = await supabase.from('materias').update(dados).eq('id', materiaId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('materias').insert(dados).select('id').single()
        if (error) throw error
        materiaId = data.id
      }

      // Cursos: tira os desmarcados e grava (ou atualiza) os marcados.
      const marcados = Object.keys(form.cursos).map(Number)
      const desmarcados = (editando?.curso_materias ?? []).map((v) => v.curso_id).filter((id) => !marcados.includes(id))
      if (desmarcados.length) {
        const { error } = await supabase.from('curso_materias').delete()
          .eq('materia_id', materiaId).in('curso_id', desmarcados)
        if (error) throw error
      }
      const { error } = await supabase.from('curso_materias').upsert(
        marcados.map((cursoId) => ({
          materia_id: materiaId,
          curso_id: cursoId,
          periodo_sugerido: form.cursos[cursoId] === '' ? null : Number(form.cursos[cursoId]),
        })),
      )
      if (error) throw error

      setMensagem({ ok: editando ? 'Alterações salvas.' : 'Matéria cadastrada.' })
      limpar()
    } catch (erro) {
      setMensagem({ erro: traduzirErro(erro) })
    }
    setEnviando(false)
    recarregar()
  }

  async function apagar(m) {
    if (!window.confirm(`Apagar "${m.nome}"? Não dá para desfazer.`)) return
    const { error } = await supabase.from('materias').delete().eq('id', m.id)
    if (error) return setMensagem({ erro: traduzirErro(error) })
    if (editando?.id === m.id) limpar()
    setMensagem({ ok: 'Apagada.' })
    recarregar()
  }

  return (
    <section>
      <form className="cartao" onSubmit={salvar}>
        <div className="admin-secao__topo">
          <h2>{editando ? `Editar ${editando.nome}` : 'Nova matéria'}</h2>
          {editando && <button type="button" className="botao-link" onClick={limpar}>Cancelar edição</button>}
        </div>

        <Campo id="materia-nome" rotulo="Nome" dica="Ex.: Matemática">
          <input id="materia-nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
        </Campo>
        <div className="campo">
          <label className="caixa-marcar">
            <input type="checkbox" checked={form.tecnica}
              onChange={(e) => setForm((f) => ({ ...f, tecnica: e.target.checked }))} />
            <span>Matéria técnica</span>
          </label>
        </div>

        <fieldset className="campo">
          <legend>Em quais cursos esta matéria aparece?</legend>
          {cursos === null ? (
            <p className="texto-suave">Carregando cursos…</p>
          ) : cursos.length === 0 ? (
            <p className="texto-suave">Cadastre um curso na aba Cursos primeiro.</p>
          ) : (
            <ul className="escolha-cursos">
              {cursos.map((c) => {
                const marcado = c.id in form.cursos
                const unidade = c.tipo_periodo === 'anual' ? 'ano' : 'semestre'
                return (
                  <li key={c.id}>
                    <label className="caixa-marcar">
                      <input type="checkbox" checked={marcado} onChange={(e) => marcarCurso(c.id, e.target.checked)} />
                      <span>{c.nome} <span className="texto-suave">({c.sigla})</span></span>
                    </label>
                    {marcado && (
                      <select
                        aria-label={`Em qual ${unidade} de ${c.sigla}`}
                        value={form.cursos[c.id]}
                        onChange={(e) => mudarPeriodo(c.id, e.target.value)}
                      >
                        <option value="">Todos os {unidade}s</option>
                        {Array.from({ length: c.duracao_periodos }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}º {unidade}</option>
                        ))}
                      </select>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="campo__dica">
            O ano ou semestre escolhido define em qual período do feed a matéria aparece. "Todos" mostra
            em todos os períodos do curso.
          </p>
        </fieldset>

        <Mensagem {...mensagem} />
        <button className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Adicionar'}
        </button>
      </form>

      <h2>Matérias cadastradas</h2>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {linhas === null ? (
        <p className="texto-suave">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="estado-vazio">Nenhuma matéria cadastrada ainda.</p>
      ) : (
        <div className="rolagem-tabela">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col">Cursos</th>
                <th scope="col"><span className="so-leitor">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((m) => (
                <tr key={m.id}>
                  <td>{m.nome}</td>
                  <td>{m.tecnica ? 'Técnica' : 'Base comum'}</td>
                  <td>
                    {m.curso_materias.length === 0 ? (
                      <span className="mensagem-erro">Nenhum curso</span>
                    ) : (
                      m.curso_materias
                        .map((v) => `${v.curso.sigla}${v.periodo_sugerido ? ` (${v.periodo_sugerido}º)` : ''}`)
                        .sort()
                        .join(', ')
                    )}
                  </td>
                  <td className="tabela__acoes">
                    <button className="botao-link" onClick={() => editar(m)}>Editar</button>
                    <button className="botao-link botao-link--perigo" onClick={() => apagar(m)}>Apagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
