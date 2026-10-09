// RF11: barra de progresso do curso.
export default function BarraProgresso({ progresso }) {
  if (!progresso) return null
  const { periodo_atual, duracao, tipo, egresso } = progresso
  const unidade = tipo === 'anual' ? 'anos' : 'semestres'
  const concluidos = egresso ? duracao : periodo_atual
  const porcento = Math.round((concluidos / duracao) * 100)

  return (
    <div className="progresso">
      <div className="progresso__texto">
        <strong>{egresso ? 'Curso concluído (egresso)' : `${periodo_atual}º de ${duracao} ${unidade}`}</strong>
        <span>{porcento}%</span>
      </div>
      <div
        className="progresso__trilho"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcento}
        aria-label="Progresso do curso"
      >
        <div className="progresso__barra" style={{ width: `${porcento}%` }} />
      </div>
    </div>
  )
}
