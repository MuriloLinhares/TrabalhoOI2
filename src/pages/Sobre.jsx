import { Link } from 'react-router-dom'

// Página "Sobre" (link no rodapé). Pública: não precisa estar logado.
// Ao começar a usar outro aplicativo ou site no projeto, acrescente em
// FERRAMENTAS.

const GRUPO = ['Murilo Linhares', 'Victoria Pagani', 'Guilherme Gessi']

const FERRAMENTAS = [
  { nome: 'Visual Studio Code', uso: 'editor onde o código é escrito' },
  { nome: 'Claude Code', uso: 'assistente de programação com inteligência artificial, usado dentro do VS Code' },
  { nome: 'Supabase', uso: 'banco de dados PostgreSQL, login, armazenamento dos anexos e chat em tempo real' },
  { nome: 'React', uso: 'biblioteca usada para montar as telas do site' },
  { nome: 'Vite', uso: 'ferramenta que roda o site durante o desenvolvimento e prepara a versão final' },
  { nome: 'Node.js', uso: 'necessário para instalar as dependências e rodar o Vite e os testes do banco' },
  { nome: 'Google Fonts', uso: 'fonte Open Sans, a mesma família usada na marca dos Institutos Federais' },
]

const FUNCOES = [
  ['Materiais', 'Resumos, provas antigas, mapas mentais, listas de exercícios e links, com anexos em PDF, imagem, DOCX ou PPTX.'],
  ['Busca e filtros', 'Por curso, ano/semestre, matéria, tipo de material e tag. A busca ignora acentos e maiúsculas.'],
  ['Feed do seu período', 'O sistema calcula em que ano ou semestre você está a partir do ingresso e já mostra o material certo.'],
  ['Comunidade', 'Comentários, botão "útil", favoritos e grupos de chat em tempo real por curso e turma.'],
  ['Moderação', 'Administradores cuidam das publicações, dão o selo de "verificado" e todas as ações ficam registradas.'],
]

export default function Sobre() {
  return (
    <article className="cartao texto-longo sobre">
      <h1>Sobre o HelpIF</h1>
      <p>
        O HelpIF é um fórum de estudos fechado para os alunos do IFSC. A ideia nasceu de um problema
        que todo aluno conhece: os bons materiais (provas antigas, resumos, mapas mentais) ficam
        espalhados em grupos de WhatsApp e pastas pessoais e se perdem a cada turma. Aqui eles ficam
        num lugar só, organizados pelas matérias do campus, inclusive as técnicas.
      </p>

      <h2>Quem somos</h2>
      <p>
        Somos alunos da disciplina <strong>Oficina de Integração 2</strong>, do <strong>3º módulo</strong> do
        curso de <strong>Desenvolvimento de Sistemas</strong> do IFSC. O HelpIF é o nosso projeto da
        disciplina.
      </p>
      <ul className="sobre__grupo">
        {GRUPO.map((nome) => (
          <li key={nome}>
            <span className="avatar sobre__avatar" aria-hidden="true">{iniciais(nome)}</span>
            {nome}
          </li>
        ))}
      </ul>

      <h2>O que dá para fazer</h2>
      <dl className="sobre__funcoes">
        {FUNCOES.map(([titulo, texto]) => (
          <div key={titulo}>
            <dt>{titulo}</dt>
            <dd>{texto}</dd>
          </div>
        ))}
      </dl>

      <h2>Ferramentas que usamos</h2>
      <ul>
        {FERRAMENTAS.map((f) => (
          <li key={f.nome}><strong>{f.nome}</strong>: {f.uso}.</li>
        ))}
      </ul>

      <h2>Privacidade e segurança</h2>
      <p>
        Só entra quem tem e-mail <strong>@aluno.ifsc.edu.br</strong>. Coletamos o mínimo (nome, e-mail,
        curso e ingresso), os anexos só podem ser baixados por quem está logado e você pode excluir
        sua conta quando quiser. Os detalhes estão nos <Link to="/termos">termos de uso e privacidade</Link>.
      </p>

      <h2>Aviso</h2>
      <p className="texto-suave">
        O HelpIF é um projeto acadêmico, feito por alunos, e não é um serviço oficial do IFSC.
        Encontrou um erro ou tem uma sugestão? Fale com o grupo.
      </p>
    </article>
  )
}

function iniciais(nome) {
  const partes = nome.split(' ')
  return (partes[0][0] + partes.at(-1)[0]).toUpperCase()
}
