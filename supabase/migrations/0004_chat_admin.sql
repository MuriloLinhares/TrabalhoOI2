-- =====================================================================
-- HelpIF — Fase 3, parte 2 (Chat) e painel "Todas as publicações"
-- Grupos de chat criados pelo admin (RF24, RF33), abertos a todos ou
-- restritos a um curso/período (RF25), mensagens em tempo real (RF26)
-- com nome, curso e horário (RF27), admin apaga mensagem (RF28) e
-- anti-spam de 1 mensagem a cada 2 s (RNF05).
-- Para o admin: lista de todas as publicações, inclusive apagadas, com
-- quem postou (nome e e-mail) e opção de restaurar (RF35).
--
-- Como rodar: DEPOIS do 0003_interacoes.sql. Painel do Supabase >
-- SQL Editor > colar este arquivo > Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table grupos_chat (
  id        bigint generated always as identity primary key,
  nome      text not null check (length(trim(nome)) between 2 and 60),
  descricao text not null default '' check (length(descricao) <= 200),
  -- Os dois vazios = aberto a todos. Só curso = todo o curso.
  -- Curso + período = só quem está naquele ano/semestre do curso.
  curso_id  bigint references cursos on delete cascade,
  periodo   smallint check (periodo between 1 and 12),
  ativo     boolean not null default true,     -- false = arquivado (RF33)
  criado_em timestamptz not null default now(),
  check (periodo is null or curso_id is not null)
);
create unique index grupos_chat_nome_unico on grupos_chat (lower(nome));

create table mensagens (
  id          bigint generated always as identity primary key,
  -- restrict: grupo com conversa não é apagado, é arquivado (o histórico
  -- continua para a moderação).
  grupo_id    bigint not null references grupos_chat on delete restrict,
  autor_id    uuid references usuarios on delete set null,
  texto       text not null check (length(trim(texto)) between 1 and 1000),
  criado_em   timestamptz not null default now(),
  excluido_em timestamptz                       -- RNF07: apagar é lógico
);
create index mensagens_grupo on mensagens (grupo_id, id desc) where excluido_em is null;
create index mensagens_autor on mensagens (autor_id, criado_em);

create trigger log_grupos_chat after insert or update or delete on grupos_chat
  for each row execute function registrar_log();

-- Grupo inicial.
insert into grupos_chat (nome, descricao) values
  ('Geral', 'Conversa aberta para todos os alunos do campus.');

-- ---------------------------------------------------------------------
-- Funções do chat
-- ---------------------------------------------------------------------

-- O usuário logado pode ver o grupo? Admin vê todos (inclusive
-- arquivados); aluno vê os ativos abertos a ele.
create function pode_ver_grupo(p_grupo_id bigint)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  g grupos_chat;
  u usuarios;
begin
  if is_admin() then
    return exists (select 1 from grupos_chat where id = p_grupo_id);
  end if;
  select * into g from grupos_chat where id = p_grupo_id;
  select * into u from usuarios where id = auth.uid() and situacao = 'ativa';
  if g.id is null or u.id is null or not g.ativo then
    return false;
  end if;
  if g.curso_id is null then
    return true;
  end if;
  if g.curso_id <> u.curso_id then
    return false;
  end if;
  return g.periodo is null
      or g.periodo = (select periodo_atual from calcular_progresso(u.id));
end;
$$;

-- Grupos que aparecem na aba Chat, com a hora da última mensagem.
create function listar_grupos()
returns table (
  id               bigint,
  nome             text,
  descricao        text,
  curso_sigla      text,
  periodo          smallint,
  ativo            boolean,
  ultima_mensagem  timestamptz
)
language sql stable security definer set search_path = public
as $$
  select g.id, g.nome, g.descricao, c.sigla, g.periodo, g.ativo,
         (select max(m.criado_em) from mensagens m where m.grupo_id = g.id and m.excluido_em is null)
  from grupos_chat g
  left join cursos c on c.id = g.curso_id
  where pode_ver_grupo(g.id)
  order by g.ativo desc, g.curso_id nulls first, g.periodo nulls first, g.nome;
$$;

-- Histórico (RF27). p_depois_de: só as mais novas que esse id (usado
-- quando chega aviso de mensagem nova). p_antes_de: página anterior.
create function listar_mensagens(
  p_grupo_id  bigint,
  p_depois_de bigint default null,
  p_antes_de  bigint default null,
  p_limite    int default 50
)
returns table (
  id          bigint,
  texto       text,
  criado_em   timestamptz,
  autor_id    uuid,
  autor_nome  text,
  autor_curso text
)
language sql stable security definer set search_path = public
as $$
  select * from (
    select m.id, m.texto, m.criado_em, m.autor_id,
           coalesce(u.nome, 'Usuário removido'), c.sigla
    from mensagens m
    left join usuarios u on u.id = m.autor_id
    left join cursos c on c.id = u.curso_id
    where pode_ver_grupo(p_grupo_id)
      and m.grupo_id = p_grupo_id
      and m.excluido_em is null
      and (p_depois_de is null or m.id > p_depois_de)
      and (p_antes_de is null or m.id < p_antes_de)
    order by m.id desc
    limit least(greatest(p_limite, 1), 100)
  ) ultimas
  order by id;
$$;

create function enviar_mensagem(p_grupo_id bigint, p_texto text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  u    usuarios;
  v_id bigint;
begin
  select * into u from usuarios where id = auth.uid() and situacao = 'ativa';
  if not found then
    raise exception 'Faça login novamente.';
  end if;
  if not pode_ver_grupo(p_grupo_id)
     or not exists (select 1 from grupos_chat where id = p_grupo_id and ativo) then
    raise exception 'Este grupo não está disponível para você.';
  end if;
  if u.silenciado_ate > now() then
    raise exception 'Você foi silenciado pela moderação até %.',
      to_char(u.silenciado_ate at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  end if;
  if length(trim(coalesce(p_texto, ''))) = 0 then
    raise exception 'Escreva a mensagem.';
  end if;
  if length(trim(p_texto)) > 1000 then
    raise exception 'A mensagem pode ter no máximo 1000 letras.';
  end if;
  -- RNF05: 1 mensagem a cada 2 segundos.
  if exists (select 1 from mensagens
             where autor_id = u.id and criado_em > now() - interval '2 seconds') then
    raise exception 'Calma! Espere 2 segundos entre uma mensagem e outra.';
  end if;

  insert into mensagens (grupo_id, autor_id, texto)
  values (p_grupo_id, u.id, trim(p_texto))
  returning id into v_id;
  return v_id;
end;
$$;

-- RF28: o autor apaga as próprias; o admin apaga qualquer uma (vai para o log).
create function excluir_mensagem(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_msg mensagens;
begin
  select * into v_msg from mensagens where id = p_id and excluido_em is null;
  if not found or not pode_ver_grupo(v_msg.grupo_id) then
    raise exception 'Mensagem não encontrada.';
  end if;
  if v_msg.autor_id is distinct from auth.uid() and not is_admin() then
    raise exception 'Você só pode apagar as suas mensagens.';
  end if;

  update mensagens set excluido_em = now() where id = p_id;

  if is_admin() then
    insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
    values (auth.uid(), 'delete', 'mensagens', p_id::text,
            jsonb_build_object('texto', left(v_msg.texto, 80), 'autor_id', v_msg.autor_id,
                               'grupo_id', v_msg.grupo_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Painel do admin: todas as publicações, com quem postou.
-- p_situacao: 'todas', 'ativas' ou 'apagadas'. p_autor procura no nome
-- e no e-mail. "total" é o número de linhas sem a paginação.
-- ---------------------------------------------------------------------
create function admin_listar_publicacoes(
  p_busca    text default null,
  p_autor    text default null,
  p_situacao text default 'todas',
  p_limite   int default 25,
  p_pular    int default 0
)
returns table (
  id                bigint,
  titulo            text,
  tipo_material     tipo_material,
  verificado        boolean,
  criado_em         timestamptz,
  excluido_em       timestamptz,
  materia_nome      text,
  autor_id          uuid,
  autor_nome        text,
  autor_email       text,
  autor_curso       text,
  total_anexos      int,
  total_curtidas    int,
  total_comentarios int,
  total             bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Só administradores podem ver esta lista.';
  end if;
  return query
    select p.id, p.titulo, p.tipo_material, p.verificado, p.criado_em, p.excluido_em,
           m.nome, p.autor_id, coalesce(u.nome, 'Usuário removido'), u.email, c.sigla,
           (select count(*)::int from anexos a where a.publicacao_id = p.id),
           (select count(*)::int from curtidas cu where cu.publicacao_id = p.id),
           (select count(*)::int from comentarios co where co.publicacao_id = p.id and co.excluido_em is null),
           count(*) over ()
    from publicacoes p
    join materias m on m.id = p.materia_id
    left join usuarios u on u.id = p.autor_id
    left join cursos c on c.id = u.curso_id
    where (p_situacao <> 'ativas' or p.excluido_em is null)
      and (p_situacao <> 'apagadas' or p.excluido_em is not null)
      and (p_busca is null or not exists (
        select 1 from regexp_split_to_table(sem_acento(p_busca), '\s+') palavra
        where palavra <> '' and strpos(p.busca, palavra) = 0
      ))
      and (p_autor is null
           or strpos(sem_acento(coalesce(u.nome, 'Usuário removido') || ' ' || coalesce(u.email, '')),
                     sem_acento(trim(p_autor))) > 0)
    order by p.criado_em desc, p.id desc
    limit least(greatest(p_limite, 1), 100)
    offset greatest(p_pular, 0);
end;
$$;

-- Desfaz uma exclusão (do autor ou de um admin). Fica no log.
create function restaurar_publicacao(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_titulo text;
begin
  if not is_admin() then
    raise exception 'Só administradores podem restaurar publicações.';
  end if;
  update publicacoes set excluido_em = null
  where id = p_id and excluido_em is not null
  returning titulo into v_titulo;
  if not found then
    raise exception 'Publicação não encontrada ou não está apagada.';
  end if;
  insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
  values (auth.uid(), 'restaurar', 'publicacoes', p_id::text, jsonb_build_object('titulo', v_titulo));
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function pode_ver_grupo(bigint) from public, anon;
revoke execute on function listar_grupos() from public, anon;
revoke execute on function listar_mensagens(bigint, bigint, bigint, int) from public, anon;
revoke execute on function enviar_mensagem(bigint, text) from public, anon;
revoke execute on function excluir_mensagem(bigint) from public, anon;
revoke execute on function admin_listar_publicacoes(text, text, text, int, int) from public, anon;
revoke execute on function restaurar_publicacao(bigint) from public, anon;
-- pode_ver_grupo é usada pelas regras de RLS, então "authenticated" precisa dela.
grant execute on function pode_ver_grupo(bigint) to authenticated;
grant execute on function listar_grupos() to authenticated;
grant execute on function listar_mensagens(bigint, bigint, bigint, int) to authenticated;
grant execute on function enviar_mensagem(bigint, text) to authenticated;
grant execute on function excluir_mensagem(bigint) to authenticated;
grant execute on function admin_listar_publicacoes(text, text, text, int, int) to authenticated;
grant execute on function restaurar_publicacao(bigint) to authenticated;

-- Mensagens só pelas funções acima; grupos só pelo admin (regra abaixo).
revoke insert, update, delete on mensagens from anon, authenticated;

-- ---------------------------------------------------------------------
-- Regras de segurança por linha (RLS)
-- ---------------------------------------------------------------------
alter table grupos_chat enable row level security;
alter table mensagens   enable row level security;

create policy "ver grupos permitidos" on grupos_chat
  for select to authenticated using (pode_ver_grupo(id));
create policy "admin altera grupos" on grupos_chat
  for all to authenticated using (is_admin()) with check (is_admin());

-- Esta regra também decide quem recebe o aviso em tempo real.
create policy "ver mensagens dos grupos permitidos" on mensagens
  for select to authenticated using (excluido_em is null and pode_ver_grupo(grupo_id));

-- ---------------------------------------------------------------------
-- Tempo real (RF26): o Supabase avisa o site quando entra mensagem.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table mensagens;
  end if;
end;
$$;
