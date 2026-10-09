import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import Crud, { useLista } from './Crud'
import Materias from './Materias'
import Publicacoes from './Publicacoes'
import GruposChat from './GruposChat'
import Registro from './Registro'

const ABAS = [
  { id: 'publicacoes', nome: 'Publicações', Componente: Publicacoes },
  { id: 'cursos', nome: 'Cursos', Componente: Cursos },
  { id: 'materias', nome: 'Matérias', Componente: Materias },
  { id: 'tags', nome: 'Tags', Componente: Tags },
  { id: 'calendario', nome: 'Calendário', Componente: Calendario },
  { id: 'chat', nome: 'Grupos de chat', Componente: GruposChat },
  { id: 'registro', nome: 'Registro de ações', Componente: Registro },
]

// Painel do administrador (seção 5, tela 9): RF29, RF33, RF35, RF39 e
// a lista de todas as publicações.
export default function Admin() {
  const { progresso } = useAuth()
  // A aba fica no endereço (/admin#cursos): recarregar não volta para a primeira.
  const [aba, setAba] = useState(() => ABAS.find((a) => `#${a.id}` === window.location.hash)?.id ?? ABAS[0].id)
  const { Componente } = ABAS.find((a) => a.id === aba)

  return (
    <div>
      <h1>Painel do admin</h1>

      {progresso?.calendario_desatualizado && (
        <p className="aviso aviso--alerta" role="alert">
          O calendário não tem o período letivo de hoje. Cadastre o calendário de{' '}
          <strong>{periodoDeHoje()}</strong> na aba Calendário: enquanto isso, o progresso dos
          alunos usa o último período cadastrado.
        </p>
      )}

      <div className="abas" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            className={`abas__aba ${aba === a.id ? 'abas__aba--ativa' : ''}`}
            onClick={() => {
              setAba(a.id)
              window.history.replaceState(window.history.state, '', `#${a.id}`)
            }}
          >
            {a.nome}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        <Componente />
      </div>
    </div>
  )
}

// Só um palpite para o aviso: 1º semestre até junho, 2º depois.
function periodoDeHoje() {
  const hoje = new Date()
  return `${hoje.getFullYear()}/${hoje.getMonth() < 6 ? 1 : 2}`
}

export function formatarData(iso) {
  if (!iso) return ''
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

// ---------------------------------------------------------------------
// Cursos (RF07)
// ---------------------------------------------------------------------
const consultaCursos = () =>
  supabase.from('cursos').select('id, nome, sigla, tipo_periodo, duracao_periodos').order('nome')

function Cursos() {
  const lista = useLista(consultaCursos)
  return (
    <Crud
      titulo="Cursos cadastrados"
      singular="Curso"
      tabela="cursos"
      lista={lista}
      nomeDaLinha={(c) => c.nome}
      textoVazio="Nenhum curso cadastrado ainda."
      campos={[
        { nome: 'nome', rotulo: 'Nome', dica: 'Ex.: Técnico em Informática' },
        { nome: 'sigla', rotulo: 'Sigla', dica: 'Ex.: INFO' },
        {
          nome: 'tipo_periodo',
          rotulo: 'Tipo de período',
          tipo: 'select',
          opcoes: [
            { valor: 'anual', rotulo: 'Anual' },
            { valor: 'semestral', rotulo: 'Semestral' },
          ],
        },
        { nome: 'duracao_periodos', rotulo: 'Duração (anos ou semestres)', tipo: 'number', min: 1, max: 12 },
      ]}
      colunas={[
        { titulo: 'Nome', valor: (c) => c.nome },
        { titulo: 'Sigla', valor: (c) => c.sigla },
        { titulo: 'Período', valor: (c) => (c.tipo_periodo === 'anual' ? 'Anual' : 'Semestral') },
        {
          titulo: 'Duração',
          valor: (c) => `${c.duracao_periodos} ${c.tipo_periodo === 'anual' ? 'anos' : 'semestres'}`,
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------
// Tags (RF23)
// ---------------------------------------------------------------------
const consultaTags = () => supabase.from('tags').select('id, nome').order('nome')

function Tags() {
  const lista = useLista(consultaTags)
  return (
    <Crud
      titulo="Tags oficiais"
      singular="Tag"
      feminino
      tabela="tags"
      lista={lista}
      nomeDaLinha={(t) => t.nome}
      textoVazio="Nenhuma tag cadastrada ainda."
      campos={[{ nome: 'nome', rotulo: 'Nome', dica: 'Ex.: Prova, Resumo, Lista de exercícios' }]}
      colunas={[{ titulo: 'Nome', valor: (t) => t.nome }]}
    />
  )
}

// ---------------------------------------------------------------------
// Calendário letivo (RF08)
// ---------------------------------------------------------------------
const consultaCalendario = () =>
  supabase
    .from('calendario_letivo')
    .select('id, ano, periodo, data_inicio, data_fim')
    .order('ano', { ascending: false })
    .order('periodo', { ascending: false })

function Calendario() {
  const lista = useLista(consultaCalendario)
  return (
    <>
      <p className="texto-suave">
        Cada linha é um semestre letivo. Cursos anuais contam o ano como iniciado quando o 1º
        semestre dele começa.
      </p>
      <Crud
        titulo="Semestres cadastrados"
        singular="Semestre"
        tabela="calendario_letivo"
        lista={lista}
        nomeDaLinha={(s) => `${s.ano}/${s.periodo}`}
        textoVazio="Nenhum semestre cadastrado. Sem calendário, o progresso dos alunos não é calculado."
        campos={[
          { nome: 'ano', rotulo: 'Ano', tipo: 'number', min: 2000, max: 2100, padrao: String(new Date().getFullYear()) },
          {
            nome: 'periodo',
            rotulo: 'Semestre',
            tipo: 'select',
            numerico: true,
            opcoes: [
              { valor: '1', rotulo: '1º semestre' },
              { valor: '2', rotulo: '2º semestre' },
            ],
          },
          { nome: 'data_inicio', rotulo: 'Início', tipo: 'date' },
          { nome: 'data_fim', rotulo: 'Fim', tipo: 'date' },
        ]}
        colunas={[
          { titulo: 'Período', valor: (s) => `${s.ano}/${s.periodo}` },
          { titulo: 'Início', valor: (s) => formatarData(s.data_inicio) },
          { titulo: 'Fim', valor: (s) => formatarData(s.data_fim) },
        ]}
      />
    </>
  )
}
