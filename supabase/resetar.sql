-- =====================================================================
-- HelpIF — Apaga tudo o que os arquivos de supabase/migrations criaram,
-- para rodar de novo.
-- ATENÇÃO: apaga cursos, matérias, calendário, tags, usuários, log,
-- publicações e comentários. Use só em projeto de teste. Depois rode as
-- migrations em ordem (0001, 0002, 0003, 0004) e o seed.sql.
-- Os arquivos já enviados ficam no bucket "anexos" do Storage: apague
-- pelo painel (Storage > anexos) se quiser.
-- =====================================================================

-- Fase 3 (chat) e painel de publicações
drop table if exists mensagens, grupos_chat cascade;
drop function if exists pode_ver_grupo(bigint) cascade;
drop function if exists listar_grupos() cascade;
drop function if exists listar_mensagens(bigint, bigint, bigint, int) cascade;
drop function if exists enviar_mensagem(bigint, text) cascade;
drop function if exists excluir_mensagem(bigint) cascade;
drop function if exists admin_listar_publicacoes(text, text, text, int, int) cascade;
drop function if exists restaurar_publicacao(bigint) cascade;

-- Fase 3 (interações)
drop table if exists comentarios, favoritos, curtidas cascade;
drop function if exists buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, text, boolean, int, int) cascade;
drop function if exists curtir(bigint, boolean) cascade;
drop function if exists favoritar(bigint, boolean) cascade;
drop function if exists comentar(bigint, text) cascade;
drop function if exists excluir_comentario(bigint) cascade;
drop function if exists listar_comentarios(bigint) cascade;
drop function if exists conferir_publicacao_visivel(bigint) cascade;

-- Fase 2
drop policy if exists "helpif envia anexo na propria pasta" on storage.objects;
drop policy if exists "helpif baixa anexo visivel" on storage.objects;
drop policy if exists "helpif apaga anexo nao usado" on storage.objects;
drop table if exists anexos, publicacao_tags, publicacoes cascade;
drop function if exists salvar_publicacao(text, text, bigint, tipo_material, bigint[], jsonb, bigint[], bigint) cascade;
drop function if exists excluir_publicacao(bigint) cascade;
drop function if exists marcar_verificado(bigint, boolean) cascade;
drop function if exists buscar_publicacoes(bigint, int, bigint, tipo_material, bigint, text, uuid, bigint, int, int) cascade;
drop function if exists sem_acento(text) cascade;
drop type if exists tipo_material cascade;
drop type if exists tipo_anexo cascade;

-- Fase 1

drop trigger if exists ao_criar_conta on auth.users;

drop table if exists
  log_admin, usuarios, tags, curso_materias, materias, calendario_letivo, cursos
  cascade;

drop function if exists criar_usuario() cascade;
drop function if exists registrar_log() cascade;
drop function if exists is_admin() cascade;
drop function if exists semestre_vigente() cascade;
drop function if exists chave_periodo(tipo_periodo) cascade;
drop function if exists periodos_iniciados(tipo_periodo, smallint, smallint) cascade;
drop function if exists calcular_progresso(uuid) cascade;
drop function if exists confirmar_periodo(int) cascade;
drop function if exists excluir_minha_conta() cascade;

drop type if exists perfil_usuario cascade;
drop type if exists situacao_usuario cascade;
drop type if exists tipo_periodo cascade;
