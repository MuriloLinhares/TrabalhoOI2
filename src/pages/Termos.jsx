// RF06. TEXTO PROVISÓRIO: o grupo precisa revisar com o professor e com a
// coordenação do campus antes de abrir para os alunos (seção 9).
export default function Termos() {
  return (
    <article className="cartao texto-longo">
      <h1>Termos de uso e política de privacidade</h1>
      <p className="aviso">Versão provisória, em revisão pelo grupo do projeto.</p>

      <h2>O que é o HelpIF</h2>
      <p>
        Um fórum de estudos para alunos do IFSC Campus Chapecó, criado como projeto da disciplina
        Oficina de Integração. Não é um serviço oficial do IFSC.
      </p>

      <h2>Quais dados coletamos e para quê</h2>
      <ul>
        <li><strong>Nome e e-mail institucional:</strong> identificar você e confirmar que é aluno do IFSC.</li>
        <li><strong>Curso e ingresso:</strong> calcular seu período e mostrar materiais do seu semestre.</li>
        <li><strong>Data do aceite destes termos:</strong> registrar seu consentimento.</li>
      </ul>
      <p>Não pedimos CPF, telefone nem endereço. A senha é guardada criptografada.</p>

      <h2>Quem vê seus dados</h2>
      <p>
        Outros alunos veem só seu nome, curso e período. A lista completa de contas é visível apenas
        para os administradores (o grupo do projeto).
      </p>

      <h2>É proibido publicar</h2>
      <ul>
        <li>Respostas ou cola de avaliação que ainda está acontecendo;</li>
        <li>Conteúdo ofensivo, discriminatório ou que exponha outras pessoas;</li>
        <li>Dados pessoais de terceiros;</li>
        <li>Material protegido por direito autoral, como livros inteiros em PDF.</li>
      </ul>
      <p>Publicações que desrespeitem estas regras são apagadas, e a conta pode ser advertida ou bloqueada.</p>

      <h2>Seus direitos (LGPD)</h2>
      <p>
        Você pode corrigir seu nome a qualquer momento e excluir sua conta na página "Meu perfil".
        Ao excluir, seus dados pessoais são apagados; os materiais publicados ficam como
        "Usuário removido".
      </p>
    </article>
  )
}
