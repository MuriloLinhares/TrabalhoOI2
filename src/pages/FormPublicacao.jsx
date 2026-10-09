import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import {
  ACEITA_ARQUIVOS, carregarCatalogo, conferirArquivo, formatarTamanho,
  MAX_ANEXOS, MAX_TAGS, TIPOS_MATERIAL,
} from '../lib/materiais'
import Carregando from '../components/Carregando'
import { Campo } from './Cadastro'

// Nova publicação (tela 6) e edição: RF13–RF15, RF23, RF40, RF41.
// Sem ":id" na rota cria; com ":id" edita.
export default function FormPublicacao() {
  const { id } = useParams()
  const editando = Boolean(id)
  const { perfil, ehAdmin } = useAuth()
  const navigate = useNavigate()

  const [catalogo, setCatalogo] = useState(null)
  const [erroCarga, setErroCarga] = useState('')
  const [semPermissao, setSemPermissao] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', materia: '', tipo: '', tags: [] })
  const [anexosAtuais, setAnexosAtuais] = useState([])
  const [remover, setRemover] = useState([])
  const [arquivos, setArquivos] = useState([])
  const [links, setLinks] = useState([])
  const [novoLink, setNovoLink] = useState({ url: '', nome: '' })
  const [erros, setErros] = useState({})
  const [erroGeral, setErroGeral] = useState('')
  const [etapa, setEtapa] = useState('')

  useEffect(() => {
    async function carregar() {
      try {
        const cat = await carregarCatalogo(supabase)
        if (editando) {
          const [{ data: pubs, error }, { data: anexos, error: erroAnexos }] = await Promise.all([
            supabase.rpc('buscar_publicacoes', { p_id: Number(id) }),
            supabase.from('anexos').select('id, tipo, url, nome_original, tamanho').eq('publicacao_id', id).order('id'),
          ])
          if (error || erroAnexos) throw error ?? erroAnexos
          const p = pubs[0]
          if (!p) return setErroCarga('Publicação não encontrada.')
          if (p.autor_id !== perfil.id && !ehAdmin) return setSemPermissao(true)
          setForm({
            titulo: p.titulo,
            descricao: p.descricao,
            materia: String(p.materia_id),
            tipo: p.tipo_material,
            tags: p.tags.map((t) => t.id),
          })
          setAnexosAtuais(anexos)
        }
        setCatalogo(cat)
      } catch (e) {
        setErroCarga(traduzirErro(e))
      }
    }
    carregar()
  }, [editando, id, perfil.id, ehAdmin])

  if (erroCarga) return <p className="mensagem-erro cartao" role="alert">{erroCarga}</p>
  if (semPermissao) {
    return (
      <div className="estado-vazio cartao">
        <h1>Você não pode editar esta publicação</h1>
        <p>Só o autor ou um administrador pode editar.</p>
        <Link to={`/publicacao/${id}`} className="botao">Ver publicação</Link>
      </div>
    )
  }
  if (!catalogo) return <Carregando />

  const doMeuCurso = catalogo.materias.filter((m) => m.curso_materias.some((v) => v.curso_id === perfil.curso_id))
  const outras = catalogo.materias.filter((m) => !doMeuCurso.includes(m))
  const totalAnexos = anexosAtuais.length - remover.length + arquivos.length + links.length
  const enviando = etapa !== ''

  function mudar(campo) {
    return (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))
  }

  function alternarTag(tagId) {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tagId) ? f.tags.filter((t) => t !== tagId) : [...f.tags, tagId],
    }))
  }

  async function escolherArquivos(e) {
    const escolhidos = [...e.target.files]
    e.target.value = ''
    const novos = []
    const problemas = []
    for (const arquivo of escolhidos) {
      try {
        novos.push({ arquivo, formato: await conferirArquivo(arquivo), chave: crypto.randomUUID() })
      } catch (erro) {
        problemas.push(erro.message)
      }
    }
    if (totalAnexos + novos.length > MAX_ANEXOS) {
      problemas.push(`No máximo ${MAX_ANEXOS} anexos por publicação.`)
      novos.splice(MAX_ANEXOS - totalAnexos)
    }
    setArquivos((a) => [...a, ...novos])
    setErros((er) => ({ ...er, anexos: problemas.join(' ') }))
  }

  function adicionarLink() {
    let url = novoLink.url.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) {
      return setErros((er) => ({ ...er, link: 'Link inválido. Ex.: https://site.com/arquivo' }))
    }
    if (totalAnexos >= MAX_ANEXOS) {
      return setErros((er) => ({ ...er, link: `No máximo ${MAX_ANEXOS} anexos por publicação.` }))
    }
    setLinks((l) => [...l, { url, nome: novoLink.nome.trim(), chave: crypto.randomUUID() }])
    setNovoLink({ url: '', nome: '' })
    setErros((er) => ({ ...er, link: '' }))
  }

  function validar() {
    const e = {}
    if (form.titulo.trim().length < 3) e.titulo = 'Dê um título com pelo menos 3 letras.'
    if (!form.materia) e.materia = 'Escolha a matéria.'
    if (!form.tipo) e.tipo = 'Escolha o tipo de material.'
    if (form.tags.length > MAX_TAGS) e.tags = `Escolha no máximo ${MAX_TAGS} tags.`
    return e
  }

  async function salvar(ev) {
    ev.preventDefault()
    setErroGeral('')
    const e = validar()
    setErros(e)
    if (Object.keys(e).length) return

    // 1) Envia os arquivos para a pasta do aluno no Storage.
    const enviados = []
    try {
      for (const [i, { arquivo, formato }] of arquivos.entries()) {
        setEtapa(`Enviando arquivo ${i + 1} de ${arquivos.length}…`)
        const caminho = `${perfil.id}/${crypto.randomUUID()}.${formato.ext}`
        const { error } = await supabase.storage
          .from('anexos')
          .upload(caminho, arquivo, { contentType: formato.mime, upsert: false })
        if (error) throw error
        enviados.push({ caminho, nome: arquivo.name })
      }

      // 2) Grava a publicação (o banco confere limite, tags e anexos).
      setEtapa('Salvando…')
      const { data: pubId, error } = await supabase.rpc('salvar_publicacao', {
        p_id: editando ? Number(id) : null,
        p_titulo: form.titulo.trim(),
        p_descricao: form.descricao.trim(),
        p_materia_id: Number(form.materia),
        p_tipo_material: form.tipo,
        p_tags: form.tags,
        p_anexos: [
          ...enviados.map((a) => ({ tipo: 'arquivo', caminho: a.caminho, nome: a.nome })),
          ...links.map((l) => ({ tipo: 'link', url: l.url, nome: l.nome })),
        ],
        p_remover_anexos: remover,
      })
      if (error) throw error
      navigate(`/publicacao/${pubId}`, { replace: editando })
    } catch (erro) {
      // Não deixa arquivo solto no Storage se a publicação não foi salva.
      if (enviados.length) await supabase.storage.from('anexos').remove(enviados.map((a) => a.caminho))
      setErroGeral(traduzirErro(erro))
      setEtapa('')
    }
  }

  return (
    <form className="cartao form-publicacao" onSubmit={salvar} noValidate>
      <h1>{editando ? 'Editar publicação' : 'Nova publicação'}</h1>

      <Campo id="titulo" rotulo="Título" erro={erros.titulo} dica="Ex.: Prova de Matemática 2025 — 1º bimestre">
        <input id="titulo" maxLength={150} value={form.titulo} onChange={mudar('titulo')} />
      </Campo>

      <div className="admin-form__campos">
        <Campo id="materia" rotulo="Matéria" erro={erros.materia}>
          <select id="materia" value={form.materia} onChange={mudar('materia')}>
            <option value="">Escolha…</option>
            {doMeuCurso.length > 0 && (
              <optgroup label="Do seu curso">
                {doMeuCurso.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </optgroup>
            )}
            {outras.length > 0 && (
              <optgroup label="Outras matérias">
                {outras.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </optgroup>
            )}
          </select>
        </Campo>
        <Campo id="tipo" rotulo="Tipo de material" erro={erros.tipo}>
          <select id="tipo" value={form.tipo} onChange={mudar('tipo')}>
            <option value="">Escolha…</option>
            {TIPOS_MATERIAL.map((t) => <option key={t.valor} value={t.valor}>{t.icone} {t.rotulo}</option>)}
          </select>
        </Campo>
      </div>

      <Campo id="descricao" rotulo="Descrição (opcional)" dica="O que tem no material, de qual professor, de que ano…">
        <textarea id="descricao" rows={5} maxLength={5000} value={form.descricao} onChange={mudar('descricao')} />
      </Campo>

      <fieldset className="campo">
        <legend>Tags (até {MAX_TAGS})</legend>
        {catalogo.tags.length === 0 ? (
          <p className="campo__dica">Nenhuma tag cadastrada ainda. Os administradores cadastram as tags oficiais.</p>
        ) : (
          <div className="escolha-tags">
            {catalogo.tags.map((t) => {
              const marcada = form.tags.includes(t.id)
              return (
                <label key={t.id} className={`escolha-tags__tag ${marcada ? 'escolha-tags__tag--marcada' : ''}`}>
                  <input
                    type="checkbox"
                    checked={marcada}
                    disabled={!marcada && form.tags.length >= MAX_TAGS}
                    onChange={() => alternarTag(t.id)}
                  />
                  {t.nome}
                </label>
              )
            })}
          </div>
        )}
        {erros.tags && <p className="campo__erro">{erros.tags}</p>}
      </fieldset>

      <fieldset className="campo">
        <legend>Anexos ({totalAnexos} de {MAX_ANEXOS})</legend>
        <ul className="lista-anexos">
          {anexosAtuais.filter((a) => !remover.includes(a.id)).map((a) => (
            <li key={a.id}>
              <span>{a.tipo === 'link' ? '🔗' : '📎'} {a.nome_original}</span>
              <button type="button" className="botao-link botao-link--perigo"
                onClick={() => setRemover((r) => [...r, a.id])}>Remover</button>
            </li>
          ))}
          {arquivos.map((a) => (
            <li key={a.chave}>
              <span>📎 {a.arquivo.name} <span className="texto-suave">({formatarTamanho(a.arquivo.size)})</span></span>
              <button type="button" className="botao-link botao-link--perigo"
                onClick={() => setArquivos((l) => l.filter((x) => x.chave !== a.chave))}>Remover</button>
            </li>
          ))}
          {links.map((l) => (
            <li key={l.chave}>
              <span>🔗 {l.nome || l.url}</span>
              <button type="button" className="botao-link botao-link--perigo"
                onClick={() => setLinks((ls) => ls.filter((x) => x.chave !== l.chave))}>Remover</button>
            </li>
          ))}
        </ul>

        {/* O input fica escondido e o rótulo faz o papel de botão. */}
        <input id="arquivos" className="so-leitor escolher-arquivo__input" type="file" multiple accept={ACEITA_ARQUIVOS}
          onChange={escolherArquivos} disabled={totalAnexos >= MAX_ANEXOS} />
        <label htmlFor="arquivos" className="botao botao--secundario botao--pequeno escolher-arquivo">
          Escolher arquivos
        </label>
        <p className="campo__dica">PDF, PNG, JPG, DOCX ou PPTX, até 10 MB cada. Só quem está logado consegue baixar.</p>
        {erros.anexos && <p className="campo__erro">{erros.anexos}</p>}

        <div className="linha-campos adicionar-link">
          <input aria-label="Endereço do link" placeholder="https://… (link externo)" value={novoLink.url}
            onChange={(e) => setNovoLink((l) => ({ ...l, url: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarLink())} />
          <input aria-label="Nome do link (opcional)" placeholder="Nome do link (opcional)" value={novoLink.nome}
            onChange={(e) => setNovoLink((l) => ({ ...l, nome: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarLink())} />
          <button type="button" className="botao botao--secundario" onClick={adicionarLink}>Adicionar link</button>
        </div>
        {erros.link && <p className="campo__erro">{erros.link}</p>}
      </fieldset>

      <p className="campo__dica">
        Sua publicação aparece no feed na hora. Lembre dos <Link to="/termos" target="_blank">termos de uso</Link>:
        nada de cola em avaliação em andamento nem livro inteiro em PDF.
      </p>

      {erroGeral && <p className="mensagem-erro" role="alert">{erroGeral}</p>}

      <div className="linha-botoes">
        <button className="botao" disabled={enviando}>
          {etapa || (editando ? 'Salvar alterações' : 'Publicar')}
        </button>
        <Link to={editando ? `/publicacao/${id}` : '/feed'} className="botao botao--secundario">Cancelar</Link>
      </div>
    </form>
  )
}
