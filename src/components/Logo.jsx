// Logo provisória. Trocar pelo símbolo oficial do IF depois que o campus
// liberar o uso (ver seção 6 do planejamento).
export default function Logo({ branca = false }) {
  return (
    <span className={`logo ${branca ? 'logo--branca' : ''}`}>
      <svg className="logo__simbolo" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="6" fill={branca ? '#fff' : '#2F9E41'} />
        <text x="15" y="22" fontSize="15" fontWeight="700" textAnchor="middle"
          fill={branca ? '#1E6B2B' : '#fff'} fontFamily="Arial, sans-serif">IF</text>
        <circle cx="25.5" cy="7" r="3.5" fill="#CD191E" />
      </svg>
      <span className="logo__nome">
        <span className="logo__help">Help</span>
        <span className="logo__if">IF</span>
      </span>
    </span>
  )
}
