import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PILARES = [
  ['Compartilhe', 'Resumos, provas antigas, mapas mentais e listas de exercícios num lugar só.'],
  ['Encontre rápido', 'Filtre por curso, semestre, matéria e tipo de material.'],
  ['Converse', 'Grupos de chat por turma e por matéria para tirar dúvidas.'],
  ['Material confiável', 'Moderação pelos administradores e selo de material verificado.'],
]

export default function Inicio() {
  const { sessao } = useAuth()
  if (sessao) return <Navigate to="/feed" replace />

  return (
    <div className="inicio">
      <section className="inicio__chamada">
        <h1>Os materiais de estudo do campus, num lugar só.</h1>
        <p>
          O HelpIF é o fórum de estudos dos alunos do IFSC Campus Chapecó.
          Chega de material perdido em grupo de WhatsApp.
        </p>
        <div className="linha-botoes">
          <Link to="/cadastro" className="botao">Criar conta</Link>
          <Link to="/login" className="botao botao--secundario">Entrar</Link>
        </div>
        <p className="texto-suave">Exclusivo para e-mails @aluno.ifsc.edu.br.</p>
      </section>

      <ul className="inicio__pilares">
        {PILARES.map(([titulo, texto]) => (
          <li key={titulo} className="cartao">
            <h2>{titulo}</h2>
            <p>{texto}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
