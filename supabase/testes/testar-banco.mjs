import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

// Testa o SQL num PostgreSQL de verdade rodando dentro do Node (PGlite),
// sem precisar do Supabase. Rodar com: npm run test:db
const raiz = new URL('../', import.meta.url)
const db = new PGlite()

// Imitação mínima do Supabase.
await db.exec(`
  create role anon; create role authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid, metadata jsonb);
  alter table storage.objects enable row level security;
  grant all on storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`)
await db.exec(readFileSync(new URL('migrations/0001_base.sql', raiz), 'utf8'))
await db.exec(readFileSync(new URL('migrations/0002_materiais.sql', raiz), 'utf8'))
await db.exec(readFileSync(new URL('migrations/0003_interacoes.sql', raiz), 'utf8'))
await db.exec(readFileSync(new URL('migrations/0004_chat_admin.sql', raiz), 'utf8'))
await db.exec(readFileSync(new URL('seed.sql', raiz), 'utf8'))

let ok = 0, falhas = 0
function confere(nome, cond, extra = '') {
  if (cond) { ok++; console.log('  ok   ', nome) }
  else { falhas++; console.log('  FALHA', nome, extra) }
}
async function esperaErro(nome, fn, trecho) {
  try { await fn(); confere(nome, false, '(não deu erro)') }
  catch (e) { confere(nome, !trecho || e.message.includes(trecho), e.message) }
}
const q = async (sql, p) => (await db.query(sql, p)).rows
const comoSuperusuario = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
const comoUsuario = (id) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`)

const curso = async (sigla) => (await q(`select id from cursos where sigla = $1`, [sigla]))[0].id
const INFO = await curso('INFO'), ELETRO = await curso('ELETRO')

async function cadastrar(email, meta) {
  return (await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta]))[0].id
}

console.log('Hoje no teste:', (await q(`select current_date::text d`))[0].d)

console.log('\nCadastro')
await esperaErro('recusa e-mail fora do domínio',
  () => cadastrar('a@gmail.com', { nome: 'Ana', curso_id: INFO, ano_ingresso: 2025, aceite_termos: true }), 'institucional')
await esperaErro('recusa sem aceite dos termos',
  () => cadastrar('a@aluno.ifsc.edu.br', { nome: 'Ana', curso_id: INFO, ano_ingresso: 2025 }), 'termos')
await esperaErro('recusa curso inexistente',
  () => cadastrar('a@aluno.ifsc.edu.br', { nome: 'Ana', curso_id: 999, ano_ingresso: 2025, aceite_termos: true }), 'Curso')
const ana = await cadastrar('Ana@Aluno.IFSC.edu.br', { nome: ' Ana Souza ', curso_id: INFO, ano_ingresso: 2025, aceite_termos: true })
const bia = await cadastrar('bia@aluno.ifsc.edu.br', { nome: 'Bia Lima', curso_id: ELETRO, ano_ingresso: 2025, periodo_ingresso: 1, aceite_termos: true })
const adm = await cadastrar('adm@aluno.ifsc.edu.br', { nome: 'Admin Teste', curso_id: INFO, ano_ingresso: 2024, aceite_termos: true })
const [linhaAna] = await q(`select * from usuarios where id = $1`, [ana])
confere('cria usuario com nome e e-mail normalizados', linhaAna.nome === 'Ana Souza' && linhaAna.email === 'ana@aluno.ifsc.edu.br')
confere('grava aceite dos termos', linhaAna.aceite_termos_em !== null)
confere('curso anual grava confirmação = ano', linhaAna.ultima_confirmacao_periodo === '2026', linhaAna.ultima_confirmacao_periodo)
await q(`update usuarios set perfil = 'admin' where id = $1`, [adm])

console.log('\nProgresso (RF09–RF12)')
await comoUsuario(ana)
let [p] = await q(`select * from calcular_progresso()`)
confere('INFO anual, ingresso 2025 -> 2º ano de 4', p.periodo_atual === 2 && p.duracao === 4 && !p.egresso, JSON.stringify(p))
confere('recém-cadastrada não precisa confirmar', p.precisa_confirmar === false)
confere('calendário cobre hoje', p.calendario_desatualizado === false)

await comoUsuario(bia)
;[p] = await q(`select * from calcular_progresso()`)
confere('ELETRO semestral, ingresso 2025/1 -> 4º de 4 (exemplo do plano sem ajuste)', p.periodo_atual === 4, JSON.stringify(p))
confere('chave semestral 2026/2', p.chave_periodo_atual === '2026/2', p.chave_periodo_atual)
await q(`select confirmar_periodo(3)`)
;[p] = await q(`select * from calcular_progresso()`)
confere('aluna reprovou: informa 3º -> ajuste -1 -> 3º', p.periodo_atual === 3, JSON.stringify(p))
await esperaErro('recusa período fora do curso', () => q(`select confirmar_periodo(9)`), 'entre 1 e 4')

await comoSuperusuario()
await q(`update usuarios set ultima_confirmacao_periodo = '2026/1' where id = $1`, [bia])
await comoUsuario(bia)
;[p] = await q(`select * from calcular_progresso()`)
confere('novo período: precisa confirmar', p.precisa_confirmar === true)
await q(`select confirmar_periodo(null)`)
;[p] = await q(`select * from calcular_progresso()`)
confere('confirmar sem mudar mantém 3º e some o aviso', p.periodo_atual === 3 && p.precisa_confirmar === false)

await esperaErro('aluno não vê progresso de outro', () => q(`select * from calcular_progresso($1)`, [ana]), 'Sem permissão')

await comoSuperusuario()
await q(`update usuarios set ajuste_periodo = 1 where id = $1`, [bia])
await comoUsuario(bia)
;[p] = await q(`select * from calcular_progresso()`)
confere('passou do fim do curso -> egresso, barra em 4 de 4', p.egresso === true && p.periodo_atual === 4 && p.precisa_confirmar === false, JSON.stringify(p))

console.log('\nSegurança (RLS e permissões)')
await comoUsuario(ana)
let linhas = await q(`select id from usuarios`)
confere('aluno só vê a própria conta', linhas.length === 1 && linhas[0].id === ana)
await q(`update usuarios set nome = 'Ana S.' where id = $1`, [ana])
confere('aluno muda o próprio nome', (await q(`select nome from usuarios`))[0].nome === 'Ana S.')
await esperaErro('aluno não se promove a admin', () => q(`update usuarios set perfil = 'admin' where id = $1`, [ana]), 'permission')
await esperaErro('aluno não muda o ajuste direto', () => q(`update usuarios set ajuste_periodo = 3 where id = $1`, [ana]), 'permission')
const r = await db.query(`update usuarios set nome = 'Hacker' where id = $1`, [bia])
confere('aluno não muda nome de outro', r.affectedRows === 0)
await esperaErro('aluno não cria curso', () => q(`insert into cursos (nome, sigla, tipo_periodo, duracao_periodos) values ('X curso','XX','anual',3)`), 'row-level security')
confere('aluno lê matérias', (await q(`select * from materias`)).length === 6)
confere('aluno não lê o log', (await q(`select * from log_admin`)).length === 0)

await comoUsuario(adm)
confere('admin vê todas as contas', (await q(`select id from usuarios`)).length === 3)
await q(`insert into cursos (nome, sigla, tipo_periodo, duracao_periodos) values ('Curso Novo','NOVO','semestral',6)`)
const log = await q(`select * from log_admin where tipo_alvo = 'cursos' and admin_id = $1`, [adm])
confere('admin cria curso e fica no log (RF35)', log.length === 1 && log[0].acao === 'insert')
await esperaErro('nome de curso duplicado (maiúscula) é recusado', () => q(`insert into cursos (nome, sigla, tipo_periodo, duracao_periodos) values ('curso novo','NV2','anual',3)`), 'duplicate')
await esperaErro('não apaga curso com alunos', () => q(`delete from cursos where id = $1`, [INFO]), 'foreign key')

await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`)
confere('visitante lê cursos (tela de cadastro)', (await q(`select * from cursos`)).length === 3)
confere('visitante não lê contas', (await q(`select * from usuarios`)).length === 0)
await esperaErro('visitante não chama calcular_progresso', () => q(`select * from calcular_progresso()`), 'permission')

console.log('\nMateriais (Fase 2)')
await comoSuperusuario()
const idDe = async (tabela, nome) => (await q(`select id from ${tabela} where nome = $1`, [nome]))[0].id
const MAT = await idDe('materias', 'Matemática'), BD = await idDe('materias', 'Banco de Dados')
const ELA = await idDe('materias', 'Eletrônica Analógica')
const PROVA = await idDe('tags', 'Prova'), REVISAO = await idDe('tags', 'Revisão')
const arr = (a) => `{${a.join(',')}}`
async function salvar({ titulo, descricao = '', materia, tipo = 'resumo', tags = [], anexos = [], remover = [], id = null }) {
  const [l] = await q(
    `select salvar_publicacao($1, $2, $3, $4::tipo_material, $5::bigint[], $6::jsonb, $7::bigint[], $8::bigint) id`,
    [titulo, descricao, materia, tipo, arr(tags), JSON.stringify(anexos), arr(remover), id])
  return Number(l.id)
}
const buscar = async (filtros = {}) => {
  const nomes = Object.keys(filtros)
  const args = nomes.map((n, i) => `${n} => $${i + 1}`).join(', ')
  return q(`select * from buscar_publicacoes(${args})`, nomes.map((n) => filtros[n]))
}
const enviarArquivo = (caminho, tamanho, mime) => q(
  `insert into storage.objects (bucket_id, name, metadata) values ('anexos', $1, $2)`,
  [caminho, JSON.stringify({ size: tamanho, mimetype: mime })])

confere('bucket "anexos" é privado com limite de 10 MB',
  (await q(`select * from storage.buckets where id = 'anexos' and not public and file_size_limit = 10485760`)).length === 1)

await comoUsuario(ana)
await enviarArquivo(`${ana}/a.pdf`, 1234, 'application/pdf')
await esperaErro('não envia arquivo na pasta de outro aluno', () => enviarArquivo(`${bia}/x.pdf`, 1, 'application/pdf'), 'row-level security')
const pub1 = await salvar({
  titulo: '  Resumo de Matemática: funções  ', descricao: 'Função do 1º grau e gráficos', materia: MAT,
  tags: [PROVA, REVISAO, PROVA],
  anexos: [{ tipo: 'link', url: 'https://exemplo.com/lista', nome: 'Lista' }, { tipo: 'arquivo', caminho: `${ana}/a.pdf`, nome: 'resumo.pdf' }],
})
let [pub] = await buscar({ p_id: pub1 })
confere('publica com título limpo, 2 tags e 2 anexos (RF13, RF15)',
  pub?.titulo === 'Resumo de Matemática: funções' && pub.tags.length === 2 && pub.total_anexos === 2, JSON.stringify(pub))
confere('mostra nome e curso do autor', pub.autor_nome === 'Ana S.' && pub.autor_curso === 'INFO')
const [arq] = await q(`select * from anexos where publicacao_id = $1 and tipo = 'arquivo'`, [pub1])
confere('tamanho e tipo do arquivo vêm do Storage', arq.tamanho === 1234 && arq.tipo_mime === 'application/pdf')

await esperaErro('recusa mais de 5 tags', () => salvar({ titulo: 'Teste', materia: MAT, tags: [1, 2, 3, 4, 5, 6] }), 'no máximo 5')
await esperaErro('recusa arquivo da pasta de outro aluno', () => salvar({ titulo: 'Teste', materia: MAT, anexos: [{ tipo: 'arquivo', caminho: `${bia}/x.pdf` }] }), 'Anexo inválido')
await esperaErro('recusa arquivo que não está no Storage', () => salvar({ titulo: 'Teste', materia: MAT, anexos: [{ tipo: 'arquivo', caminho: `${ana}/nada.pdf` }] }), 'não terminou')
await esperaErro('recusa link que não é http(s)', () => salvar({ titulo: 'Teste', materia: MAT, anexos: [{ tipo: 'link', url: 'javascript:alert(1)' }] }), 'Link inválido')
await esperaErro('recusa título curto', () => salvar({ titulo: 'ab', materia: MAT }), 'título')
confere('publicações recusadas não ficam pela metade', (await q(`select count(*)::int n from publicacoes`))[0].n === 1)
await esperaErro('aluno não insere direto na tabela', () => q(`insert into publicacoes (autor_id, materia_id, titulo, tipo_material) values ($1, $2, 'Direto', 'outro')`, [ana, MAT]), 'permission')

await enviarArquivo(`${ana}/b.png`, 99, 'image/png')
const pub3 = await salvar({ titulo: 'Exercícios de SQL', materia: BD, tipo: 'lista_exercicios', anexos: [{ tipo: 'arquivo', caminho: `${ana}/b.png`, nome: 'foto.png' }] })
await comoUsuario(adm)
const pub2 = await salvar({ titulo: 'Prova de Eletrônica 2025', materia: ELA, tipo: 'prova_antiga' })

console.log('\nFiltros e busca (RF19, RF20, RF42)')
await comoUsuario(bia)
const ids = (linhas) => linhas.map((l) => Number(l.id)).sort().join(',')
confere('busca sem acento e maiúscula', ids(await buscar({ p_busca: 'MATEMATICA funcoes' })) === `${pub1}`)
confere('busca com palavra que não existe não acha nada', (await buscar({ p_busca: 'matemática química' })).length === 0)
confere('busca na descrição', ids(await buscar({ p_busca: 'gráfico' })) === `${pub1}`)
confere('filtro por curso INFO', ids(await buscar({ p_curso_id: INFO })) === [pub1, pub3].sort().join(','))
confere('filtro curso ELETRO + 1º semestre', ids(await buscar({ p_curso_id: ELETRO, p_periodo: 1 })) === [pub1, pub2].sort().join(','))
confere('filtro curso INFO + 2º ano', ids(await buscar({ p_curso_id: INFO, p_periodo: 2 })) === `${pub3}`)
confere('filtro por matéria', ids(await buscar({ p_materia_id: BD })) === `${pub3}`)
confere('filtro por tipo', ids(await buscar({ p_tipo: 'prova_antiga' })) === `${pub2}`)
confere('filtro por tag', ids(await buscar({ p_tag_id: PROVA })) === `${pub1}`)
confere('filtro por autor', ids(await buscar({ p_autor_id: ana })) === [pub1, pub3].sort().join(','))
const todas = await buscar()
confere('mais recentes primeiro', Number(todas[0].id) === pub2 && todas.length === 3)
const pagina2 = await buscar({ p_limite: 1, p_pular: 1 })
confere('paginação (pular 1, pegar 1)', pagina2.length === 1 && Number(pagina2[0].id) === Number(todas[1].id))

console.log('\nEditar, verificar e apagar (RF18, RNF07)')
await esperaErro('aluno não edita publicação de outro', () => salvar({ id: pub1, titulo: 'Invadido', materia: MAT }), 'só pode editar')
await esperaErro('aluno não verifica material', () => q(`select marcar_verificado($1, true)`, [pub1]), 'Só administradores')
await esperaErro('aluno não apaga publicação de outro', () => q(`select excluir_publicacao($1)`, [pub1]), 'só pode apagar')
confere('aluno logado vê o anexo de publicação visível', (await q(`select 1 from storage.objects where name = $1`, [`${ana}/b.png`])).length === 1)

await comoUsuario(ana)
const [link] = await q(`select id from anexos where publicacao_id = $1 and tipo = 'link'`, [pub1])
await salvar({ id: pub1, titulo: 'Resumo de funções', materia: MAT, tags: [PROVA], remover: [link.id] })
;[pub] = await buscar({ p_id: pub1 })
confere('autor edita título, tags e remove anexo', pub.titulo === 'Resumo de funções' && pub.tags.length === 1 && pub.total_anexos === 1 && pub.atualizado_em)
const r2 = await db.query(`delete from storage.objects where name = $1`, [`${ana}/a.pdf`])
confere('não apaga do Storage arquivo que está numa publicação', r2.affectedRows === 0)
await enviarArquivo(`${ana}/sobra.pdf`, 1, 'application/pdf')
const r3 = await db.query(`delete from storage.objects where name = $1`, [`${ana}/sobra.pdf`])
confere('apaga do Storage arquivo que sobrou de envio com erro', r3.affectedRows === 1)
await q(`select excluir_publicacao($1)`, [pub3])
confere('autor apaga a própria publicação', (await buscar({ p_id: pub3 })).length === 0)
await comoSuperusuario()
confere('apagar é lógico (RNF07)', (await q(`select excluido_em from publicacoes where id = $1`, [pub3]))[0].excluido_em !== null)
confere('exclusão feita pelo próprio autor não vai para o log', (await q(`select 1 from log_admin where tipo_alvo = 'publicacoes'`)).length === 0)

await comoUsuario(bia)
confere('publicação apagada esconde os anexos', (await q(`select 1 from anexos where publicacao_id = $1`, [pub3])).length === 0)
confere('arquivo de publicação apagada não pode ser baixado', (await q(`select 1 from storage.objects where name = $1`, [`${ana}/b.png`])).length === 0)

await comoUsuario(adm)
await salvar({ id: pub1, titulo: 'Resumo de funções (revisado)', materia: MAT, tags: [PROVA] })
await q(`select marcar_verificado($1, true)`, [pub1])
await q(`select excluir_publicacao($1)`, [pub2])
;[pub] = await buscar({ p_id: pub1 })
confere('admin edita publicação de outro e dá o selo verificado', pub.titulo.endsWith('(revisado)') && pub.verificado === true)
const acoes = (await q(`select acao from log_admin where tipo_alvo = 'publicacoes' order by id`)).map((l) => l.acao).join(',')
confere('ações do admin nas publicações vão para o log (RF35)', acoes === 'update,verificar,delete', acoes)

console.log('\nCurtidas, favoritos e comentários (RF16, RF21)')
const contagens = async (id) => (await buscar({ p_id: id }))[0]
await comoUsuario(bia)
await q(`select curtir($1, true)`, [pub1])
await q(`select curtir($1, true)`, [pub1])
await q(`select favoritar($1, true)`, [pub1])
let c1 = await contagens(pub1)
confere('curtir duas vezes conta uma só', c1.total_curtidas === 1 && c1.curtiu === true && c1.favoritou === true, JSON.stringify(c1))
const comBia = Number((await q(`select comentar($1, '  Muito bom, valeu!  ') id`, [pub1]))[0].id)
await esperaErro('comentário seguido é recusado (anti-spam)', () => q(`select comentar($1, 'de novo')`, [pub1]), 'segundos')
await esperaErro('comentário vazio é recusado', () => q(`select comentar($1, '   ')`, [pub1]), 'Escreva')
await esperaErro('não comenta em publicação apagada', () => q(`select comentar($1, 'oi')`, [pub3]), 'não encontrada')
await esperaErro('aluno não grava curtida direto na tabela', () => q(`insert into curtidas values ($1, $2)`, [bia, pub1]), 'permission')
confere('lê só as próprias curtidas', (await q(`select * from curtidas`)).length === 1)
confere('favoritos filtram a lista', ids(await buscar({ p_favoritos: true })) === `${pub1}`)

await comoUsuario(ana)
await esperaErro('autor não curte o próprio material', () => q(`select curtir($1, true)`, [pub1]), 'próprio')
const comAna = Number((await q(`select comentar($1, 'Obrigada!') id`, [pub1]))[0].id)
confere('outros não veem curtidas alheias', (await q(`select * from curtidas`)).length === 0)
confere('favoritos de outro não aparecem', (await buscar({ p_favoritos: true })).length === 0)
let coms = await q(`select * from listar_comentarios($1)`, [pub1])
confere('lista comentários em ordem com nome e curso', coms.length === 2 && coms[0].texto === 'Muito bom, valeu!' && coms[0].autor_nome === 'Bia Lima' && coms[0].autor_curso === 'ELETRO', JSON.stringify(coms))
await esperaErro('aluno não apaga comentário de outro', () => q(`select excluir_comentario($1)`, [comBia]), 'só pode apagar')
await q(`select excluir_comentario($1)`, [comAna])
c1 = await contagens(pub1)
confere('apagar comentário próprio tira da contagem', c1.total_comentarios === 1 && c1.curtiu === false, JSON.stringify(c1))

await comoUsuario(adm)
const pub4 = await salvar({ titulo: 'Resumo de Física', materia: await idDe('materias', 'Física') })
await q(`select curtir($1, true)`, [pub1])
await q(`select comentar($1, 'Comentário do admin')`, [pub4])
await comoSuperusuario()
await q(`update comentarios set criado_em = now() - interval '1 minute'`)
await comoUsuario(bia)
await q(`select comentar($1, 'mais um')`, [pub4])
await comoUsuario(adm)
confere('ordenar por mais úteis', Number((await buscar({ p_ordem: 'uteis' }))[0].id) === pub1)
confere('ordenar por mais comentados', Number((await buscar({ p_ordem: 'comentados' }))[0].id) === pub4)
confere('mais recentes continua o padrão', Number((await buscar())[0].id) === pub4)
await q(`select excluir_comentario($1)`, [comBia])
confere('admin apaga comentário e fica no log', (await q(`select 1 from log_admin where tipo_alvo = 'comentarios' and acao = 'delete'`)).length === 1)

console.log('\nChat (RF24–RF28, RNF05)')
const passarTempo = async () => { await comoSuperusuario(); await q(`update mensagens set criado_em = criado_em - interval '1 minute'`) }
await comoUsuario(adm)
const novoGrupo = async (nome, curso = null, periodo = null) =>
  Number((await q(`insert into grupos_chat (nome, curso_id, periodo) values ($1, $2, $3) returning id`, [nome, curso, periodo]))[0].id)
const gInfo = await novoGrupo('Informática', INFO)
const gInfo2 = await novoGrupo('Informática – 2º ano', INFO, 2)
const gInfo3 = await novoGrupo('Informática – 3º ano', INFO, 3)
const gEletro = await novoGrupo('Eletro', ELETRO)
const gArquivado = await novoGrupo('Antigo')
await q(`update grupos_chat set ativo = false where id = $1`, [gArquivado])
confere('admin cria grupos e fica no log (RF33)', (await q(`select 1 from log_admin where tipo_alvo = 'grupos_chat' and admin_id = $1`, [adm])).length === 6)
confere('admin vê todos os grupos, inclusive arquivado', (await q(`select * from listar_grupos()`)).length === 6)
const GERAL = Number((await q(`select id from grupos_chat where nome = 'Geral'`))[0].id)

await comoUsuario(ana)
const nomesGrupos = async () => (await q(`select nome from listar_grupos()`)).map((g) => g.nome).sort().join(' | ')
confere('aluna INFO 2º ano vê Geral, INFO e INFO 2º ano (RF25)', (await nomesGrupos()) === 'Geral | Informática | Informática – 2º ano', await nomesGrupos())
await esperaErro('aluno não cria grupo', () => novoGrupo('Pirata'), 'row-level security')
const m1 = Number((await q(`select enviar_mensagem($1, '  Oi, gente!  ') id`, [GERAL]))[0].id)
await esperaErro('2ª mensagem em menos de 2 s é recusada', () => q(`select enviar_mensagem($1, 'de novo')`, [GERAL]), '2 segundos')
await passarTempo(); await comoUsuario(ana)
await esperaErro('não manda mensagem em grupo de outro curso', () => q(`select enviar_mensagem($1, 'oi')`, [gEletro]), 'não está disponível')
await esperaErro('não manda mensagem em grupo de outro período', () => q(`select enviar_mensagem($1, 'oi')`, [gInfo3]), 'não está disponível')
await esperaErro('não manda mensagem em grupo arquivado', () => q(`select enviar_mensagem($1, 'oi')`, [gArquivado]), 'não está disponível')
await esperaErro('mensagem vazia é recusada', () => q(`select enviar_mensagem($1, '   ')`, [GERAL]), 'Escreva')
await esperaErro('aluno não grava mensagem direto na tabela', () => q(`insert into mensagens (grupo_id, autor_id, texto) values ($1, $2, 'x')`, [GERAL, ana]), 'permission')
await q(`select enviar_mensagem($1, 'Só pra turma')`, [gInfo2])

await comoUsuario(bia)
confere('aluna ELETRO não vê grupos da INFO', (await nomesGrupos()) === 'Eletro | Geral', await nomesGrupos())
let msgs = await q(`select * from listar_mensagens($1)`, [GERAL])
confere('histórico com nome, curso e horário (RF27)', msgs.length === 1 && msgs[0].texto === 'Oi, gente!' && msgs[0].autor_nome === 'Ana S.' && msgs[0].autor_curso === 'INFO' && msgs[0].criado_em, JSON.stringify(msgs))
confere('não lê mensagens de grupo de outro curso', (await q(`select * from listar_mensagens($1)`, [gInfo2])).length === 0 && (await q(`select * from mensagens where grupo_id = $1`, [gInfo2])).length === 0)
const m2 = Number((await q(`select enviar_mensagem($1, 'Oi, Ana!') id`, [GERAL]))[0].id)
confere('busca só as mensagens novas', (await q(`select * from listar_mensagens($1, p_depois_de => $2)`, [GERAL, m1])).map((m) => Number(m.id)).join() === `${m2}`)
await esperaErro('aluno não apaga mensagem de outro', () => q(`select excluir_mensagem($1)`, [m1]), 'só pode apagar')

await comoSuperusuario()
await q(`update usuarios set silenciado_ate = now() + interval '1 day' where id = $1`, [bia])
await passarTempo(); await comoUsuario(bia)
await esperaErro('aluno silenciado não manda mensagem (RF28)', () => q(`select enviar_mensagem($1, 'oi')`, [GERAL]), 'silenciado')
await comoSuperusuario()
await q(`update usuarios set silenciado_ate = null where id = $1`, [bia])

await comoUsuario(adm)
await q(`select excluir_mensagem($1)`, [m2])
confere('admin apaga mensagem e fica no log', (await q(`select 1 from log_admin where tipo_alvo = 'mensagens'`)).length === 1)
await comoUsuario(ana)
msgs = await q(`select * from listar_mensagens($1)`, [GERAL])
confere('mensagem apagada some do histórico', msgs.length === 1 && Number(msgs[0].id) === m1)
await q(`select excluir_mensagem($1)`, [m1])
confere('autor apaga a própria mensagem', (await q(`select * from listar_mensagens($1)`, [GERAL])).length === 0)
await comoUsuario(adm)
await esperaErro('grupo com conversa não é apagado (arquivar)', () => q(`delete from grupos_chat where id = $1`, [GERAL]), 'foreign key')

console.log('\nPainel: todas as publicações')
await comoUsuario(ana)
await esperaErro('aluno não usa a lista do admin', () => q(`select * from admin_listar_publicacoes()`), 'Só administradores')
await comoUsuario(adm)
let lista = await q(`select * from admin_listar_publicacoes()`)
confere('admin vê ativas e apagadas, com total', lista.length === 4 && Number(lista[0].total) === 4, JSON.stringify(lista.map((l) => l.titulo)))
const daAna = lista.find((l) => Number(l.id) === pub1)
confere('mostra nome e e-mail de quem postou', daAna.autor_nome === 'Ana S.' && daAna.autor_email === 'ana@aluno.ifsc.edu.br' && daAna.total_curtidas === 2, JSON.stringify(daAna))
confere('filtra apagadas', (await q(`select * from admin_listar_publicacoes(p_situacao => 'apagadas')`)).map((l) => Number(l.id)).sort().join() === [pub2, pub3].sort().join())
confere('filtra por e-mail do autor', (await q(`select * from admin_listar_publicacoes(p_autor => 'ANA@aluno')`)).length === 2)
confere('busca pelo título', (await q(`select * from admin_listar_publicacoes(p_busca => 'fisica')`)).length === 1)
const pag = await q(`select * from admin_listar_publicacoes(p_limite => 1, p_pular => 1)`)
confere('paginação mantém o total', pag.length === 1 && Number(pag[0].total) === 4)
await q(`select restaurar_publicacao($1)`, [pub3])
confere('admin restaura publicação apagada e fica no log', (await buscar({ p_id: pub3 })).length === 1 && (await q(`select 1 from log_admin where acao = 'restaurar'`)).length === 1)
await esperaErro('não restaura o que não está apagado', () => q(`select restaurar_publicacao($1)`, [pub3]), 'não está apagada')
await q(`select excluir_publicacao($1)`, [pub3])

console.log('\nLimite anti-spam (RNF05)')
await comoUsuario(ana)
for (let i = 1; i <= 3; i++) await salvar({ titulo: `Material ${i}`, materia: MAT })
await esperaErro('6ª publicação na mesma hora é recusada', () => salvar({ titulo: 'Material 4', materia: MAT }), 'última hora')

await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`)
await esperaErro('visitante não vê o feed', () => buscar(), 'permission')
confere('visitante não lê publicações', (await q(`select * from publicacoes`)).length === 0)

console.log('\nExcluir conta (RF37)')
await comoUsuario(ana)
await q(`select excluir_minha_conta()`)
await comoSuperusuario()
confere('conta e login apagados', (await q(`select 1 from usuarios where id = $1 union all select 1 from auth.users where id = $1`, [ana])).length === 0)
await comoUsuario(bia)
;[pub] = await buscar({ p_id: pub1 })
confere('publicação continua, com autor "Usuário removido"', pub?.autor_nome === 'Usuário removido' && pub.autor_curso === null)
await comoSuperusuario()

console.log('\nCalendário vazio (RF39)')
await q(`delete from calendario_letivo where ano = 2026 and periodo = 2`)
await comoUsuario(bia)
;[p] = await q(`select * from calcular_progresso()`)
confere('sem o semestre atual: avisa calendário desatualizado', p.calendario_desatualizado === true && p.chave_periodo_atual === '2026/1', JSON.stringify(p))

console.log(`\n${ok} ok, ${falhas} falhas`)
process.exit(falhas ? 1 : 0)
