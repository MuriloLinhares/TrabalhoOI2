import { Link } from 'react-router-dom'

export default function NaoEncontrada() {
  return (
    <div className="estado-vazio cartao">
      <h1>Página não encontrada</h1>
      <p>O endereço pode estar errado ou a página foi removida.</p>
      <Link to="/" className="botao">Voltar ao início</Link>
    </div>
  )
}
