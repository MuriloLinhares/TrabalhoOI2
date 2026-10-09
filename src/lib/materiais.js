// Tipos de material (RF14), limites (RF13, RF15) e conferência dos
// arquivos pelo conteúdo, não só pela extensão (RF41).

export const TIPOS_MATERIAL = [
  { valor: 'anotacao', rotulo: 'Anotação', icone: '✏️' },
  { valor: 'resumo', rotulo: 'Resumo', icone: '📝' },
  { valor: 'prova_antiga', rotulo: 'Prova antiga', icone: '📄' },
  { valor: 'trabalho_antigo', rotulo: 'Trabalho antigo', icone: '📚' },
  { valor: 'mapa_mental', rotulo: 'Mapa mental', icone: '🧠' },
  { valor: 'lista_exercicios', rotulo: 'Lista de exercícios', icone: '🧮' },
  { valor: 'link', rotulo: 'Link', icone: '🔗' },
  { valor: 'outro', rotulo: 'Outro', icone: '📦' },
]

export function tipoMaterial(valor) {
  return TIPOS_MATERIAL.find((t) => t.valor === valor) ?? TIPOS_MATERIAL.at(-1)
}

export const MAX_TAGS = 5
export const MAX_ANEXOS = 5
export const MAX_TAMANHO = 10 * 1024 * 1024
export const POR_PAGINA = 20

// O mesmo que o bucket "anexos" aceita (0002_materiais.sql).
const FORMATOS = {
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  png: { mime: 'image/png', ext: 'png' },
  jpg: { mime: 'image/jpeg', ext: 'jpg' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' },
}
export const ACEITA_ARQUIVOS = '.pdf,.png,.jpg,.jpeg,.docx,.pptx'

function comecaCom(bytes, assinatura) {
  return assinatura.every((b, i) => bytes[i] === b)
}

// DOCX e PPTX são arquivos ZIP. Os nomes das pastas internas ficam no
// fim do arquivo (índice do ZIP), então basta ler o final.
async function formatoDoZip(arquivo) {
  const fim = await arquivo.slice(Math.max(0, arquivo.size - 65536)).arrayBuffer()
  const texto = new TextDecoder('latin1').decode(fim)
  if (texto.includes('word/document.xml')) return FORMATOS.docx
  if (texto.includes('ppt/presentation.xml')) return FORMATOS.pptx
  return null
}

// Devolve { mime, ext } ou lança um erro com a mensagem para o aluno.
export async function conferirArquivo(arquivo) {
  if (arquivo.size > MAX_TAMANHO) {
    throw new Error(`"${arquivo.name}" passa de 10 MB.`)
  }
  if (arquivo.size === 0) {
    throw new Error(`"${arquivo.name}" está vazio.`)
  }
  const bytes = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer())
  let formato = null
  if (comecaCom(bytes, [0x25, 0x50, 0x44, 0x46])) formato = FORMATOS.pdf
  else if (comecaCom(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) formato = FORMATOS.png
  else if (comecaCom(bytes, [0xff, 0xd8, 0xff])) formato = FORMATOS.jpg
  else if (comecaCom(bytes, [0x50, 0x4b, 0x03, 0x04])) formato = await formatoDoZip(arquivo)

  if (!formato) {
    throw new Error(`"${arquivo.name}" não é um PDF, imagem PNG/JPG, DOCX ou PPTX de verdade.`)
  }
  return formato
}

export function formatarTamanho(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Cursos, matérias (com os cursos de cada uma) e tags para os filtros e
// para o formulário de publicação.
export async function carregarCatalogo(supabase) {
  const [cursos, materias, tags] = await Promise.all([
    supabase.from('cursos').select('id, nome, sigla, tipo_periodo, duracao_periodos').order('nome'),
    supabase.from('materias').select('id, nome, curso_materias(curso_id, periodo_sugerido)').order('nome'),
    supabase.from('tags').select('id, nome').order('nome'),
  ])
  const erro = cursos.error ?? materias.error ?? tags.error
  if (erro) throw erro
  return { cursos: cursos.data, materias: materias.data, tags: tags.data }
}
