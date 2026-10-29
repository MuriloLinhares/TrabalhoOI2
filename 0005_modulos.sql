-- =====================================================================
-- HelpIF — Módulos
-- 1) Uma matéria pode estar em VÁRIOS módulos do mesmo curso: a coluna
--    curso_materias.periodo_sugerido (um número) vira "periodos" (uma
--    lista). Lista vazia = a matéria aparece em todos os módulos.
-- 2) Publicações são marcadas com os módulos a que servem ("2º módulo"),
--    no lugar das tags. As tags antigas continuam no banco.
--
-- Como rodar: DEPOIS do 0004_chat_admin.sql. Painel do Supabase >
-- SQL Editor > colar este arquivo > Run. Os dados que já existem são
-- convertidos (o período único vira uma lista com um módulo).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Matérias em vários módulos
-- ---------------------------------------------------------------------
alter table curso_materias
  add column periodos smallint[] not null default '{}'
  check (cardinality(periodos) <= 12 and 1 <= all(periodos) and 12 >= all(periodos));

update curso_materias set periodos = array[periodo_sugerido] where periodo_sugerido is not null;

alter table curso_materias drop column periodo_sugerido;

-- ---------------------------------------------------------------------
-- 2) Módulos nas publicações
-- ---------------------------------------------------------------------
alter table publicacoes
  add column modulos smallint[] not null default '{}'
  check (cardinality(modulos) <= 12 and 1 <= all(modulos) and 12 >= all(modulos));

-- Criar ou editar publicação: igual à versão do 0002, mais p_modulos.
-- p_tags continua aceito (publicações antigas), mas o site não manda mais.
drop function salvar_publicacao(text, text, bigint, tipo_material, bigint[], jsonb, bigint[], bigint);

create function salvar_publicacao(
  p_titulo         text,
  p_descricao      text,
  p_materia_id     bigint,
  p_tipo_material  tipo_material,
  p_tags           bigint[] default '{}',
  p_anexos         jsonb default '[]',
  p_remover_anexos bigint[] default '{}',
  p_id             bigint default null,
  p_modulos        smallint[] default '{}'
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_pub     publicacoes;
  v_id      bigint;
  v_tags    bigint[] := array(select distinct unnest(coalesce(p_tags, '{}')));
  v_modulos smallint[] := array(select distinct m from unnest(coalesce(p_modulos, '{}')) m order by m);
  v_anexo   jsonb;
  v_url     text;
  v_meta    jsonb;
begin
  if not exists (select 1 from usuarios where id = auth.uid() and situacao = 'ativa') then
    raise exception 'Faça login novamente.';
  end if;
  if length(trim(coalesce(p_titulo, ''))) < 3 then
    raise exception 'O título precisa ter pelo menos 3 letras.';
  end if;
  if p_materia_id is null or not exists (select 1 from materias where id = p_materia_id) then
    raise exception 'Escolha a matéria.';
  end if;
  if cardinality(v_tags) > 5 then
    raise exception 'Escolha no máximo 5 tags.';
  end if;
  if exists (select 1 from unnest(v_modulos) m where m < 1 or m > 12) then
    raise exception 'Módulo inválido.';
  end if;

  if p_id is null then
    -- RNF05: no máximo 5 publicações por hora (conta as apagadas também).
    if (select count(*) from publicacoes
        where autor_id = auth.uid() and criado_em > now() - interval '1 hour') >= 5 then
      raise exception 'Você já publicou 5 materiais na última hora. Espere um pouco para publicar de novo.';
    end if;

    insert into publicacoes (autor_id, materia_id, titulo, descricao, tipo_material, modulos)
    values (auth.uid(), p_materia_id, trim(p_titulo), trim(coalesce(p_descricao, '')), p_tipo_material, v_modulos)
    returning id into v_id;
  else
    select * into v_pub from publicacoes where id = p_id and excluido_em is null;
    if not found then
      raise exception 'Publicação não encontrada.';
    end if;
    if v_pub.autor_id is distinct from auth.uid() and not is_admin() then
      raise exception 'Você só pode editar as suas publicações.';
    end if;

    update publicacoes set
      materia_id    = p_materia_id,
      titulo        = trim(p_titulo),
      descricao     = trim(coalesce(p_descricao, '')),
      tipo_material = p_tipo_material,
      modulos       = v_modulos,
      atualizado_em = now()
    where id = p_id;
    v_id := p_id;

    delete from publicacao_tags where publicacao_id = v_id;
    delete from anexos where publicacao_id = v_id and id = any(coalesce(p_remover_anexos, '{}'));

    -- RF35: admin mexendo na publicação de outra pessoa.
    if v_pub.autor_id is distinct from auth.uid() then
      insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
      values (auth.uid(), 'update', 'publicacoes', v_id::text,
              jsonb_build_object('titulo', trim(p_titulo), 'autor_id', v_pub.autor_id));
    end if;
  end if;

  insert into publicacao_tags (publicacao_id, tag_id)
  select v_id, unnest(v_tags);

  for v_anexo in select * from jsonb_array_elements(coalesce(p_anexos, '[]'::jsonb)) loop
    if v_anexo->>'tipo' = 'link' then
      v_url := trim(coalesce(v_anexo->>'url', ''));
      if v_url !~* '^https?://[^\s]+$' or length(v_url) > 2000 then
        raise exception 'Link inválido: use um endereço que começa com http:// ou https://.';
      end if;
      insert into anexos (publicacao_id, tipo, url, nome_original)
      values (v_id, 'link', v_url, left(coalesce(nullif(trim(v_anexo->>'nome'), ''), v_url), 200));

    elsif v_anexo->>'tipo' = 'arquivo' then
      if split_part(coalesce(v_anexo->>'caminho', ''), '/', 1) <> auth.uid()::text then
        raise exception 'Anexo inválido.';
      end if;
      select metadata into v_meta from storage.objects
      where bucket_id = 'anexos' and name = v_anexo->>'caminho';
      if not found then
        raise exception 'Um dos arquivos não terminou de enviar. Tente de novo.';
      end if;
      insert into anexos (publicacao_id, tipo, caminho, nome_original, tipo_mime, tamanho)
      values (
        v_id, 'arquivo', v_anexo->>'caminho',
        left(coalesce(nullif(trim(v_anexo->>'nome'), ''), 'arquivo'), 200),
        v_meta->>'mimetype', (v_meta->>'size')::int
      );

    else
      raise exception 'Anexo inválido.';
    end if;
  end loop;

  if (select count(*) from anexos where publicacao_id = v_id) > 5 then
    raise exception 'No máximo 5 anexos por publicação.';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Feed: devolve os módulos e filtra por eles. Mesmos parâmetros da
-- versão do 0003. p_periodo (o módulo) aceita:
--   - publicação marcada com aquele módulo; ou
--   - publicação SEM módulo marcado cuja matéria está naquele módulo
--     (no curso escolhido, ou em qualquer curso se não houver curso).
-- ---------------------------------------------------------------------
drop function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, text, boolean, int, int);

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
  modulos           smallint[],
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
    p.modulos,
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
      select 1 from curso_materias cm where cm.curso_id = p_curso_id and cm.materia_id = p.materia_id
    ))
    and (p_periodo is null
      or p_periodo = any(p.modulos)
      or (cardinality(p.modulos) = 0 and exists (
        select 1 from curso_materias cm
        where cm.materia_id = p.materia_id
          and (p_curso_id is null or cm.curso_id = p_curso_id)
          and (cardinality(cm.periodos) = 0 or p_periodo = any(cm.periodos))
      )))
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
revoke execute on function salvar_publicacao(text, text, bigint, tipo_material, bigint[], jsonb, bigint[], bigint, smallint[]) from public, anon;
revoke execute on function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, text, boolean, int, int) from public, anon;
grant execute on function salvar_publicacao(text, text, bigint, tipo_material, bigint[], jsonb, bigint[], bigint, smallint[]) to authenticated;
grant execute on function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, text, boolean, int, int) to authenticated;
