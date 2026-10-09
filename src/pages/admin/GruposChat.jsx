import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Crud, { useLista } from './Crud'

const consultaGrupos = () =>
  supabase
    .from('grupos_chat')
    .select('id, nome, descricao, curso_id, periodo, ativo, curso:cursos(sigla)')
    .order('ativo', { ascending: false })
    .order('nome')

// RF24, RF25, RF33: criar, renomear, restringir e arquivar grupos.
// Grupo com mensagens não é apagado (o banco recusa): arquive.
export default function GruposChat() {
  const lista = useLista(consultaGrupos)
  const [cursos, setCursos] = useState([])

  useEffect(() => {
    supabase.from('cursos').select('id, sigla, nome').order('nome').then(({ data }) => setCursos(data ?? []))
  }, [])

  return (
    <>
      <p className="texto-suave">
        Sem curso, o grupo é aberto a todos. Com curso, só os alunos daquele curso entram; com curso
        e período, só quem está naquele ano/semestre. Para tirar um grupo do ar sem perder o
        histórico, desmarque "Ativo" (arquivar).
      </p>
      <Crud
        titulo="Grupos cadastrados"
        singular="Grupo"
        tabela="grupos_chat"
        lista={lista}
        nomeDaLinha={(g) => g.nome}
        textoVazio="Nenhum grupo criado ainda."
        campos={[
          { nome: 'nome', rotulo: 'Nome', dica: 'Ex.: Dúvidas de Cálculo' },
          { nome: 'descricao', rotulo: 'Descrição', dica: 'Opcional', obrigatorio: false },
          {
            nome: 'curso_id',
            rotulo: 'Curso',
            tipo: 'select',
            numerico: true,
            obrigatorio: false,
            textoVazio: 'Aberto a todos',
            opcoes: cursos.map((c) => ({ valor: String(c.id), rotulo: `${c.sigla} — ${c.nome}` })),
          },
          { nome: 'periodo', rotulo: 'Período (opcional)', tipo: 'number', min: 1, max: 12, obrigatorio: false, dica: 'Só com curso. Ex.: 3' },
          { nome: 'ativo', rotulo: 'Ativo', tipo: 'checkbox', padrao: true },
        ]}
        colunas={[
          { titulo: 'Nome', valor: (g) => g.nome },
          {
            titulo: 'Quem participa',
            valor: (g) => (!g.curso ? 'Todos' : g.periodo ? `${g.curso.sigla} · ${g.periodo}º período` : g.curso.sigla),
          },
          { titulo: 'Situação', valor: (g) => (g.ativo ? 'Ativo' : 'Arquivado') },
        ]}
      />
    </>
  )
}
