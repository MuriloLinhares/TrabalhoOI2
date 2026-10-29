-- =====================================================================
-- HelpIF — Banimento de contas (RF31)
-- O admin bane quem publica conteúdo maldoso ou antiético: a conta fica
-- "bloqueada", o login é recusado pelo próprio Supabase Auth e, se o admin
-- quiser, tudo o que a pessoa postou some (exclusão lógica, RNF07).
-- Desbanir devolve o acesso (o que foi apagado pode ser restaurado na aba
-- Publicações). Tudo vai para o registro de ações (RF35).
--
-- Como rodar: DEPOIS do 0005_modulos.sql. Painel do Supabase >
-- SQL Editor > colar este arquivo > Run.
-- =====================================================================

alter table usuarios
  add column bloqueado_em    timestamptz,
  add column bloqueado_por   uuid references usuarios on delete set null,
  add column motivo_bloqueio text check (length(motivo_bloqueio) <= 500);

-- ---------------------------------------------------------------------
-- Banir. p_apagar_tudo também apaga (exclusão lógica) as publicações,
-- comentários e mensagens da pessoa. Admin não pode ser banido: primeiro
-- tire o perfil de admin dele no SQL Editor.
-- ---------------------------------------------------------------------
create function banir_usuario(p_usuario uuid, p_motivo text, p_apagar_tudo boolean default false)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  u              usuarios;
  v_publicacoes  int := 0;
  v_comentarios  int := 0;
  v_mensagens    int := 0;
begin
  if not is_admin() then
    raise exception 'Só administradores podem banir contas.';
  end if;
  select * into u from usuarios where id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if u.id = auth.uid() then
    raise exception 'Você não pode banir a sua própria conta.';
  end if;
  if u.perfil = 'admin' then
    raise exception 'Não dá para banir um administrador.';
  end if;
  if u.situacao = 'bloqueada' then
    raise exception 'Esta conta já está banida.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escreva o motivo do banimento (pelo menos 5 letras).';
  end if;

  update usuarios set
    situacao        = 'bloqueada',
    bloqueado_em    = now(),
    bloqueado_por   = auth.uid(),
    motivo_bloqueio = left(trim(p_motivo), 500),
    silenciado_ate  = null
  where id = u.id;

  -- O Supabase Auth recusa o login de quem tem banned_until no futuro
  -- (100 anos = até um admin desbanir).
  update auth.users set banned_until = now() + interval '100 years' where id = u.id;

  if p_apagar_tudo then
    update publicacoes set excluido_em = now() where autor_id = u.id and excluido_em is null;
    get diagnostics v_publicacoes = row_count;
    update comentarios set excluido_em = now() where autor_id = u.id and excluido_em is null;
    get diagnostics v_comentarios = row_count;
    update mensagens set excluido_em = now() where autor_id = u.id and excluido_em is null;
    get diagnostics v_mensagens = row_count;
  end if;

  insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
  values (auth.uid(), 'banir', 'usuarios', u.id::text, jsonb_build_object(
    'nome', u.nome, 'email', u.email, 'motivo', trim(p_motivo),
    'publicacoes_apagadas', v_publicacoes, 'comentarios_apagados', v_comentarios,
    'mensagens_apagadas', v_mensagens));
end;
$$;

create function desbanir_usuario(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare
  u usuarios;
begin
  if not is_admin() then
    raise exception 'Só administradores podem desbanir contas.';
  end if;
  select * into u from usuarios where id = p_usuario;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;
  if u.situacao <> 'bloqueada' then
    raise exception 'Esta conta não está banida.';
  end if;

  update usuarios set situacao = 'ativa', bloqueado_em = null, bloqueado_por = null, motivo_bloqueio = null
  where id = u.id;
  update auth.users set banned_until = null where id = u.id;

  insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
  values (auth.uid(), 'desbanir', 'usuarios', u.id::text,
          jsonb_build_object('nome', u.nome, 'email', u.email, 'motivo_anterior', u.motivo_bloqueio));
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de contas para o painel (RF30): nome, e-mail, curso, situação e
-- quanto a pessoa já publicou.
-- ---------------------------------------------------------------------
create function admin_listar_contas(p_busca text default null, p_situacao text default 'todas')
returns table (
  id               uuid,
  nome             text,
  email            text,
  perfil           perfil_usuario,
  curso_sigla      text,
  situacao         situacao_usuario,
  criado_em        timestamptz,
  bloqueado_em     timestamptz,
  motivo_bloqueio  text,
  bloqueado_por    text,
  total_publicacoes int,
  total_apagadas   int
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Só administradores podem ver esta lista.';
  end if;
  return query
    select u.id, u.nome, u.email, u.perfil, c.sigla, u.situacao, u.criado_em,
           u.bloqueado_em, u.motivo_bloqueio, b.nome,
           (select count(*)::int from publicacoes p where p.autor_id = u.id and p.excluido_em is null),
           (select count(*)::int from publicacoes p where p.autor_id = u.id and p.excluido_em is not null)
    from usuarios u
    left join cursos c on c.id = u.curso_id
    left join usuarios b on b.id = u.bloqueado_por
    where (p_situacao = 'todas' or u.situacao::text = p_situacao)
      and (p_busca is null
           or strpos(sem_acento(u.nome || ' ' || u.email), sem_acento(trim(p_busca))) > 0)
    order by u.situacao desc, u.nome;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function banir_usuario(uuid, text, boolean) from public, anon;
revoke execute on function desbanir_usuario(uuid) from public, anon;
revoke execute on function admin_listar_contas(text, text) from public, anon;
grant execute on function banir_usuario(uuid, text, boolean) to authenticated;
grant execute on function desbanir_usuario(uuid) to authenticated;
grant execute on function admin_listar_contas(text, text) to authenticated;
