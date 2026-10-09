-- =====================================================================
-- HelpIF — Fase 2 (Materiais)
-- Publicar com anexos e tags (RF13–RF15, RF40), anexos privados (RF41),
-- selo "verificado" (RF18), filtros, busca e feed do semestre
-- (RF19, RF20, RF22, RF23, RF42), limite anti-spam (RNF05) e
-- exclusão lógica (RNF07).
--
-- Como rodar: DEPOIS do 0001_base.sql. Painel do Supabase > SQL Editor >
-- colar este arquivo > Run. Ele também cria o bucket "anexos" no Storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
-- RF14
create type tipo_material as enum (
  'anotacao', 'resumo', 'prova_antiga', 'trabalho_antigo',
  'mapa_mental', 'lista_exercicios', 'link', 'outro'
);
create type tipo_anexo as enum ('arquivo', 'link');

-- ---------------------------------------------------------------------
-- RF20: busca sem diferenciar acento e maiúscula ("matematica" encontra
-- "Matemática"). Feita com translate para não depender de extensão.
-- ---------------------------------------------------------------------
create function sem_acento(p_texto text)
returns text
language sql immutable parallel safe
as $$
  select lower(translate(coalesce(p_texto, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'));
$$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table publicacoes (
  id            bigint generated always as identity primary key,
  -- RF37: se o autor excluir a conta, a publicação fica sem autor
  -- e aparece como "Usuário removido".
  autor_id      uuid references usuarios on delete set null,
  materia_id    bigint not null references materias on delete restrict,
  titulo        text not null check (length(trim(titulo)) between 3 and 150),
  descricao     text not null default '' check (length(descricao) <= 5000),
  tipo_material tipo_material not null,
  verificado    boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  excluido_em   timestamptz,                    -- RNF07: apagar é lógico
  busca         text generated always as (sem_acento(titulo || ' ' || descricao)) stored
);
create index publicacoes_feed on publicacoes (criado_em desc) where excluido_em is null;
create index publicacoes_autor on publicacoes (autor_id, criado_em);
create index publicacoes_materia on publicacoes (materia_id);

create table publicacao_tags (
  publicacao_id bigint not null references publicacoes on delete cascade,
  tag_id        bigint not null references tags on delete cascade,
  primary key (publicacao_id, tag_id)
);
create index publicacao_tags_tag on publicacao_tags (tag_id);

-- Arquivo (fica no Storage, bucket "anexos") ou link externo (RF15).
create table anexos (
  id            bigint generated always as identity primary key,
  publicacao_id bigint not null references publicacoes on delete cascade,
  tipo          tipo_anexo not null,
  url           text,      -- link externo
  caminho       text,      -- caminho do arquivo no Storage: "<id do autor>/<nome>"
  nome_original text not null check (length(trim(nome_original)) between 1 and 200),
  tipo_mime     text,
  tamanho       int,
  criado_em     timestamptz not null default now(),
  check (
    (tipo = 'link' and url is not null and caminho is null) or
    (tipo = 'arquivo' and caminho is not null and url is null)
  )
);
create index anexos_publicacao on anexos (publicacao_id);
create unique index anexos_caminho_unico on anexos (caminho) where caminho is not null;

-- ---------------------------------------------------------------------
-- Storage: bucket privado (RF41). Limite de 10 MB e só PDF, PNG, JPG,
-- DOCX e PPTX (RF15). O site também confere o conteúdo do arquivo antes
-- de enviar, não só a extensão.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos', 'anexos', false, 10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Cada aluno envia arquivos só para a própria pasta ("<id>/...").
create policy "helpif envia anexo na propria pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Baixar: só logado, só arquivo de publicação visível (ou o próprio,
-- enquanto a publicação está sendo criada). O link gerado é temporário.
create policy "helpif baixa anexo visivel" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anexos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.anexos a where a.caminho = objects.name)
    )
  );

-- Apagar: só arquivo próprio que não está em nenhuma publicação (limpeza
-- quando o envio falha no meio).
create policy "helpif apaga anexo nao usado" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.anexos a where a.caminho = objects.name)
  );

-- ---------------------------------------------------------------------
-- Criar ou editar publicação (RF13–RF15, RF23, RNF05).
-- p_id null = criar. p_anexos é uma lista JSON de anexos novos:
--   {"tipo": "link", "url": "https://...", "nome": "opcional"}
--   {"tipo": "arquivo", "caminho": "<id>/<arquivo>", "nome": "prova.pdf"}
-- O arquivo precisa já estar no Storage: tamanho e tipo vêm de lá.
-- ---------------------------------------------------------------------
create function salvar_publicacao(
  p_titulo         text,
  p_descricao      text,
  p_materia_id     bigint,
  p_tipo_material  tipo_material,
  p_tags           bigint[] default '{}',
  p_anexos         jsonb default '[]',
  p_remover_anexos bigint[] default '{}',
  p_id             bigint default null
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_pub   publicacoes;
  v_id    bigint;
  v_tags  bigint[] := array(select distinct unnest(coalesce(p_tags, '{}')));
  v_anexo jsonb;
  v_url   text;
  v_meta  jsonb;
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

  if p_id is null then
    -- RNF05: no máximo 5 publicações por hora (conta as apagadas também).
    if (select count(*) from publicacoes
        where autor_id = auth.uid() and criado_em > now() - interval '1 hour') >= 5 then
      raise exception 'Você já publicou 5 materiais na última hora. Espere um pouco para publicar de novo.';
    end if;

    insert into publicacoes (autor_id, materia_id, titulo, descricao, tipo_material)
    values (auth.uid(), p_materia_id, trim(p_titulo), trim(coalesce(p_descricao, '')), p_tipo_material)
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

-- Apagar publicação: o autor apaga as próprias, o admin qualquer uma.
-- Exclusão lógica (RNF07); exclusão feita por admin vai para o log (RF35).
create function excluir_publicacao(p_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pub publicacoes;
begin
  select * into v_pub from publicacoes where id = p_id and excluido_em is null;
  if not found then
    raise exception 'Publicação não encontrada.';
  end if;
  if v_pub.autor_id is distinct from auth.uid() and not is_admin() then
    raise exception 'Você só pode apagar as suas publicações.';
  end if;

  update publicacoes set excluido_em = now() where id = p_id;

  if is_admin() then
    insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
    values (auth.uid(), 'delete', 'publicacoes', p_id::text,
            jsonb_build_object('titulo', v_pub.titulo, 'autor_id', v_pub.autor_id));
  end if;
end;
$$;

-- RF18: selo "verificado", só admin.
create function marcar_verificado(p_id bigint, p_verificado boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_titulo text;
begin
  if not is_admin() then
    raise exception 'Só administradores podem verificar materiais.';
  end if;
  update publicacoes set verificado = p_verificado
  where id = p_id and excluido_em is null
  returning titulo into v_titulo;
  if not found then
    raise exception 'Publicação não encontrada.';
  end if;
  insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
  values (auth.uid(), case when p_verificado then 'verificar' else 'desverificar' end,
          'publicacoes', p_id::text, jsonb_build_object('titulo', v_titulo));
end;
$$;

-- ---------------------------------------------------------------------
-- Feed, filtros e busca (RF19, RF20, RF22, RF42).
-- security definer porque o aluno não lê a tabela "usuarios" dos
-- colegas (LGPD): aqui ele recebe só o nome e a sigla do curso do autor.
--
-- Curso e período filtram pela matéria: entram as matérias ligadas ao
-- curso (curso_materias) com aquele período sugerido. Matéria sem período
-- sugerido aparece em todos os períodos do curso.
-- ---------------------------------------------------------------------
create function buscar_publicacoes(
  p_curso_id   bigint default null,
  p_periodo    int default null,
  p_materia_id bigint default null,
  p_tipo       tipo_material default null,
  p_tag_id     bigint default null,
  p_busca      text default null,
  p_autor_id   uuid default null,
  p_id         bigint default null,
  p_limite     int default 20,
  p_pular      int default 0
)
returns table (
  id            bigint,
  titulo        text,
  descricao     text,
  tipo_material tipo_material,
  verificado    boolean,
  criado_em     timestamptz,
  atualizado_em timestamptz,
  autor_id      uuid,
  autor_nome    text,
  autor_curso   text,
  materia_id    bigint,
  materia_nome  text,
  tags          jsonb,
  total_anexos  int
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
    (select count(*)::int from anexos a where a.publicacao_id = p.id)
  from publicacoes p
  join materias m on m.id = p.materia_id
  left join usuarios u on u.id = p.autor_id
  left join cursos c on c.id = u.curso_id
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
  order by p.criado_em desc, p.id desc
  limit least(greatest(p_limite, 1), 50)
  offset greatest(p_pular, 0);
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function salvar_publicacao(text, text, bigint, tipo_material, bigint[], jsonb, bigint[], bigint) from public, anon;
revoke execute on function excluir_publicacao(bigint) from public, anon;
revoke execute on function marcar_verificado(bigint, boolean) from public, anon;
revoke execute on function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, int, int) from public, anon;
grant execute on function salvar_publicacao(text, text, bigint, tipo_material, bigint[], jsonb, bigint[], bigint) to authenticated;
grant execute on function excluir_publicacao(bigint) to authenticated;
grant execute on function marcar_verificado(bigint, boolean) to authenticated;
grant execute on function buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, int, int) to authenticated;

-- Escrever só pelas funções acima (elas conferem limite, dono e tags).
revoke insert, update, delete on publicacoes, publicacao_tags, anexos from anon, authenticated;

-- ---------------------------------------------------------------------
-- Regras de segurança por linha (RLS)
-- ---------------------------------------------------------------------
alter table publicacoes     enable row level security;
alter table publicacao_tags enable row level security;
alter table anexos          enable row level security;

create policy "logados leem publicacoes" on publicacoes
  for select to authenticated using (excluido_em is null);
-- As duas abaixo usam a regra de cima: publicação apagada esconde tags e anexos.
create policy "logados leem tags da publicacao" on publicacao_tags
  for select to authenticated
  using (exists (select 1 from publicacoes p where p.id = publicacao_id));
create policy "logados leem anexos" on anexos
  for select to authenticated
  using (exists (select 1 from publicacoes p where p.id = publicacao_id));
