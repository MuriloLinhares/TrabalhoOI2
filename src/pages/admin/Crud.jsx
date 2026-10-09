import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { traduzirErro } from '../../lib/erros'
import { Campo } from '../Cadastro'

// Carrega uma lista do banco. "consulta" deve ser definida fora do
// componente (para não recarregar a cada render).
export function useLista(consulta) {
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')

  const recarregar = useCallback(async () => {
    const { data, error } = await consulta()
    setErro(error ? traduzirErro(error) : '')
    setLinhas(data ?? [])
  }, [consulta])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return { linhas, erro, recarregar }
}

export function Mensagem({ ok, erro }) {
  if (erro) return <p className="mensagem-erro" role="alert">{erro}</p>
  if (ok) return <p className="mensagem-ok" role="status">{ok}</p>
  return null
}

function formVazio(campos) {
  return Object.fromEntries(campos.map((c) => [c.nome, c.padrao ?? (c.tipo === 'checkbox' ? false : '')]))
}

function paraBanco(campos, form) {
  return Object.fromEntries(
    campos.map((c) => {
      const v = form[c.nome]
      if (c.tipo === 'checkbox') return [c.nome, Boolean(v)]
      if (c.tipo === 'number' || c.numerico) return [c.nome, v === '' ? null : Number(v)]
      return [c.nome, typeof v === 'string' ? v.trim() : v]
    }),
  )
}

// Criar, listar, editar e apagar (RF29). Cada alteração vai para o
// registro de ações pelo gatilho do banco (RF35).
//   campos:  [{ nome, rotulo, tipo: 'text'|'number'|'date'|'select'|'checkbox', opcoes, numerico, padrao, dica, min, max,
//              obrigatorio (padrão true), textoVazio (1ª opção do select) }]
//   colunas: [{ titulo, valor: (linha) => texto }]
//   feminino: true para "Nova tag" em vez de "Novo tag"
export default function Crud({ titulo, singular, feminino = false, tabela, lista, campos, colunas, nomeDaLinha, textoVazio }) {
  const { linhas, erro, recarregar } = lista
  const [form, setForm] = useState(() => formVazio(campos))
  const [editandoId, setEditandoId] = useState(null)
  const [mensagem, setMensagem] = useState(null)
  const [enviando, setEnviando] = useState(false)

  function mudar(campo) {
    return (e) => {
      const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm((f) => ({ ...f, [campo]: valor }))
    }
  }

  function limpar() {
    setForm(formVazio(campos))
    setEditandoId(null)
  }

  function editar(linha) {
    setForm(Object.fromEntries(campos.map((c) => [c.nome, linha[c.nome] ?? (c.tipo === 'checkbox' ? false : '')])))
    setEditandoId(linha.id)
    setMensagem(null)
  }

  async function salvar(e) {
    e.preventDefault()
    const faltando = campos.find((c) => c.obrigatorio !== false && c.tipo !== 'checkbox' && String(form[c.nome]).trim() === '')
    if (faltando) return setMensagem({ erro: `Preencha o campo "${faltando.rotulo}".` })

    setEnviando(true)
    const dados = paraBanco(campos, form)
    const { error } = editandoId
      ? await supabase.from(tabela).update(dados).eq('id', editandoId)
      : await supabase.from(tabela).insert(dados)
    setEnviando(false)
    if (error) return setMensagem({ erro: traduzirErro(error) })
    setMensagem({ ok: editandoId ? 'Alterações salvas.' : `${singular} ${feminino ? 'cadastrada' : 'cadastrado'}.` })
    limpar()
    recarregar()
  }

  async function apagar(linha) {
    if (!window.confirm(`Apagar "${nomeDaLinha(linha)}"? Não dá para desfazer.`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', linha.id)
    if (error) return setMensagem({ erro: traduzirErro(error) })
    if (editandoId === linha.id) limpar()
    setMensagem({ ok: 'Apagado.' })
    recarregar()
  }

  return (
    <section>
      <form className="cartao" onSubmit={salvar}>
        <div className="admin-secao__topo">
          <h2>{editandoId ? `Editar ${singular.toLowerCase()}` : `${feminino ? 'Nova' : 'Novo'} ${singular.toLowerCase()}`}</h2>
          {editandoId && (
            <button type="button" className="botao-link" onClick={limpar}>Cancelar edição</button>
          )}
        </div>
        <div className="admin-form__campos">
          {campos.map((c) => (
            <CampoForm key={c.nome} campo={c} valor={form[c.nome]} aoMudar={mudar(c.nome)} />
          ))}
        </div>
        <Mensagem {...mensagem} />
        <button className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Adicionar'}
        </button>
      </form>

      <h2>{titulo}</h2>
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
      {linhas === null ? (
        <p className="texto-suave">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="estado-vazio">{textoVazio}</p>
      ) : (
        <div className="rolagem-tabela">
          <table className="tabela">
            <thead>
              <tr>
                {colunas.map((c) => <th key={c.titulo} scope="col">{c.titulo}</th>)}
                <th scope="col"><span className="so-leitor">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.id}>
                  {colunas.map((c) => <td key={c.titulo}>{c.valor(linha)}</td>)}
                  <td className="tabela__acoes">
                    <button className="botao-link" onClick={() => editar(linha)}>Editar</button>
                    <button className="botao-link botao-link--perigo" onClick={() => apagar(linha)}>Apagar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CampoForm({ campo, valor, aoMudar }) {
  const id = `admin-${campo.nome}`
  if (campo.tipo === 'checkbox') {
    return (
      <div className="campo">
        <label className="caixa-marcar">
          <input id={id} type="checkbox" checked={Boolean(valor)} onChange={aoMudar} />
          <span>{campo.rotulo}</span>
        </label>
      </div>
    )
  }
  return (
    <Campo id={id} rotulo={campo.rotulo} dica={campo.dica}>
      {campo.tipo === 'select' ? (
        <select id={id} value={valor} onChange={aoMudar}>
          <option value="">{campo.textoVazio ?? 'Escolha…'}</option>
          {campo.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
      ) : (
        <input id={id} type={campo.tipo ?? 'text'} min={campo.min} max={campo.max} value={valor} onChange={aoMudar} />
      )}
    </Campo>
  )
}
