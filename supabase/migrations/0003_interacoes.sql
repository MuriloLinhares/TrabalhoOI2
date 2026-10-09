-- =====================================================================
-- HelpIF — Fase 3, parte 1 (Interações nas publicações)
-- Curtir ("útil"), comentar e salvar nos favoritos (RF16) e ordenar o
-- feed por mais recentes, mais úteis e mais comentados (RF21).
--
-- Como rodar: DEPOIS do 0002_materiais.sql. Painel do Supabase >
-- SQL Editor > colar este arquivo > Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
-- Ao excluir a conta (RF37), curtidas e favoritos vão junto; os
-- comentários ficam, com o autor "Usuário removido".
create table curtidas (
  usuario_id    uuid not null references usuarios on delete cascade,
  publicacao_id bigint not null references publicacoes on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (usuario_id, publicacao_id)
);
create index curtidas_publicacao on curtidas (publicacao_id);

create table favoritos (
  usuario_id    uuid not null references usuarios on delete cascade,
  publicacao_id bigint not null references publicacoes on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (usuario_id, publicacao_id)
);
create index favoritos_publicacao on favoritos (publicacao_id);

create table comentarios (
  id            bigint generated always as identity primary key,
  publicacao_id bigint not null references publicacoes on delete cascade,
  autor_id      uuid references usuarios on delete set null,
  texto         text not null check (length(trim(texto)) between 1 and 2000),
  criado_em     timestamptz not null default now(),
  excluido_em   timestamptz                     -- RNF07: apagar é lógico
);
create index comentarios_publicacao on comentarios (publicacao_id, criado_em) where excluido_em is null;
create index comentarios_autor on comentarios (autor_id, criado_em);

-- ---------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------

-- Confere se quem chama está ativo e se a publicação está visível.
create function conferir_publicacao_visivel(p_publicacao_id bigint)
returns publicacoes
language plpgsql stable security definer set search_path = public
as $$
declare
  v_pub publicacoes;
begin
  if not exists (select 1 from usuarios where id = auth.uid() and situacao = 'ativa') then
    raise exception 'Faça login novamente.';
  end if;
  select * into v_pub from publicacoes where id = p_publicacao_id and excluido_em is null;
  if not found then
    raise exception 'Publicação não encontrada.';
  end if;
  return v_pub;
end;
$$;

-- Marcar ou desmarcar como "útil". Não vale curtir o próprio material
-- (a contagem vira ranking no futuro).
create function curtir(p_publicacao_id bigint, p_curtir boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pub publicacoes := conferir_publicacao_visivel(p_publicacao_id);
begin
  if p_curtir then
    if v_pub.autor_id = auth.uid() then
      raise exception 'Você não pode marcar o seu próprio material como útil.';
    end if;
    insert into curtidas (usuario_id, publicacao_id) values (auth.uid(), p_publicacao_id)
    on conflict do nothing;
  else
    delete from curtidas where usuario_id = auth.uid() and publicacao_id = p_publicacao_id;
  end if;
end;
$$;

create function favoritar(p_publicacao_id bigint, p_favoritar boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform conferir_publicacao_visivel(p_publicacao_id);
  if p_favoritar then
    insert into favoritos (usuario_id, publicacao_id) values (auth.uid(), p_publicacao_id)
    on conflict do nothing;
  else
    delete from favoritos where usuario_id = auth.uid() and publicacao_id = p_publicacao_id;
  end if;
end;
$$;

-- Comentar. Anti-spam no mesmo espírito do RNF05: um comentário a cada
-- 5 segundos por usuário.
create function comentar(p_publicacao_id bigint, p_texto text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  perform conferir_publicacao_visivel(p_publicacao_id);
  if length(trim(coalesce(p_texto, ''))) = 0 then
    raise exception 'Escreva o comentário.';
  end if;
  if length(trim(p_texto)) > 2000 then
    raise exception 'O comentário pode ter no máximo 2000 letras.';
  end if;
  if exists (select 1 from comentarios
             where autor_id = auth.uid() and criado_em > now() - interval '5 seconds') then
    raise exception 'Espere alguns segundos antes de comentar de novo.';
  end if;

  insert into comentarios (publicacao_id, autor_id, texto)
  values (p_publicacao_id, auth.uid(), trim(p_texto))
  returning id into v_id;
  return v_id;
end;
$$;

-- Apagar comentário: o autor apaga os próprios, o admin qualquer um
-- (exclusão feita por admin vai para o log, RF35).
create function excluir_comentario(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_com comentarios;
begin
  select * into v_com from comentarios where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Comentário não encontrado.';
  end if;
  if v_com.autor_id is distinct from auth.uid() and not is_admin() then
    raise exception 'Você só pode apagar os seus comentários.';
  end if;

  update comentarios set excluido_em = now() where id = p_id;

  if is_admin() then
    insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
    values (auth.uid(), 'delete', 'comentarios', p_id::text,
            jsonb_build_object('texto', left(v_com.texto, 80), 'autor_id', v_com.autor_id,
                               'publicacao_id', v_com.publicacao_id));
  end if;
end;
$$;

-- Comentários de uma publicação, com nome e curso de quem escreveu
-- (o aluno não lê a tabela "usuarios" dos colegas).
create function listar_comentarios(p_publicacao_id bigint)
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
  select co.id, co.texto, co.criado_em, co.autor_id,
         coalesce(u.nome, 'Usuário removido'), c.sigla
  from comentarios co
  join publicacoes p on p.id = co.publicacao_id and p.excluido_em is null
  left join usuarios u on u.id = co.autor_id
  left join cursos c on c.id = u.curso_id
  where auth.uid() is not null
    and co.publicacao_id = p_publicacao_id
    and co.excluido_em is null
  order by co.criado_em, co.id;
$$;

-- ---------------------------------------------------------------------
-- Feed com contagens e ordenação (RF21). Substitui a versão da Fase 2:
-- ganha p_ordem ('recentes', 'uteis', 'comentados') e p_favoritos
-- (só os favoritos de quem chama).
-- ---------------------------------------------------------------------
drop function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, int, int);

create function buscar_publicacoes(
  p_curso_id   bigint default null,
  p_periodo    int default null,
  p_materia_id bigint default null,
  p_tipo       tipo_material default null,
  p_tag_id     bigint default null,
  p_busca      text default null,
  p_autor_id   uuid default null,
  p_id         bigint default null,
  p_ordem      text default 'recentes',
  p_favoritos  boolean default false,
  p_limite     int default 20,
  p_pular      int default 0
)
returns table (
  id                bigint,
  titulo            text,
  descricao         text,
  tipo_material     tipo_material,
  verificado        boolean,
  criado_em         timestamptz,
  atualizado_em     timestamptz,
  autor_id          uuid,
  autor_nome        text,
  autor_curso       text,
  materia_id        bigint,
  materia_nome      text,
  tags              jsonb,
  total_anexos      int,
  total_curtidas    int,
  total_comentarios int,
  curtiu            boolean,
  favoritou         boolean
)
language sql stable security definer set search_path = public
as $$
  select
    p.id, p.titulo, p.descricao, p.tipo_material, p.verificado, p.criado_em, p.atualizado_em,
    p.autor_id, coalesce(u.nome, 'Usuário removido'), c.sigla,
    m.id, m.nome,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome) order by t.nome)
      from publicacao_tags pt join tags t on t.id = pt.tag_id
      where pt.publicacao_id = p.id
    ), '[]'::jsonb),
    (select count(*)::int from anexos a where a.publicacao_id = p.id),
    n.curtidas,
    n.comentarios,
    exists (select 1 from curtidas cu where cu.publicacao_id = p.id and cu.usuario_id = auth.uid()),
    exists (select 1 from favoritos f where f.publicacao_id = p.id and f.usuario_id = auth.uid())
  from publicacoes p
  join materias m on m.id = p.materia_id
  left join usuarios u on u.id = p.autor_id
  left join cursos c on c.id = u.curso_id
  cross join lateral (
    select
      (select count(*)::int from curtidas cu where cu.publicacao_id = p.id) as curtidas,
      (select count(*)::int from comentarios co
       where co.publicacao_id = p.id and co.excluido_em is null) as comentarios
  ) n
  where auth.uid() is not null
    and p.excluido_em is null
    and (p_id is null or p.id = p_id)
    and (p_autor_id is null or p.autor_id = p_autor_id)
    and (p_materia_id is null or p.materia_id = p_materia_id)
    and (p_tipo is null or p.tipo_material = p_tipo)
    and (p_tag_id is null or exists (
      select 1 from publicacao_tags pt where pt.publicacao_id = p.id and pt.tag_id = p_tag_id
    ))
    and (p_curso_id is null or exists (
      select 1 from curso_materias cm
      where cm.curso_id = p_curso_id
        and cm.materia_id = p.materia_id
        and (p_periodo is null or cm.periodo_sugerido is null or cm.periodo_sugerido = p_periodo)
    ))
    -- Todas as palavras digitadas precisam aparecer no título ou na descrição.
    and (p_busca is null or not exists (
      select 1 from regexp_split_to_table(sem_acento(p_busca), '\s+') palavra
      where palavra <> '' and strpos(p.busca, palavra) = 0
    ))
    and (not coalesce(p_favoritos, false) or exists (
      select 1 from favoritos f where f.publicacao_id = p.id and f.usuario_id = auth.uid()
    ))
  order by
    case p_ordem
      when 'uteis' then n.curtidas
      when 'comentados' then n.comentarios
      else 0
    end desc,
    p.criado_em desc,
    p.id desc
  limit least(greatest(p_limite, 1), 50)
  offset greatest(p_pular, 0);
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function conferir_publicacao_visivel(bigint) from public, anon, authenticated;
revoke execute on function curtir(bigint, boolean) from public, anon;
revoke execute on function favoritar(bigint, boolean) from public, anon;
revoke execute on function comentar(bigint, text) from public, anon;
revoke execute on function excluir_comentario(bigint) from public, anon;
revoke execute on function listar_comentarios(bigint) from public, anon;
revoke execute on function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, text, boolean, int, int) from public, anon;
grant execute on function curtir(bigint, boolean) to authenticated;
grant execute on function favoritar(bigint, boolean) to authenticated;
grant execute on function comentar(bigint, text) to authenticated;
grant execute on function excluir_comentario(bigint) to authenticated;
grant execute on function listar_comentarios(bigint) to authenticated;
grant execute on function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, text, boolean, int, int) to authenticated;

-- Escrever só pelas funções acima.
revoke insert, update, delete on curtidas, favoritos, comentarios from anon, authenticated;

-- ---------------------------------------------------------------------
-- Regras de segurança por linha (RLS)
-- ---------------------------------------------------------------------
alter table curtidas    enable row level security;
alter table favoritos   enable row level security;
alter table comentarios enable row level security;

-- Cada um vê só as próprias curtidas e favoritos; as contagens vêm do feed.
create policy "ver as proprias curtidas" on curtidas
  for select to authenticated using (usuario_id = auth.uid());
create policy "ver os proprios favoritos" on favoritos
  for select to authenticated using (usuario_id = auth.uid());
create policy "logados leem comentarios visiveis" on comentarios
  for select to authenticated
  using (excluido_em is null and exists (select 1 from publicacoes p where p.id = publicacao_id));
