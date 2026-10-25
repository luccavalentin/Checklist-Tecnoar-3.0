// O React 18 nao reconhece fetchPriority em camelCase e descarta o atributo com aviso no console.
// Em minusculas ele repassa direto ao DOM, mas a tipagem do JSX so conhece a forma camelCase.
import 'react'

declare module 'react' {
  interface ImgHTMLAttributes<T> {
    fetchpriority?: 'high' | 'low' | 'auto'
  }
}
