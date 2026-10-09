import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

// RF02: só e-mail institucional de aluno (o banco confere de novo no cadastro).
export const DOMINIO_EMAIL = '@aluno.ifsc.edu.br'

// Falso enquanto o .env não foi preenchido: o App mostra o passo a passo.
export const supabaseConfigurado = Boolean(url && chave && !url.includes('SEU-PROJETO'))

export const supabase = supabaseConfigurado ? createClient(url, chave) : null
