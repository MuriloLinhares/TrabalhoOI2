export default function Carregando({ texto = 'Carregando…' }) {
  return (
    <div className="carregando" role="status">
      <span className="carregando__bolinha" aria-hidden="true" />
      {texto}
    </div>
  )
}
