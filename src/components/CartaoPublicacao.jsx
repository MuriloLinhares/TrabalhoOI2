import { Link } from 'react-router-dom'
import { formatarDataHora, tipoMaterial } from '../lib/materiais'

export function SeloVerificado() {
  return <span className="selo-verificado" title="Material conferido por um administrador">✓ Verificado</span>
}

export function ListaTags({ tags }) {
  if (!tags?.length) return null
  return (
    <ul className="lista-tags" aria-label="Tags">
      {tags.map((t) => <li key={t.id} className="pilula">{t.nome}</li>)}
    </ul>
  )
}

// Um item do feed (seção 6: card com borda fina e ícone por tipo).
export default function CartaoPublicacao({ publicacao: p }) {
  const tipo = tipoMaterial(p.tipo_material)
  return (
    <article className="cartao cartao-pub">
      <div className="cartao-pub__icone" aria-hidden="true">{tipo.icone}</div>
      <div className="cartao-pub__corpo">
        <p className="cartao-pub__linha-topo">
          <span>{tipo.rotulo}</span> · <span>{p.materia_nome}</span>
          {p.verificado && <SeloVerificado />}
        </p>
        <h2 className="cartao-pub__titulo">
          <Link to={`/publicacao/${p.id}`}>{p.titulo}</Link>
        </h2>
        {p.descricao && <p className="cartao-pub__descricao">{p.descricao}</p>}
        <ListaTags tags={p.tags} />
        <p className="cartao-pub__meta">
          {p.autor_nome}
          {p.autor_curso && ` · ${p.autor_curso}`} · {formatarDataHora(p.criado_em)}
          {p.total_anexos > 0 && (
            <> · <span className="cartao-pub__anexos">📎 {p.total_anexos} {p.total_anexos === 1 ? 'anexo' : 'anexos'}</span></>
          )}
        </p>
        <p className="cartao-pub__meta cartao-pub__numeros">
          <span title="Marcaram como útil">👍 {p.total_curtidas} {p.total_curtidas === 1 ? 'útil' : 'úteis'}</span>
          <span title="Comentários">💬 {p.total_comentarios} {p.total_comentarios === 1 ? 'comentário' : 'comentários'}</span>
          {p.favoritou && <span title="Está nos seus favoritos">★ Favorito</span>}
        </p>
      </div>
    </article>
  )
}
