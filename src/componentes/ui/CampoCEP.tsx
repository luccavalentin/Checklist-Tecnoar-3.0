import { useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { mascaraCEP, somenteDigitos } from '@/lib/formatos'
import { consultarCEP, type EnderecoConsultado } from '@/lib/consultasExternas'
import { Campo, Entrada } from '@/componentes/ui/Campo'

/**
 * Campo de CEP com validação e preenchimento de endereço.
 *
 * Endereço digitado à mão erra: rua sem acento, bairro trocado, cidade que
 * não existe naquele CEP. Aqui o CEP é a chave — ele valida o formato,
 * consulta a base dos Correios e preenche o resto.
 *
 * Quando a consulta falha, o campo diz **por que**: CEP incompleto, CEP
 * inexistente ou serviço fora do ar são coisas diferentes, e só a terceira
 * justifica preencher tudo na mão.
 */
export function CampoCEP({
  valor,
  aoMudar,
  aoEncontrar,
  rotulo = 'CEP',
  className,
  obrigatorio,
}: {
  valor: string
  aoMudar: (v: string) => void
  /** Recebe o endereço encontrado para preencher os campos vizinhos. */
  aoEncontrar: (e: EnderecoConsultado) => void
  rotulo?: string
  className?: string
  obrigatorio?: boolean
}) {
  const [buscando, setBuscando] = useState(false)
  const [estado, setEstado] = useState<'ocioso' | 'ok' | 'incompleto' | 'inexistente' | 'indisponivel'>('ocioso')

  const digitos = somenteDigitos(valor)

  async function consultar(v: string) {
    const d = somenteDigitos(v)
    if (d.length === 0) {
      setEstado('ocioso')
      return
    }
    if (d.length !== 8) {
      setEstado('incompleto')
      return
    }

    setBuscando(true)
    try {
      const r = await consultarCEP(d)
      if (!r) {
        /* A consulta distingue mal "não existe" de "não respondeu"; tratamos
           como inexistente, que é o caso comum, e o texto permite seguir. */
        setEstado('inexistente')
        return
      }
      setEstado('ok')
      aoEncontrar(r)
    } catch {
      setEstado('indisponivel')
    } finally {
      setBuscando(false)
    }
  }

  const mensagem =
    estado === 'incompleto'
      ? 'CEP incompleto — são 8 dígitos.'
      : estado === 'inexistente'
        ? 'CEP não encontrado. Confira o número ou preencha o endereço à mão.'
        : estado === 'indisponivel'
          ? 'A consulta de CEP não respondeu. Preencha o endereço à mão.'
          : undefined

  return (
    <Campo
      className={className}
      rotulo={rotulo}
      obrigatorio={obrigatorio}
      erro={estado === 'incompleto' || estado === 'inexistente' ? mensagem : undefined}
      dica={
        estado === 'indisponivel'
          ? mensagem
          : estado === 'ok'
            ? 'Endereço preenchido pelo CEP.'
            : 'Preenche o endereço automaticamente.'
      }
    >
      {(p) => (
        <Entrada
          {...p}
          mono
          inputMode="numeric"
          maxLength={9}
          value={valor}
          onChange={(e) => {
            setEstado('ocioso')
            aoMudar(mascaraCEP(e.target.value))
          }}
          onBlur={(e) => void consultar(e.target.value)}
          placeholder="00000-000"
          acaoFim={
            buscando ? (
              <Loader2 aria-hidden className="size-4 animate-spin text-ink-3" />
            ) : digitos.length === 8 && estado === 'ok' ? (
              <MapPin aria-hidden className="size-4 text-ok" />
            ) : undefined
          }
        />
      )}
    </Campo>
  )
}
