# HelpIF

Fórum de estudos dos alunos do IFSC Campus Chapecó: projeto da disciplina Oficina de Integração.
O planejamento completo está em [PLANEJAMENTO-HelpIF.md](PLANEJAMENTO-HelpIF.md).

**Tecnologias:** React + Vite (front-end) e Supabase (banco PostgreSQL, login, arquivos e tempo real).

## Situação

| Fase | Situação |
| --- | --- |
| 1 — Base (cadastro, login, progresso do curso, cadastros do admin) | Feita, falta testar no Supabase |
| 2 — Materiais (publicar, anexos, feed, filtros e busca) | Feita, falta testar no Supabase |
| 3 — Comunidade: curtidas, comentários e favoritos | Feita, falta testar no Supabase |
| 3 — Comunidade: chat em tempo real | Feita, falta testar no Supabase |
| 4 — Moderação e testes | A fazer |

## Como rodar o projeto

### 1. Pré-requisitos

- [Node.js](https://nodejs.org) 20 ou mais novo.
- Uma conta grátis no [Supabase](https://supabase.com).

### 2. Criar o projeto no Supabase

1. No painel do Supabase, clique em **New project** (região: South America – São Paulo).
2. Vá em **SQL Editor**, cole todo o conteúdo de [supabase/migrations/0001_base.sql](supabase/migrations/0001_base.sql) e clique em **Run**.
3. Ainda no SQL Editor, rode [supabase/migrations/0002_materiais.sql](supabase/migrations/0002_materiais.sql)
   (publicações, anexos e o bucket privado `anexos` do Storage).
4. Rode [supabase/migrations/0003_interacoes.sql](supabase/migrations/0003_interacoes.sql)
   (curtidas, comentários, favoritos e ordenação do feed).
5. Rode [supabase/migrations/0004_chat_admin.sql](supabase/migrations/0004_chat_admin.sql)
   (chat em tempo real e a lista de todas as publicações no painel do admin).
6. Rode [supabase/seed.sql](supabase/seed.sql) (cursos, matérias e calendário de **exemplo**).
7. Em **Authentication > URL Configuration**:
   - **Site URL:** `http://localhost:5173` (depois troque pelo endereço da Vercel/Netlify).
   - **Redirect URLs:** adicione `http://localhost:5173/**`.
8. Em **Authentication > Sign In / Providers > Email**, deixe **Confirm email** ligado (RF03) e
   coloque o tamanho mínimo de senha em **8** (RF04).

### 3. Configurar e rodar o site

```bash
npm install
cp .env.example .env      # no Windows: copy .env.example .env
```

Abra o `.env` e preencha com os dados de **Project Settings > API** do Supabase
(`Project URL` e a chave `anon public`). O `.env` **nunca** vai para o GitHub.

```bash
npm run dev
```

Abra http://localhost:5173.

### 4. Criar o primeiro administrador (RF38)

1. Crie sua conta pelo site, com e-mail `@aluno.ifsc.edu.br`, e confirme o e-mail.
2. No SQL Editor do Supabase, rode (trocando o e-mail):

```sql
update usuarios set perfil = 'admin' where email = 'seu.nome@aluno.ifsc.edu.br';
```

3. Saia e entre de novo: o menu **Painel do admin** aparece.

### 5. Testar o banco sem o Supabase

```bash
npm run test:db
```

Roda as quatro migrations e o `seed.sql` num PostgreSQL dentro do Node (PGlite)
e confere cadastro, cálculo do período, regras de segurança, exclusão de conta, publicações, anexos,
filtros, busca, limite anti-spam, curtidas, comentários, favoritos, chat e a lista de publicações do admin. Os testes usam o calendário de
exemplo do `seed.sql`, que vai até 18/12/2026: depois dessa data, acrescente o próximo semestre
no seed para os testes continuarem passando.

## Avisos importantes

- **E-mails de confirmação:** o Supabase grátis envia poucos e-mails por hora (para testes).
  Antes da turma piloto, configure um SMTP próprio em **Authentication > Emails > SMTP Settings**.
- **Projeto pausado:** no plano grátis, o projeto é pausado depois de cerca de 1 semana sem uso.
  Reative no painel antes de apresentar.
- **Banco que já existe:** rode só as migrations que ainda não rodou, em ordem (nunca rode a mesma
  duas vezes). Para começar do zero, rode [supabase/resetar.sql](supabase/resetar.sql) e depois todas.
- **Dados de exemplo:** troque os cursos, matérias e datas do `seed.sql` pelos reais do campus.

## Organização do código

```
supabase/
  migrations/0001_base.sql  Fase 1: contas, cursos, calendário e regras de segurança (RLS)
  migrations/0002_materiais.sql  Fase 2: publicações, tags, anexos (Storage) e busca
  migrations/0003_interacoes.sql Fase 3: curtidas, comentários, favoritos e ordenação
  migrations/0004_chat_admin.sql Fase 3: chat em tempo real; admin: todas as publicações
  seed.sql                  dados iniciais de exemplo
src/
  lib/                      cliente do Supabase, tradução de erros, tipos de material e checagem de arquivos
  contexts/AuthContext.jsx  sessão, perfil e progresso do aluno logado
  components/               layout, rotas protegidas, barra de progresso, aviso de período
  pages/                    uma página por tela (seção 5 do planejamento)
  pages/admin/              painel do administrador
  styles.css                cores e componentes da identidade visual
```

## Regras do Git

- Uma branch por tarefa: `feat/nome-da-tarefa` ou `fix/nome-do-erro`.
- Todo pull request é revisado por outro integrante antes de entrar na `main`.
- Nunca suba o arquivo `.env`.
