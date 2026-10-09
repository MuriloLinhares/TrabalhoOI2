// Traduz os erros do Supabase (login e banco) para mensagens em português.

const POR_CODIGO = {
  // Supabase Auth
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Olhe também a pasta de spam.',
  user_already_exists: 'Já existe uma conta com esse e-mail.',
  email_exists: 'Já existe uma conta com esse e-mail.',
  weak_password: 'Senha fraca: use pelo menos 8 caracteres.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails enviados agora. Espere alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  email_address_invalid: 'E-mail inválido.',
  signup_disabled: 'O cadastro está desativado no momento.',
  session_expired: 'Sua sessão expirou. Faça login novamente.',
  session_not_found: 'Sua sessão expirou. Faça login novamente.',
  // PostgreSQL
  23505: 'Já existe um cadastro com esse nome.',
  23503: 'Não dá para apagar: existem outros dados ligados a este item.',
  23514: 'Algum valor está fora do permitido. Confira os campos.',
  23502: 'Preencha todos os campos obrigatórios.',
  42501: 'Você não tem permissão para fazer isso.',
  PGRST301: 'Sua sessão expirou. Faça login novamente.',
}

const POR_TEXTO = [
  ['Invalid login credentials', 'E-mail ou senha incorretos.'],
  ['Email not confirmed', 'Confirme seu e-mail antes de entrar. Olhe também a pasta de spam.'],
  ['User already registered', 'Já existe uma conta com esse e-mail.'],
  ['Password should be at least', 'A senha precisa ter pelo menos 8 caracteres.'],
  ['row-level security', 'Você não tem permissão para fazer isso.'],
  ['permission denied', 'Você não tem permissão para fazer isso.'],
  ['Failed to fetch', 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  ['NetworkError', 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
  // Supabase Storage (anexos)
  ['exceeded the maximum allowed size', 'O arquivo passa de 10 MB.'],
  ['is not supported', 'Tipo de arquivo não aceito. Use PDF, PNG, JPG, DOCX ou PPTX.'],
  ['Object not found', 'Arquivo não encontrado. Ele pode ter sido removido.'],
  ['Bucket not found', 'O armazenamento de anexos não foi criado. Rode o 0002_materiais.sql no Supabase.'],
]

export function traduzirErro(erro) {
  if (!erro) return ''
  const codigo = erro.code ?? erro.error_code
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo]

  const mensagem = erro.message ?? String(erro)
  const achado = POR_TEXTO.find(([trecho]) => mensagem.includes(trecho))
  if (achado) return achado[1]

  // O cadastro roda no gatilho do banco: o Supabase devolve
  // "Database error saving new user" sem o motivo. O front já valida antes.
  if (mensagem.includes('Database error saving new user')) {
    return 'Não foi possível criar a conta. Confira e-mail, curso e ano de ingresso.'
  }

  // Erros das nossas funções (raise exception) já vêm em português.
  if (codigo === 'P0001') return mensagem
  return 'Algo deu errado. Tente de novo em instantes.'
}
