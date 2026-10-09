-- =====================================================================
-- HelpIF — Fase 1 (Base)
-- Cadastro e login (RF01–RF06, RF36–RF38), progresso de semestre
-- (RF07–RF12, RF39) e cadastros do admin: cursos, matérias, tags e
-- calendário (RF29), com registro de ações (RF35).
--
-- Como rodar: Painel do Supabase > SQL Editor > colar este arquivo > Run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type perfil_usuario as enum ('aluno', 'admin');
create type situacao_usuario as enum ('ativa', 'bloqueada');
create type tipo_periodo as enum ('anual', 'semestral');

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table cursos (
  id               bigint generated always as identity primary key,
  nome             text not null check (length(trim(nome)) between 2 and 120),
  sigla            text not null check (length(trim(sigla)) between 2 and 12),
  tipo_periodo     tipo_periodo not null,
  duracao_periodos smallint not null check (duracao_periodos between 1 and 12),
  criado_em        timestamptz not null default now()
);
create unique index cursos_nome_unico on cursos (lower(nome));
create unique index cursos_sigla_unica on cursos (lower(sigla));

-- Cada linha é um semestre letivo (periodo 1 ou 2). Cursos anuais usam
-- o ano: um ano conta como iniciado quando o 1º semestre dele começa.
create table calendario_letivo (
  id          bigint generated always as identity primary key,
  ano         smallint not null check (ano between 2000 and 2100),
  periodo     smallint not null check (periodo in (1, 2)),
  data_inicio date not null,
  data_fim    date not null,
  unique (ano, periodo),
  check (data_fim > data_inicio)
);

create table materias (
  id      bigint generated always as identity primary key,
  nome    text not null check (length(trim(nome)) between 2 and 120),
  tecnica boolean not null default false
);
create unique index materias_nome_unico on materias (lower(nome));

-- Uma matéria pode estar em vários cursos (ex.: Português).
create table curso_materias (
  curso_id         bigint not null references cursos on delete cascade,
  materia_id       bigint not null references materias on delete cascade,
  periodo_sugerido smallint check (periodo_sugerido between 1 and 12),
  primary key (curso_id, materia_id)
);

create table tags (
  id   bigint generated always as identity primary key,
  nome text not null check (length(trim(nome)) between 2 and 40)
);
create unique index tags_nome_unico on tags (lower(nome));

-- A senha não fica aqui: o Supabase Auth guarda o hash em auth.users.
create table usuarios (
  id                         uuid primary key references auth.users on delete cascade,
  nome                       text not null check (length(trim(nome)) between 3 and 100),
  email                      text not null unique,
  perfil                     perfil_usuario not null default 'aluno',
  curso_id                   bigint not null references cursos on delete restrict,
  ano_ingresso               smallint not null check (ano_ingresso between 2000 and 2100),
  periodo_ingresso           smallint not null default 1 check (periodo_ingresso in (1, 2)),
  ajuste_periodo             smallint not null default 0 check (ajuste_periodo between -12 and 12),
  ultima_confirmacao_periodo text,
  situacao                   situacao_usuario not null default 'ativa',
  silenciado_ate             timestamptz,
  foto_url                   text,
  aceite_termos_em           timestamptz not null,
  criado_em                  timestamptz not null default now()
);

create table log_admin (
  id        bigint generated always as identity primary key,
  admin_id  uuid references usuarios on delete set null,
  acao      text not null,
  tipo_alvo text not null,
  alvo_id   text,
  detalhes  jsonb,
  data      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------

-- security definer: roda com permissão do dono, então pode ler
-- "usuarios" de dentro das regras de segurança sem entrar em loop.
create function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and perfil = 'admin' and situacao = 'ativa'
  );
$$;

-- Semestre letivo que já começou mais recentemente (ou null se o
-- calendário estiver vazio).
create function semestre_vigente()
returns calendario_letivo
language sql stable set search_path = public
as $$
  select * from calendario_letivo
  where data_inicio <= current_date
  order by data_inicio desc
  limit 1;
$$;

-- Chave do período atual usada no aviso "Você está no Xº semestre?"
-- (RF10): '2026/2' para cursos semestrais, '2026' para anuais.
create function chave_periodo(p_tipo tipo_periodo)
returns text
language sql stable set search_path = public
as $$
  select case
    when s.id is null then null
    when p_tipo = 'anual' then s.ano::text
    else s.ano || '/' || s.periodo
  end
  from (select (semestre_vigente()).*) s;
$$;

-- Períodos letivos já iniciados desde o ingresso, sem o ajuste (RF09).
create function periodos_iniciados(
  p_tipo tipo_periodo, p_ano_ingresso smallint, p_periodo_ingresso smallint
)
returns int
language sql stable set search_path = public
as $$
  select case
    when p_tipo = 'semestral' then (
      select count(*)::int from calendario_letivo c
      where c.data_inicio <= current_date
        and (c.ano, c.periodo) >= (p_ano_ingresso, p_periodo_ingresso)
    )
    else (
      select count(distinct c.ano)::int from calendario_letivo c
      where c.data_inicio <= current_date
        and c.ano >= p_ano_ingresso
    )
  end;
$$;

-- ---------------------------------------------------------------------
-- Cadastro: cria a linha em "usuarios" quando o Supabase Auth cria a
-- conta. Os dados vêm do "options.data" do signUp no front-end.
-- ---------------------------------------------------------------------
create function criar_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  meta          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_curso       cursos;
  v_ano         smallint;
  v_periodo     smallint;
begin
  -- RF02: só e-mail institucional de aluno.
  if split_part(lower(new.email), '@', 2) <> 'aluno.ifsc.edu.br' then
    raise exception 'Use seu e-mail institucional (@aluno.ifsc.edu.br).';
  end if;

  -- RF06: aceite dos termos.
  if coalesce((meta->>'aceite_termos')::boolean, false) is not true then
    raise exception 'É preciso aceitar os termos de uso e a política de privacidade.';
  end if;

  select * into v_curso from cursos where id = (meta->>'curso_id')::bigint;
  if not found then
    raise exception 'Curso inválido.';
  end if;

  v_ano := (meta->>'ano_ingresso')::smallint;
  if v_ano is null or v_ano < 2000 or v_ano > extract(year from current_date) + 1 then
    raise exception 'Ano de ingresso inválido.';
  end if;

  -- Curso anual não tem semestre de ingresso.
  v_periodo := case
    when v_curso.tipo_periodo = 'anual' then 1
    else coalesce((meta->>'periodo_ingresso')::smallint, 1)
  end;

  insert into usuarios (
    id, nome, email, curso_id, ano_ingresso, periodo_ingresso,
    aceite_termos_em, ultima_confirmacao_periodo
  ) values (
    new.id, trim(meta->>'nome'), lower(new.email), v_curso.id, v_ano, v_periodo,
    now(),
    -- Quem acabou de se cadastrar já informou o período: não pergunta de novo.
    chave_periodo(v_curso.tipo_periodo)
  );
  return new;
end;
$$;

create trigger ao_criar_conta
  after insert on auth.users
  for each row execute function criar_usuario();

-- ---------------------------------------------------------------------
-- Progresso do curso (RF09–RF12, RF39). O período atual NÃO é gravado:
-- é calculado aqui toda vez.
-- ---------------------------------------------------------------------
create function calcular_progresso(p_usuario uuid default auth.uid())
returns table (
  periodo_atual            int,
  duracao                  int,
  tipo                     tipo_periodo,
  egresso                  boolean,
  chave_periodo_atual      text,
  precisa_confirmar        boolean,
  calendario_desatualizado boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  u         usuarios;
  c         cursos;
  iniciados int;
  bruto     int;
  chave     text;
begin
  if p_usuario is distinct from auth.uid() and not is_admin() then
    raise exception 'Sem permissão.';
  end if;

  select * into u from usuarios where id = p_usuario;
  if not found then
    return;
  end if;
  select * into c from cursos where id = u.curso_id;

  iniciados := periodos_iniciados(c.tipo_periodo, u.ano_ingresso, u.periodo_ingresso);
  bruto     := iniciados + u.ajuste_periodo;
  chave     := chave_periodo(c.tipo_periodo);

  periodo_atual            := least(greatest(bruto, 1), c.duracao_periodos);
  duracao                  := c.duracao_periodos;
  tipo                     := c.tipo_periodo;
  egresso                  := bruto > c.duracao_periodos;   -- RF12
  chave_periodo_atual      := chave;
  precisa_confirmar        := chave is not null
                              and not (bruto > c.duracao_periodos)
                              and u.ultima_confirmacao_periodo is distinct from chave;
  -- RF39: nenhum semestre cadastrado cobre a data de hoje.
  calendario_desatualizado := not exists (
    select 1 from calendario_letivo where current_date between data_inicio and data_fim
  );
  return next;
end;
$$;

-- RF10: o aluno confirma o período ou informa o correto (reprovou,
-- trancou). Passar null confirma o valor calculado.
create function confirmar_periodo(p_periodo_informado int default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  u         usuarios;
  c         cursos;
  iniciados int;
begin
  select * into u from usuarios where id = auth.uid();
  if not found then
    raise exception 'Faça login novamente.';
  end if;
  select * into c from cursos where id = u.curso_id;

  if p_periodo_informado is not null then
    if p_periodo_informado < 1 or p_periodo_informado > c.duracao_periodos then
      raise exception 'Período deve estar entre 1 e %.', c.duracao_periodos;
    end if;
    iniciados := periodos_iniciados(c.tipo_periodo, u.ano_ingresso, u.periodo_ingresso);
    update usuarios set ajuste_periodo = p_periodo_informado - iniciados where id = u.id;
  end if;

  update usuarios
  set ultima_confirmacao_periodo = chave_periodo(c.tipo_periodo)
  where id = u.id;
end;
$$;

-- RF37: excluir a própria conta. Apaga o login; a linha de "usuarios"
-- vai junto (on delete cascade).
create function excluir_minha_conta()
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login novamente.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- RF35: toda alteração nas tabelas do admin fica registrada.
-- ---------------------------------------------------------------------
create function registrar_log()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  linha jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into log_admin (admin_id, acao, tipo_alvo, alvo_id, detalhes)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(linha->>'id', linha->>'materia_id'),
    linha
  );
  return null;
end;
$$;

create trigger log_cursos after insert or update or delete on cursos
  for each row execute function registrar_log();
create trigger log_materias after insert or update or delete on materias
  for each row execute function registrar_log();
create trigger log_curso_materias after insert or update or delete on curso_materias
  for each row execute function registrar_log();
create trigger log_tags after insert or update or delete on tags
  for each row execute function registrar_log();
create trigger log_calendario after insert or update or delete on calendario_letivo
  for each row execute function registrar_log();

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------

-- Funções internas não podem ser chamadas pelo site.
revoke execute on function criar_usuario() from public, anon, authenticated;
revoke execute on function registrar_log() from public, anon, authenticated;
revoke execute on function calcular_progresso(uuid) from public, anon;
revoke execute on function confirmar_periodo(int) from public, anon;
revoke execute on function excluir_minha_conta() from public, anon;
grant execute on function calcular_progresso(uuid) to authenticated;
grant execute on function confirmar_periodo(int) to authenticated;
grant execute on function excluir_minha_conta() to authenticated;

-- O aluno só pode mudar o próprio nome e foto direto na tabela. Perfil,
-- curso, situação e ajuste mudam só por funções acima ou pelo admin.
revoke insert, update, delete on usuarios from anon, authenticated;
grant update (nome, foto_url) on usuarios to authenticated;

-- log_admin é só leitura para o site; quem escreve é o trigger.
revoke insert, update, delete on log_admin from anon, authenticated;

-- ---------------------------------------------------------------------
-- Regras de segurança por linha (RLS). Sem regra, a tabela fica fechada.
-- ---------------------------------------------------------------------
alter table cursos            enable row level security;
alter table calendario_letivo enable row level security;
alter table materias          enable row level security;
alter table curso_materias    enable row level security;
alter table tags              enable row level security;
alter table usuarios          enable row level security;
alter table log_admin         enable row level security;

-- Cursos aparecem no formulário de cadastro, antes do login.
create policy "todos leem cursos" on cursos
  for select to anon, authenticated using (true);
create policy "logados leem calendario" on calendario_letivo
  for select to authenticated using (true);
create policy "logados leem materias" on materias
  for select to authenticated using (true);
create policy "logados leem curso_materias" on curso_materias
  for select to authenticated using (true);
create policy "logados leem tags" on tags
  for select to authenticated using (true);

create policy "admin altera cursos" on cursos
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin altera calendario" on calendario_letivo
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin altera materias" on materias
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin altera curso_materias" on curso_materias
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin altera tags" on tags
  for all to authenticated using (is_admin()) with check (is_admin());

-- Lista de contas só para admin; o aluno vê a própria linha (LGPD).
create policy "ver a propria conta ou admin" on usuarios
  for select to authenticated using (id = auth.uid() or is_admin());
create policy "editar a propria conta" on usuarios
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "admin le o log" on log_admin
  for select to authenticated using (is_admin());
