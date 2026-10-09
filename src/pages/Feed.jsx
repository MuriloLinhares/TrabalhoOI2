import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import { carregarCatalogo, TIPOS_MATERIAL } from '../lib/materiais'
import AvisoPeriodo from '../components/AvisoPeriodo'
import ListaPublicacoes from '../components/ListaPublicacoes'

// Tela principal (RF19–RF22, RF42). Abre já filtrada pelo curso e
// período atual do aluno.
export default function Feed() {
  const { perfil, progresso } = useAuth()
  const [catalogo, setCatalogo] = useState(null)
  const [erroCatalogo, setErroCatalogo] = useState('')

  const meuPeriodo = progresso && !progresso.egresso ? String(progresso.periodo_atual) : ''
  const filtrosDoAluno = useMemo(
    () => ({ curso: String(perfil?.curso_id ?? ''), periodo: meuPeriodo, materia: '', tipo: '', tag: '', busca: '' }),
    [perfil?.curso_id, meuPeriodo],
  )
  const [filtros, setFiltros] = useState(filtrosDoAluno)
  const [textoBusca, setTextoBusca] = useState('')
  const [ordem, setOrdem] = useState('recentes')

  useEffect(() => {
    carregarCatalogo(supabase)
      .then(setCatalogo)
      .catch((e) => setErroCatalogo(traduzirErro(e)))
  }, [])

  // O período pode chegar depois (aviso de confirmação do RF10).
  useEffect(() => setFiltros(filtrosDoAluno), [filtrosDoAluno])

  const primeiroNome = perfil?.nome?.split(' ')[0]
  const unidadeAluno = progresso?.tipo === 'anual' ? 'ano' : 'semestre'

  const curso = catalogo?.cursos.find((c) => String(c.id) === filtros.curso)
  const unidade = curso?.tipo_periodo === 'anual' ? 'ano' : 'semestre'
  const materiasDoFiltro = (catalogo?.materias ?? []).filter((m) => {
    if (!curso) return true
    const vinculo = m.curso_materias.find((v) => v.curso_id === curso.id)
    if (!vinculo) return false
    return !filtros.periodo || vinculo.periodo_sugerido == null || String(vinculo.periodo_sugerido) === filtros.periodo
  })

  function mudar(campo) {
    return (e) => {
      const valor = e.target.value
      setFiltros((f) => {
        const novo = { ...f, [campo]: valor }
        // Trocar curso ou período pode tirar a matéria escolhida da lista.
        if (campo === 'curso') novo.periodo = ''
        if (campo === 'curso' || campo === 'periodo') novo.materia = ''
        return novo
      })
    }
  }

  function buscar(e) {
    e.preventDefault()
    setFiltros((f) => ({ ...f, busca: textoBusca.trim() }))
  }

  function limpar(novos) {
    setFiltros(novos)
    setTextoBusca('')
  }

  const paraBanco = {
    p_curso_id: filtros.curso ? Number(filtros.curso) : null,
    p_periodo: filtros.curso && filtros.periodo ? Number(filtros.periodo) : null,
    p_materia_id: filtros.materia ? Number(filtros.materia) : null,
    p_tipo: filtros.tipo || null,
    p_tag_id: filtros.tag ? Number(filtros.tag) : null,
    p_busca: filtros.busca || null,
    p_ordem: ordem,
  }
  const noMeuPeriodo = JSON.stringify(filtros) === JSON.stringify(filtrosDoAluno)
  const semFiltro = Object.values(filtros).every((v) => v === '')

  return (
    <div className="feed">
      <AvisoPeriodo />

      <header className="feed__cabecalho">
        <div>
          <h1>Olá, {primeiroNome}!</h1>
          {perfil?.curso && progresso && (
            <p className="texto-suave">
              {perfil.curso.nome} ·{' '}
              {progresso.egresso ? 'egresso' : `${progresso.periodo_atual}º ${unidadeAluno}`}
            </p>
          )}
        </div>
        <Link to="/publicar" className="botao">+ Nova publicação</Link>
      </header>

      <section className="cartao filtros" aria-label="Filtros">
        <form className="filtros__busca" onSubmit={buscar} role="search">
          <label htmlFor="busca" className="so-leitor">Buscar no título e na descrição</label>
          <input
            id="busca"
            type="search"
            placeholder="Buscar materiais (ex.: matematica funções)"
            value={textoBusca}
            onChange={(e) => setTextoBusca(e.target.value)}
          />
          <button className="botao">Buscar</button>
        </form>

        {erroCatalogo && <p className="mensagem-erro" role="alert">{erroCatalogo}</p>}

        <div className="filtros__campos">
          <Filtro id="f-curso" rotulo="Curso" valor={filtros.curso} aoMudar={mudar('curso')} todos="Todos os cursos"
            opcoes={catalogo?.cursos.map((c) => ({ valor: c.id, rotulo: c.sigla, titulo: c.nome }))} />
          <Filtro id="f-periodo" rotulo={unidade === 'ano' ? 'Ano' : 'Semestre'} valor={filtros.periodo}
            aoMudar={mudar('periodo')} todos="Todos" desativado={!curso}
            opcoes={curso && Array.from({ length: curso.duracao_periodos }, (_, i) => ({ valor: i + 1, rotulo: `${i + 1}º ${unidade}` }))} />
          <Filtro id="f-materia" rotulo="Matéria" valor={filtros.materia} aoMudar={mudar('materia')} todos="Todas"
            opcoes={materiasDoFiltro.map((m) => ({ valor: m.id, rotulo: m.nome }))} />
          <Filtro id="f-tipo" rotulo="Tipo de material" valor={filtros.tipo} aoMudar={mudar('tipo')} todos="Todos"
            opcoes={TIPOS_MATERIAL} />
          <Filtro id="f-tag" rotulo="Tag" valor={filtros.tag} aoMudar={mudar('tag')} todos="Todas"
            opcoes={catalogo?.tags.map((t) => ({ valor: t.id, rotulo: t.nome }))} />
        </div>

        <div className="linha-botoes">
          <div className="filtros__ordem">
            <label htmlFor="f-ordem">Ordenar por</label>
            <select id="f-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value)}>
              {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </div>
          {!noMeuPeriodo && (
            <button className="botao-link" onClick={() => limpar(filtrosDoAluno)}>
              Voltar para o meu {unidadeAluno}
            </button>
          )}
          {!semFiltro && (
            <button className="botao-link" onClick={() => limpar({ curso: '', periodo: '', materia: '', tipo: '', tag: '', busca: '' })}>
              Ver materiais de todos os cursos
            </button>
          )}
        </div>
      </section>

      <ListaPublicacoes
        filtros={paraBanco}
        vazio={
          <div className="estado-vazio cartao">
            <h2>{filtros.busca ? `Nada encontrado para "${filtros.busca}"` : 'Nenhum material por aqui ainda'}</h2>
            <p>
              {noMeuPeriodo
                ? `Ninguém publicou material do seu ${unidadeAluno} ainda. Seja o primeiro!`
                : 'Tente tirar algum filtro, ou seja o primeiro a publicar.'}
            </p>
            <Link to="/publicar" className="botao">Publicar material</Link>
          </div>
        }
      />

      <Link to="/publicar" className="botao-flutuante" aria-label="Nova publicação" title="Nova publicação">
        <span aria-hidden="true">+</span>
      </Link>
    </div>
  )
}

// RF21
const ORDENS = [
  { valor: 'recentes', rotulo: 'Mais recentes' },
  { valor: 'uteis', rotulo: 'Mais úteis' },
  { valor: 'comentados', rotulo: 'Mais comentados' },
]

function Filtro({ id, rotulo, valor, aoMudar, opcoes, todos, desativado }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={aoMudar} disabled={desativado || !opcoes}>
        <option value="">{todos}</option>
        {opcoes?.map((o) => (
          <option key={o.valor} value={o.valor} title={o.titulo}>{o.rotulo}</option>
        ))}
      </select>
    </div>
  )
}
