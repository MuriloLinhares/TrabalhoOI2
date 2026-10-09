import { supabase } from '../../lib/supabase'
import { useLista } from './Crud'

const ACOES = {
  insert: 'criou',
  update: 'alterou',
  delete: 'apagou',
  verificar: 'deu selo de verificado na',
  desverificar: 'tirou o selo de verificado da',
  restaurar: 'restaurou a',
}

const TABELAS = {
  cursos: 'curso',
  materias: 'matéria',
  curso_materias: 'matéria no curso',
  tags: 'tag',
  calendario_letivo: 'semestre',
  publicacoes: 'publicação',
  comentarios: 'comentário',
  mensagens: 'mensagem do chat',
  grupos_chat: 'grupo de chat',
}

const consultaRegistro = () =>
  supabase
    .from('log_admin')
    .select('id, acao, tipo_alvo, alvo_id, detalhes, data, admin:usuarios(nome)')
    .order('data', { ascending: false })
    .limit(100)

function descrever(linha) {
  const d = linha.detalhes ?? {}
  if (d.nome) return d.nome
  if (d.titulo) return d.titulo
  if (d.texto) return `"${d.texto}"`
  if (d.ano && d.periodo) return `${d.ano}/${d.periodo}`
  if (d.curso_id && d.materia_id) return `curso ${d.curso_id}, matéria ${d.materia_id}`
  return linha.alvo_id ? `#${linha.alvo_id}` : ''
}

// RF35: quem mudou o quê e quando (últimas 100 ações).
export default function Registro() {
  const { linhas, erro } = useLista(consultaRegistro)

  if (erro) return <p className="mensagem-erro" role="alert">{erro}</p>
  if (linhas === null) return <p className="texto-suave">Carregando…</p>
  if (linhas.length === 0) return <p className="estado-vazio">Nenhuma ação registrada ainda.</p>

  return (
    <div className="rolagem-tabela">
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Quem</th>
            <th scope="col">Ação</th>
            <th scope="col">Item</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td>{l.admin?.nome ?? <span className="texto-suave">Sistema / removido</span>}</td>
              <td>{ACOES[l.acao] ?? l.acao} {TABELAS[l.tipo_alvo] ?? l.tipo_alvo}</td>
              <td>{descrever(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
