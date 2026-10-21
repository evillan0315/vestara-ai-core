
import React from "react"

export function VestaraLogoTeal({ size = 120, className = "", glow = false }: { size?: number, className?: string, glow?: boolean }) {
  const id = React.useId()
  return (
    <div className={className} style={{ width: size, height: size, display: 'inline-flex', filter: glow ? 'drop-shadow(0 0 12px rgba(45,232,195,0.45)) drop-shadow(0 8px 24px rgba(0,0,0,0.6))' : 'drop-shadow(0 8px 24px rgba(0,0,0,0.6))' }}>
      <svg viewBox="0 0 512 512" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`tealOuter-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E6FFF9" />
            <stop offset="18%" stopColor="#7FFAEF" />
            <stop offset="45%" stopColor="#2DE8C3" />
            <stop offset="70%" stopColor="#14B8A6" />
            <stop offset="85%" stopColor="#0F766E" />
            <stop offset="100%" stopColor="#042F2E" />
          </linearGradient>
          <linearGradient id={`blackMetal-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4A4A4A" />
            <stop offset="20%" stopColor="#343434" />
            <stop offset="45%" stopColor="#202020" />
            <stop offset="75%" stopColor="#111111" />
            <stop offset="90%" stopColor="#040404" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <linearGradient id={`tealBorder-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#134E4A" />
            <stop offset="100%" stopColor="#5EEAD4" />
          </linearGradient>
          <linearGradient id={`whiteHi-${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id={`shadow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000" floodOpacity="0.6" />
          </filter>
        </defs>
        <g transform="translate(46 46) scale(0.82)">
          <path d="M40 40 L190 40 L256 170 L322 40 L472 40 L282 470 L230 470 Z" fill={`url(#tealOuter-${id})`} filter={`url(#shadow-${id})`} />
          <path d="M105 80 L180 80 L256 235 L332 80 L407 80 L270 410 L242 410 Z" fill={`url(#blackMetal-${id})`} />
          <path d="M122 97 L187 97 L256 243 L325 97 L390 97 L267 387 L245 387 Z" fill="none" stroke={`url(#tealBorder-${id})`} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M252 168 L260 168 L260 470 L252 470 Z" fill="#134E4A" opacity="0.9" />
          <path d="M58 45 L182 45 L256 185 L330 45 L454 45 L270 458 L242 458 Z" fill={`url(#whiteHi-${id})`} opacity="0.35" />
        </g>
      </svg>
    </div>
  )
}
