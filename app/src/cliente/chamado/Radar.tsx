/**
 * Ondas sobre o mapa enquanto a Tecnoar procura o mecânico. Dá a sensação
 * certa: "estão procurando por você agora", não "travou". Com movimento
 * reduzido no aparelho, as ondas ficam paradas.
 */
export function Radar() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
      <div className="relative size-64 max-h-[80vw] max-w-[80vw]">
        <span className="cli-onda absolute inset-0 rounded-full border-2 border-[#ff6600]/45 bg-[#ff6600]/[0.06]" />
        <span className="cli-onda absolute inset-0 rounded-full border-2 border-[#ff6600]/40 [animation-delay:0.8s]" />
        <span className="cli-onda absolute inset-0 rounded-full border-2 border-[#ff6600]/35 [animation-delay:1.6s]" />
      </div>
    </div>
  )
}
