import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { traduzirErro } from '../lib/erros'

const AuthContext = createContext(null)

// Sem resposta do Supabase nesse tempo, mostra o aviso em vez de ficar
// carregando para sempre (ex.: projeto pausado no plano grátis).
const LIMITE_ESPERA_MS = 10000

function comPrazo(promessa) {
  return Promise.race([
    promessa,
    new Promise((_, falhar) => setTimeout(() => falhar(new Error('Failed to fetch')), LIMITE_ESPERA_MS)),
  ])
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(null)
  const [sessaoLida, setSessaoLida] = useState(!supabase)
  const [perfil, setPerfil] = useState(null)
  const [progresso, setProgresso] = useState(null)
  // Id do usuário cujo perfil já foi carregado (evita mostrar a tela
  // antes do perfil chegar).
  const [perfilDoId, setPerfilDoId] = useState(null)
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)
  const [contaBloqueada, setContaBloqueada] = useState(false)
  const [erroConexao, setErroConexao] = useState('')

  useEffect(() => {
    if (!supabase) return
    comPrazo(supabase.auth.getSession())
      .then(({ data }) => {
        setSessao(data.session)
        setSessaoLida(true)
      })
      .catch((erro) => setErroConexao(traduzirErro(erro)))
    // Não chamar o Supabase direto aqui dentro: o perfil é carregado no
    // efeito abaixo, quando o id do usuário muda.
    const { data } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
      setSessao(novaSessao)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const usuarioId = sessao?.user?.id ?? null

  const recarregarPerfil = useCallback(async () => {
    if (!usuarioId) {
      setPerfil(null)
      setProgresso(null)
      setPerfilDoId(null)
      return
    }
    let linha, prog
    try {
      const [respPerfil, respProgresso] = await comPrazo(Promise.all([
        supabase
          .from('usuarios')
          .select('*, curso:cursos(id, nome, sigla, tipo_periodo, duracao_periodos)')
          .eq('id', usuarioId)
          .maybeSingle(),
        supabase.rpc('calcular_progresso'),
      ]))
      if (respPerfil.error) throw respPerfil.error
      linha = respPerfil.data
      prog = respProgresso.data
    } catch (erro) {
      return setErroConexao(traduzirErro(erro))
    }
    if (linha?.situacao === 'bloqueada') {
      setContaBloqueada(true)
      await supabase.auth.signOut()
      return
    }
    setPerfil(linha ?? null)
    setProgresso(prog?.[0] ?? null)
    setPerfilDoId(usuarioId)
  }, [usuarioId])

  useEffect(() => {
    if (supabase) recarregarPerfil()
  }, [recarregarPerfil])

  const sair = useCallback(() => supabase.auth.signOut(), [])

  const valor = {
    sessao,
    perfil,
    progresso,
    carregando: !sessaoLida || (usuarioId !== null && perfilDoId !== usuarioId),
    ehAdmin: perfil?.perfil === 'admin',
    recuperandoSenha,
    setRecuperandoSenha,
    contaBloqueada,
    setContaBloqueada,
    recarregarPerfil,
    sair,
  }
  if (erroConexao) return <SemConexao mensagem={erroConexao} />
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

function SemConexao({ mensagem }) {
  return (
    <div className="formulario-centro cartao sem-conexao" role="alert">
      <h1>Não foi possível carregar o HelpIF</h1>
      <p>{mensagem}</p>
      <p className="texto-suave">
        Se a sua internet está funcionando, o servidor pode estar fora do ar. No plano grátis do
        Supabase, o projeto é pausado depois de alguns dias sem uso: um integrante do grupo precisa
        reativá-lo no painel do Supabase.
      </p>
      <button className="botao" onClick={() => window.location.reload()}>Tentar de novo</button>
    </div>
  )
}
