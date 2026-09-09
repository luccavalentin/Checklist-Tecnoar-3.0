import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { mascaraPlaca } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_CLIENTE, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { TIPOS_VEICULO } from '@/paginas/cadastros/Veiculos'
import type { TipoVeiculo } from '@/tipos/db'

interface FormRapido {
  placa: string
  descricao: string
  cliente_id: string
  tipo: TipoVeiculo | ''
  marca: string
  modelo: string
  numero_frota: string
}

/**
 * Cadastro contextual de veículo.
 *
 * Cria na MESMA tabela de Cadastros › Veículos — o registro nasce completo o
 * bastante para operar e pode ser detalhado depois, sem base paralela.
 */
export function FormularioVeiculoRapido({
  aberto,
  aoFechar,
  clienteIdSugerido,
  placaSugerida,
  aoSalvar,
}: {
  aberto: boolean
  aoFechar: () => void
  clienteIdSugerido?: string | null
  placaSugerida?: string
  aoSalvar?: (id: string, clienteId: string | null) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [erro, setErro] = useState<string | null>(null)

  const form = useForm<FormRapido>({
    defaultValues: { placa: '', descricao: '', cliente_id: '', tipo: '', marca: '', modelo: '', numero_frota: '' },
  })

  useEffect(() => {
    if (!aberto) return
    form.reset({
      placa: placaSugerida ? mascaraPlaca(placaSugerida) : '',
      descricao: '',
      cliente_id: clienteIdSugerido ?? '',
      tipo: '',
      marca: '',
      modelo: '',
      numero_frota: '',
    })
    setErro(null)
  }, [aberto, clienteIdSugerido, placaSugerida, form])

  const salvar = useMutation({
    mutationFn: async (d: FormRapido) => {
      const placa = d.placa.trim().toUpperCase()
      if (placa.replace(/[^A-Z0-9]/g, '').length < 7) throw new Error('Informe a placa completa.')
      const descricao = d.descricao.trim() || [d.marca.trim(), d.modelo.trim()].filter(Boolean).join(' ')
      if (descricao.length < 2) throw new Error('Informe a descrição ou marca e modelo.')

      const { data, error } = await supabase
        .from('veiculos')
        .insert({
          placa,
          descricao,
          cliente_id: d.cliente_id || null,
          tipo: d.tipo || null,
          marca: d.marca.trim() || null,
          modelo: d.modelo.trim() || null,
          numero_frota: d.numero_frota.trim() || null,
        })
        .select('id, cliente_id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (v) => {
      toast.ok('Veículo cadastrado')
      void qc.invalidateQueries({ queryKey: ['veiculos'] })
      aoSalvar?.(v.id, v.cliente_id)
      aoFechar()
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(m.includes('duplicate key') ? 'Já existe um veículo com esta placa.' : m)
    },
  })

  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Cadastrar veículo"
      descricao="Entra na base central de veículos e fica disponível em todo o sistema."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending} onClick={form.handleSubmit((d) => salvar.mutate(d))}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        <Grade>
          <Campo className="sm:col-span-5" rotulo="Placa" obrigatorio>
            {(p) => (
              <Entrada
                {...p}
                mono
                autoFocus
                className="text-[15px] font-semibold tracking-wide uppercase"
                value={form.watch('placa')}
                onChange={(e) => form.setValue('placa', mascaraPlaca(e.target.value), { shouldDirty: true })}
                placeholder="AAA-0A00"
              />
            )}
          </Campo>
          <Campo className="sm:col-span-7" rotulo="Tipo">
            {(p) => (
              <Selecao {...p} {...form.register('tipo')}>
                <option value="">Não informado</option>
                {TIPOS_VEICULO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Marca">
            {(p) => <Entrada {...p} {...form.register('marca')} />}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Modelo">
            {(p) => <Entrada {...p} {...form.register('modelo')} />}
          </Campo>
          <Campo className="sm:col-span-12" rotulo="Descrição" dica="Se ficar vazio, usamos marca e modelo.">
            {(p) => <Entrada {...p} {...form.register('descricao')} placeholder="Ex.: Cavalo Scania R450 branco" />}
          </Campo>
          <Campo className="sm:col-span-8" rotulo="Cliente proprietário">
            {(p) => (
              <SeletorRef
                {...p}
                config={REF_CLIENTE}
                valor={form.watch('cliente_id') || null}
                aoSelecionar={(o) => form.setValue('cliente_id', o?.id ?? '', { shouldDirty: true })}
                placeholder="Buscar cliente"
              />
            )}
          </Campo>
          <Campo className="sm:col-span-4" rotulo="Número de frota">
            {(p) => <Entrada {...p} mono {...form.register('numero_frota')} />}
          </Campo>
        </Grade>
      </form>
    </PainelLateral>
  )
}
