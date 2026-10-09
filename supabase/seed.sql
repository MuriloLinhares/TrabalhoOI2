-- =====================================================================
-- HelpIF — dados iniciais
-- ATENÇÃO: os cursos, matérias e datas abaixo são EXEMPLOS para testar.
-- Troque pelos dados reais do campus (tarefa da seção 10 do planejamento).
--
-- Como rodar: SQL Editor do Supabase, depois de rodar 0001_base.sql.
-- =====================================================================

insert into cursos (nome, sigla, tipo_periodo, duracao_periodos) values
  ('Técnico Integrado em Informática (EXEMPLO)', 'INFO', 'anual', 4),
  ('Técnico Subsequente em Eletroeletrônica (EXEMPLO)', 'ELETRO', 'semestral', 4);

-- Calendário letivo (EXEMPLO de datas).
insert into calendario_letivo (ano, periodo, data_inicio, data_fim) values
  (2025, 1, '2025-02-10', '2025-07-04'),
  (2025, 2, '2025-07-28', '2025-12-19'),
  (2026, 1, '2026-02-09', '2026-07-03'),
  (2026, 2, '2026-07-27', '2026-12-18');

insert into materias (nome, tecnica) values
  ('Matemática', false),
  ('Língua Portuguesa', false),
  ('Física', false),
  ('Lógica de Programação', true),
  ('Banco de Dados', true),
  ('Eletrônica Analógica', true);

insert into curso_materias (curso_id, materia_id, periodo_sugerido)
select c.id, m.id, v.periodo
from (values
  ('INFO',   'Matemática',             1),
  ('INFO',   'Língua Portuguesa',      1),
  ('INFO',   'Física',                 1),
  ('INFO',   'Lógica de Programação',  1),
  ('INFO',   'Banco de Dados',         2),
  ('ELETRO', 'Matemática',             1),
  ('ELETRO', 'Eletrônica Analógica',   1)
) as v(sigla, materia, periodo)
join cursos c on c.sigla = v.sigla
join materias m on m.nome = v.materia;

insert into tags (nome) values
  ('Prova'), ('Recuperação'), ('Exercícios resolvidos'), ('Fórmulas'), ('Revisão');

-- ---------------------------------------------------------------------
-- RF38 — Primeiro administrador
-- 1. Crie sua conta normalmente pelo site e confirme o e-mail.
-- 2. Rode a linha abaixo trocando o e-mail pelo seu:
--
-- update usuarios set perfil = 'admin' where email = 'seu.nome@aluno.ifsc.edu.br';
--
-- Depois disso, novos administradores são promovidos pelo painel do admin.
-- ---------------------------------------------------------------------
