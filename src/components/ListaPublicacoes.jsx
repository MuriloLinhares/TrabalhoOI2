import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'
import { POR_PAGINA } from '../lib/materiais'
import CartaoPublicacao from './CartaoPublicacao'
import Carregando from './Carregando'

// Lista paginada de publicações (RF42). "filtros" são os parâmetros da
// função buscar_publicacoes do banco (p_curso_id, p_busca...).
export default function ListaPublicacoes({ filtros, vazio }) {
  const [itens, setItens] = useState(null)
  const [temMais, setTemMais] = useState(false)
  const [erro, setErro] = useState('')
  const [carregandoMais, setCarregandoMais] = useState(false)
  // Ignora respostas de uma busca antiga que chegam depois da nova.
  const pedidoAtual = useRef(0)
  const chave = JSON.stringify(filtros)

  async function buscar(pular) {
    const pedido = ++pedidoAtual.current
    // Pede um a mais só para saber se existe próxima página.
    const { data, error } = await supabase.rpc('buscar_publicacoes', {
      ...JSON.parse(chave),
      p_limite: POR_PAGINA + 1,
      p_pular: pular,
    })
    if (pedido !== pedidoAtual.current) return
    if (error) {
      setErro(traduzirErro(error))
      setItens((atuais) => atuais ?? [])
      return
    }
    setErro('')
    setTemMais(data.length > POR_PAGINA)
    const pagina = data.slice(0, POR_PAGINA)
    setItens((atuais) => (pular === 0 ? pagina : [...atuais, ...pagina]))
  }

  useEffect(() => {
    setItens(null)
    buscar(0)
  }, [chave])

  async function carregarMais() {
    setCarregandoMais(true)
    await buscar(itens.length)
    setCarregandoMais(false)
  }

  if (itens === null) return <Carregando texto="Carregando materiais…" />

  return (
    <>
      {erro && (
        <div className="aviso aviso--alerta" role="alert">
          <p>{erro}</p>
          <button className="botao botao--pequeno" onClick={() => buscar(0)}>Tentar de novo</button>
        </div>
      )}
      {!erro && itens.length === 0 && vazio}
      {itens.map((p) => <CartaoPublicacao key={p.id} publicacao={p} />)}
      {temMais && (
        <div className="texto-centro">
          <button className="botao botao--secundario" disabled={carregandoMais} onClick={carregarMais}>
            {carregandoMais ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}
    </>
  )
}
