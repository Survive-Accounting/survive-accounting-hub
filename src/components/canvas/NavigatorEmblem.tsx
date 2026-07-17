// NAVIGATOR EMBLEM — the Frame Navigator's crest: a brass sextant + compass rose
// on a star-grid, RuneScape-star-map vibe. A super-slow counter-rotating star
// field behind a fixed sextant, with a lazily sweeping pointer, brass gradients
// and a warm glow. Purely decorative (SVG, no state); sized by the caller.
const CSS = `
@keyframes sa-nav-spin { to { transform: rotate(360deg); } }
@keyframes sa-nav-spin-rev { to { transform: rotate(-360deg); } }
@keyframes sa-nav-sweep { 0%,100% { transform: rotate(-32deg); } 50% { transform: rotate(32deg); } }
`;

export function NavigatorEmblem({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <radialGradient id="navGlow" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#FFE9C0" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#E8B84B" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#E8B84B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="navBrass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBE7B0" />
          <stop offset="45%" stopColor="#E8B84B" />
          <stop offset="100%" stopColor="#9A6B1E" />
        </linearGradient>
        <linearGradient id="navSteel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EBD79A" />
          <stop offset="100%" stopColor="#B4842B" />
        </linearGradient>
      </defs>

      {/* warm bloom */}
      <circle cx="50" cy="48" r="48" fill="url(#navGlow)" />

      {/* slow star-field grid, counter-rotating */}
      <g style={{ transformOrigin: "50px 50px", animation: "sa-nav-spin-rev 120s linear infinite" }} opacity="0.7">
        {[[26, 24], [74, 28], [30, 72], [72, 70], [50, 18], [18, 50], [82, 52], [50, 82]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y-3.2} L${x+0.9} ${y-0.9} L${x+3.2} ${y} L${x+0.9} ${y+0.9} L${x} ${y+3.2} L${x-0.9} ${y+0.9} L${x-3.2} ${y} L${x-0.9} ${y-0.9} Z`} fill="#F3D98C" opacity={0.5 + (i % 3) * 0.18} />
        ))}
      </g>

      {/* graduated outer ring */}
      <circle cx="50" cy="50" r="42" fill="none" stroke="url(#navBrass)" strokeWidth="3.2" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="#3a2606" strokeWidth="0.6" opacity="0.5" />
      {/* tick marks, slowly rotating */}
      <g style={{ transformOrigin: "50px 50px", animation: "sa-nav-spin 180s linear infinite" }}>
        {Array.from({ length: 36 }).map((_, i) => (
          <rect key={i} x="49.5" y="9" width="1" height={i % 3 === 0 ? 4.5 : 2.5} fill="#E8B84B" opacity="0.7" transform={`rotate(${i * 10} 50 50)`} />
        ))}
      </g>

      {/* sextant frame — arc + index bar (fixed) */}
      <path d="M22 66 A34 34 0 0 1 78 66" fill="none" stroke="url(#navSteel)" strokeWidth="5" strokeLinecap="round" />
      <path d="M22 66 A34 34 0 0 1 78 66" fill="none" stroke="#2a1c05" strokeWidth="0.7" opacity="0.4" />
      <circle cx="50" cy="52" r="3.4" fill="url(#navBrass)" stroke="#3a2606" strokeWidth="0.6" />

      {/* index arm — lazy sweep */}
      <g style={{ transformOrigin: "50px 52px", animation: "sa-nav-sweep 14s ease-in-out infinite" }}>
        <line x1="50" y1="52" x2="50" y2="20" stroke="#F6E3A6" strokeWidth="2" strokeLinecap="round" />
        <circle cx="50" cy="20" r="2.2" fill="#FFF3D0" />
      </g>

      {/* compass north star */}
      <path d="M50 38 L52.4 49.2 L50 52 L47.6 49.2 Z" fill="#FFEFCB" opacity="0.9" />
    </svg>
  );
}
