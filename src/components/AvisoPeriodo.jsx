import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'

// RF10: no início de cada período o aluno confirma em que período está.
export default function AvisoPeriodo() {
  const { progresso, recarregarPerfil } = useAuth()
  const [corrigindo, setCorrigindo] = useState(false)
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (!progresso?.precisa_confirmar) return null

  const unidade = progresso.tipo === 'anual' ? 'ano' : 'semestre'
  const opcoes = Array.from({ length: progresso.duracao }, (_, i) => i + 1)

  async function confirmar(periodo) {
    setEnviando(true)
    setErro('')
    const { error } = await supabase.rpc('confirmar_periodo', { p_periodo_informado: periodo })
    setEnviando(false)
    if (error) return setErro(traduzirErro(error))
    await recarregarPerfil()
  }

  return (
    <section className="aviso aviso--destaque" aria-live="polite">
      {!corrigindo ? (
        <>
          <p>
            Começou um novo período! Você está no <strong>{progresso.periodo_atual}º {unidade}</strong>?
          </p>
          <div className="linha-botoes">
            <button className="botao" disabled={enviando} onClick={() => confirmar(null)}>
              Sim, estou
            </button>
            <button className="botao botao--secundario" disabled={enviando} onClick={() => setCorrigindo(true)}>
              Não, corrigir
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valor) confirmar(Number(valor))
          }}
        >
          <label htmlFor="periodo-correto">
            Em qual {unidade} você está? (Se reprovou ou trancou, o feed se ajusta.)
          </label>
          <div className="linha-botoes">
            <select id="periodo-correto" value={valor} onChange={(e) => setValor(e.target.value)} required>
              <option value="">Escolha…</option>
              {opcoes.map((n) => (
                <option key={n} value={n}>{n}º {unidade}</option>
              ))}
            </select>
            <button className="botao" disabled={enviando || !valor}>Salvar</button>
            <button type="button" className="botao botao--secundario" onClick={() => setCorrigindo(false)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}
    </section>
  )
}
