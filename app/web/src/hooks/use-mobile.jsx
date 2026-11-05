import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Lido logo no primeiro desenho. Começava em `undefined` (falso) e só passava a verdadeiro
  // no ciclo seguinte: no telemóvel, as listas desenhavam primeiro a versão de desktop (a
  // lista inteira, a paginação) e só depois a cortavam.
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return !!isMobile
}