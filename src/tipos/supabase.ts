export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acoes_corretivas: {
        Row: {
          acao: string | null
          checklist_id: string | null
          concluida_em: string | null
          concluida_por: string | null
          conclusao: string | null
          created_at: string
          criada_por: string | null
          id: string
          numero: number
          origem: string
          prazo: string | null
          prioridade: Database["public"]["Enums"]["prioridade_acao"]
          problema: string
          responsavel_id: string | null
          resposta_id: string | null
          setor: string | null
          status: Database["public"]["Enums"]["status_acao"]
          updated_at: string
        }
        Insert: {
          acao?: string | null
          checklist_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          conclusao?: string | null
          created_at?: string
          criada_por?: string | null
          id?: string
          numero?: never
          origem?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_acao"]
          problema: string
          responsavel_id?: string | null
          resposta_id?: string | null
          setor?: string | null
          status?: Database["public"]["Enums"]["status_acao"]
          updated_at?: string
        }
        Update: {
          acao?: string | null
          checklist_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          conclusao?: string | null
          created_at?: string
          criada_por?: string | null
          id?: string
          numero?: never
          origem?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_acao"]
          problema?: string
          responsavel_id?: string | null
          resposta_id?: string | null
          setor?: string | null
          status?: Database["public"]["Enums"]["status_acao"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acoes_corretivas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_concluida_por_fkey"
            columns: ["concluida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_concluida_por_fkey"
            columns: ["concluida_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_concluida_por_fkey"
            columns: ["concluida_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_corretivas_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "checklist_respostas"
            referencedColumns: ["id"]
          },
        ]
      }
      artigo_versoes: {
        Row: {
          artigo_id: string
          conteudo: string
          id: string
          publicado_em: string
          publicado_por: string | null
          titulo: string
          versao: number
        }
        Insert: {
          artigo_id: string
          conteudo: string
          id?: string
          publicado_em?: string
          publicado_por?: string | null
          titulo: string
          versao: number
        }
        Update: {
          artigo_id?: string
          conteudo?: string
          id?: string
          publicado_em?: string
          publicado_por?: string | null
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "artigo_versoes_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "artigos_tecnicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigo_versoes_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "vw_ebook_capitulos"
            referencedColumns: ["artigo_id"]
          },
          {
            foreignKeyName: "artigo_versoes_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigo_versoes_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigo_versoes_publicado_por_fkey"
            columns: ["publicado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      artigos_ajuda: {
        Row: {
          autor_id: string | null
          categoria: string | null
          conteudo: string | null
          created_at: string
          id: string
          publicado: boolean
          resumo: string | null
          tags: string[]
          titulo: string
          updated_at: string
        }
        Insert: {
          autor_id?: string | null
          categoria?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          publicado?: boolean
          resumo?: string | null
          tags?: string[]
          titulo: string
          updated_at?: string
        }
        Update: {
          autor_id?: string | null
          categoria?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          publicado?: boolean
          resumo?: string | null
          tags?: string[]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artigos_ajuda_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_ajuda_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_ajuda_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      artigos_tecnicos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          arquivado_em: string | null
          autor_id: string | null
          busca: unknown
          categoria: string | null
          codigos: string[]
          componente: string | null
          conteudo: string
          created_at: string
          equipamento: string | null
          fabricante: string | null
          id: string
          numero: number
          publicado_em: string | null
          resumo: string | null
          revisor_id: string | null
          sintomas: string[]
          situacao: Database["public"]["Enums"]["situacao_artigo"]
          tags: string[]
          titulo: string
          updated_at: string
          versao: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivado_em?: string | null
          autor_id?: string | null
          busca?: unknown
          categoria?: string | null
          codigos?: string[]
          componente?: string | null
          conteudo?: string
          created_at?: string
          equipamento?: string | null
          fabricante?: string | null
          id?: string
          numero?: never
          publicado_em?: string | null
          resumo?: string | null
          revisor_id?: string | null
          sintomas?: string[]
          situacao?: Database["public"]["Enums"]["situacao_artigo"]
          tags?: string[]
          titulo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivado_em?: string | null
          autor_id?: string | null
          busca?: unknown
          categoria?: string | null
          codigos?: string[]
          componente?: string | null
          conteudo?: string
          created_at?: string
          equipamento?: string | null
          fabricante?: string | null
          id?: string
          numero?: never
          publicado_em?: string | null
          resumo?: string | null
          revisor_id?: string | null
          sintomas?: string[]
          situacao?: Database["public"]["Enums"]["situacao_artigo"]
          tags?: string[]
          titulo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "artigos_tecnicos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_revisor_id_fkey"
            columns: ["revisor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_revisor_id_fkey"
            columns: ["revisor_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artigos_tecnicos_revisor_id_fkey"
            columns: ["revisor_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          assinado_em: string
          documento: string | null
          entidade: string
          entidade_id: string
          id: string
          imagem_base64: string | null
          momento: string
          nome: string
          observacao: string | null
          registrado_por: string | null
        }
        Insert: {
          assinado_em?: string
          documento?: string | null
          entidade: string
          entidade_id: string
          id?: string
          imagem_base64?: string | null
          momento: string
          nome: string
          observacao?: string | null
          registrado_por?: string | null
        }
        Update: {
          assinado_em?: string
          documento?: string | null
          entidade?: string
          entidade_id?: string
          id?: string
          imagem_base64?: string | null
          momento?: string
          nome?: string
          observacao?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          created_at: string
          dados: Json | null
          entidade: string | null
          entidade_id: string | null
          id: number
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados?: Json | null
          entidade?: string | null
          entidade_id?: string | null
          id?: never
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados?: Json | null
          entidade?: string | null
          entidade_id?: string | null
          id?: never
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      avarias_veiculo: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          observacao: string | null
          posicao: string
          registrado_por: string | null
          tipo: Database["public"]["Enums"]["tipo_avaria"]
          veiculo_id: string | null
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          posicao: string
          registrado_por?: string | null
          tipo: Database["public"]["Enums"]["tipo_avaria"]
          veiculo_id?: string | null
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          posicao?: string
          registrado_por?: string | null
          tipo?: Database["public"]["Enums"]["tipo_avaria"]
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avarias_veiculo_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      checklist_defeitos: {
        Row: {
          aprovacao: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em: string | null
          aprovado_por: string | null
          checklist_id: string
          componente: string | null
          created_at: string
          criticidade: Database["public"]["Enums"]["criticidade"]
          defeito: string
          descricao: string | null
          id: string
          produto_id: string | null
          recomendacao: string | null
          resposta_id: string
          servico_id: string | null
          sistema: string | null
        }
        Insert: {
          aprovacao?: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em?: string | null
          aprovado_por?: string | null
          checklist_id: string
          componente?: string | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          defeito: string
          descricao?: string | null
          id?: string
          produto_id?: string | null
          recomendacao?: string | null
          resposta_id: string
          servico_id?: string | null
          sistema?: string | null
        }
        Update: {
          aprovacao?: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em?: string | null
          aprovado_por?: string | null
          checklist_id?: string
          componente?: string | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          defeito?: string
          descricao?: string | null
          id?: string
          produto_id?: string | null
          recomendacao?: string | null
          resposta_id?: string
          servico_id?: string | null
          sistema?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_defeitos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_resposta_id_fkey"
            columns: ["resposta_id"]
            isOneToOne: false
            referencedRelation: "checklist_respostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_defeitos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_modelo_itens: {
        Row: {
          created_at: string
          exige_evidencia: boolean
          exige_medicao: boolean
          id: string
          modelo_id: string
          obrigatorio: boolean
          ordem: number
          orientacao: string | null
          secao: string
          texto: string
          tipo_resposta: Database["public"]["Enums"]["tipo_resposta_checklist"]
          unidade_medicao: string | null
          versao: number
        }
        Insert: {
          created_at?: string
          exige_evidencia?: boolean
          exige_medicao?: boolean
          id?: string
          modelo_id: string
          obrigatorio?: boolean
          ordem?: number
          orientacao?: string | null
          secao?: string
          texto: string
          tipo_resposta?: Database["public"]["Enums"]["tipo_resposta_checklist"]
          unidade_medicao?: string | null
          versao: number
        }
        Update: {
          created_at?: string
          exige_evidencia?: boolean
          exige_medicao?: boolean
          id?: string
          modelo_id?: string
          obrigatorio?: boolean
          ordem?: number
          orientacao?: string | null
          secao?: string
          texto?: string
          tipo_resposta?: Database["public"]["Enums"]["tipo_resposta_checklist"]
          unidade_medicao?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_modelo_itens_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "checklist_modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_modelos: {
        Row: {
          created_at: string
          descricao: string
          entrada_visual: boolean
          especialidade_id: string | null
          id: string
          situacao: Database["public"]["Enums"]["situacao_registro"]
          tipo: Database["public"]["Enums"]["tipo_checklist"]
          tipo_veiculo: Database["public"]["Enums"]["tipo_veiculo"] | null
          updated_at: string
          versao_atual: number
        }
        Insert: {
          created_at?: string
          descricao: string
          entrada_visual?: boolean
          especialidade_id?: string | null
          id?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tipo: Database["public"]["Enums"]["tipo_checklist"]
          tipo_veiculo?: Database["public"]["Enums"]["tipo_veiculo"] | null
          updated_at?: string
          versao_atual?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          entrada_visual?: boolean
          especialidade_id?: string | null
          id?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tipo?: Database["public"]["Enums"]["tipo_checklist"]
          tipo_veiculo?: Database["public"]["Enums"]["tipo_veiculo"] | null
          updated_at?: string
          versao_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_modelos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_respostas: {
        Row: {
          checklist_id: string
          created_at: string
          exige_evidencia: boolean
          exige_medicao: boolean
          id: string
          item_id: string | null
          medicao: number | null
          obrigatorio: boolean
          observacao: string | null
          ordem: number
          respondido_em: string | null
          respondido_por: string | null
          resposta: Database["public"]["Enums"]["resposta_checklist"] | null
          secao: string
          texto: string
          tipo_resposta: Database["public"]["Enums"]["tipo_resposta_checklist"]
          unidade_medicao: string | null
        }
        Insert: {
          checklist_id: string
          created_at?: string
          exige_evidencia?: boolean
          exige_medicao?: boolean
          id?: string
          item_id?: string | null
          medicao?: number | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: Database["public"]["Enums"]["resposta_checklist"] | null
          secao: string
          texto: string
          tipo_resposta?: Database["public"]["Enums"]["tipo_resposta_checklist"]
          unidade_medicao?: string | null
        }
        Update: {
          checklist_id?: string
          created_at?: string
          exige_evidencia?: boolean
          exige_medicao?: boolean
          id?: string
          item_id?: string | null
          medicao?: number | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: Database["public"]["Enums"]["resposta_checklist"] | null
          secao?: string
          texto?: string
          tipo_resposta?: Database["public"]["Enums"]["tipo_resposta_checklist"]
          unidade_medicao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_respostas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_modelo_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          cliente_id: string | null
          concluido_em: string | null
          created_at: string
          data_referencia: string | null
          especialidade_id: string | null
          garantia_dias: number | null
          garantia_km: number | null
          garantia_observacao: string | null
          id: string
          iniciado_em: string
          km: number | null
          modelo_descricao: string
          modelo_id: string | null
          numero: number
          observacoes: string | null
          os_id: string | null
          placa_carreta_1: string | null
          placa_carreta_2: string | null
          responsavel_id: string | null
          setor: string | null
          situacao: Database["public"]["Enums"]["situacao_checklist"]
          tipo: Database["public"]["Enums"]["tipo_checklist"]
          updated_at: string
          veiculo_id: string | null
          versao: number
        }
        Insert: {
          cliente_id?: string | null
          concluido_em?: string | null
          created_at?: string
          data_referencia?: string | null
          especialidade_id?: string | null
          garantia_dias?: number | null
          garantia_km?: number | null
          garantia_observacao?: string | null
          id?: string
          iniciado_em?: string
          km?: number | null
          modelo_descricao: string
          modelo_id?: string | null
          numero?: never
          observacoes?: string | null
          os_id?: string | null
          placa_carreta_1?: string | null
          placa_carreta_2?: string | null
          responsavel_id?: string | null
          setor?: string | null
          situacao?: Database["public"]["Enums"]["situacao_checklist"]
          tipo: Database["public"]["Enums"]["tipo_checklist"]
          updated_at?: string
          veiculo_id?: string | null
          versao: number
        }
        Update: {
          cliente_id?: string | null
          concluido_em?: string | null
          created_at?: string
          data_referencia?: string | null
          especialidade_id?: string | null
          garantia_dias?: number | null
          garantia_km?: number | null
          garantia_observacao?: string | null
          id?: string
          iniciado_em?: string
          km?: number | null
          modelo_descricao?: string
          modelo_id?: string | null
          numero?: never
          observacoes?: string | null
          os_id?: string | null
          placa_carreta_1?: string | null
          placa_carreta_2?: string | null
          responsavel_id?: string | null
          setor?: string | null
          situacao?: Database["public"]["Enums"]["situacao_checklist"]
          tipo?: Database["public"]["Enums"]["tipo_checklist"]
          updated_at?: string
          veiculo_id?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklists_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "checklists_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "checklist_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "checklists_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "checklists_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      cliente_contatos: {
        Row: {
          celular: string | null
          cliente_id: string
          created_at: string
          email: string | null
          id: string
          nome_setor: string
          ordem: number
          telefone: string | null
        }
        Insert: {
          celular?: string | null
          cliente_id: string
          created_at?: string
          email?: string | null
          id?: string
          nome_setor: string
          ordem?: number
          telefone?: string | null
        }
        Update: {
          celular?: string | null
          cliente_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nome_setor?: string
          ordem?: number
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      cliente_tags: {
        Row: {
          cliente_id: string
          tag_id: string
        }
        Insert: {
          cliente_id: string
          tag_id: string
        }
        Update: {
          cliente_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_tags_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_tags_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_tags_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "cliente_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro: string | null
          celular: string | null
          cep: string | null
          codigo: number
          complemento: string | null
          created_at: string
          criado_por: string | null
          documento: string | null
          documento_digitos: string | null
          email: string | null
          entrega_bairro: string | null
          entrega_cep: string | null
          entrega_complemento: string | null
          entrega_logradouro: string | null
          entrega_mesmo_endereco: boolean
          entrega_municipio: string | null
          entrega_numero: string | null
          entrega_uf: string | null
          id: string
          inscricao_estadual: string | null
          limite_credito: number | null
          logradouro: string | null
          municipio: string | null
          nascimento_fundacao: string | null
          nome_fantasia: string | null
          nome_razao: string
          notificar_email: boolean
          notificar_whatsapp: boolean
          numero: string | null
          observacao_credito: string | null
          observacoes: string | null
          omie_enviado_em: string | null
          omie_erro: string | null
          omie_id: string | null
          omie_sincronizado_em: string | null
          origem: Database["public"]["Enums"]["origem_registro"]
          sem_numero: boolean
          situacao: Database["public"]["Enums"]["situacao_registro"]
          telefone: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          codigo?: never
          complemento?: string | null
          created_at?: string
          criado_por?: string | null
          documento?: string | null
          documento_digitos?: string | null
          email?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_complemento?: string | null
          entrega_logradouro?: string | null
          entrega_mesmo_endereco?: boolean
          entrega_municipio?: string | null
          entrega_numero?: string | null
          entrega_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          limite_credito?: number | null
          logradouro?: string | null
          municipio?: string | null
          nascimento_fundacao?: string | null
          nome_fantasia?: string | null
          nome_razao: string
          notificar_email?: boolean
          notificar_whatsapp?: boolean
          numero?: string | null
          observacao_credito?: string | null
          observacoes?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          sem_numero?: boolean
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          codigo?: never
          complemento?: string | null
          created_at?: string
          criado_por?: string | null
          documento?: string | null
          documento_digitos?: string | null
          email?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_complemento?: string | null
          entrega_logradouro?: string | null
          entrega_mesmo_endereco?: boolean
          entrega_municipio?: string | null
          entrega_numero?: string | null
          entrega_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          limite_credito?: number | null
          logradouro?: string | null
          municipio?: string | null
          nascimento_fundacao?: string | null
          nome_fantasia?: string | null
          nome_razao?: string
          notificar_email?: boolean
          notificar_whatsapp?: boolean
          numero?: string | null
          observacao_credito?: string | null
          observacoes?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          sem_numero?: boolean
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      conflitos_sincronizacao: {
        Row: {
          created_at: string
          dados_externos: Json | null
          decisao: string | null
          entidade_local: string | null
          id: string
          identificador: string | null
          motivo: string
          provedor: string
          registro_local: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          sincronizacao_id: string | null
          tipo: Database["public"]["Enums"]["tipo_sincronizacao"]
        }
        Insert: {
          created_at?: string
          dados_externos?: Json | null
          decisao?: string | null
          entidade_local?: string | null
          id?: string
          identificador?: string | null
          motivo: string
          provedor?: string
          registro_local?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          sincronizacao_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_sincronizacao"]
        }
        Update: {
          created_at?: string
          dados_externos?: Json | null
          decisao?: string | null
          entidade_local?: string | null
          id?: string
          identificador?: string | null
          motivo?: string
          provedor?: string
          registro_local?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          sincronizacao_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sincronizacao"]
        }
        Relationships: [
          {
            foreignKeyName: "conflitos_sincronizacao_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflitos_sincronizacao_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflitos_sincronizacao_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflitos_sincronizacao_sincronizacao_id_fkey"
            columns: ["sincronizacao_id"]
            isOneToOne: false
            referencedRelation: "sincronizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      criterios_performance: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          descricao: string | null
          evento: Database["public"]["Enums"]["evento_performance"]
          id: string
          nome: string
          ordem: number
          origem: Database["public"]["Enums"]["origem_criterio"]
          pontos: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          descricao?: string | null
          evento?: Database["public"]["Enums"]["evento_performance"]
          id?: string
          nome: string
          ordem?: number
          origem?: Database["public"]["Enums"]["origem_criterio"]
          pontos?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          descricao?: string | null
          evento?: Database["public"]["Enums"]["evento_performance"]
          id?: string
          nome?: string
          ordem?: number
          origem?: Database["public"]["Enums"]["origem_criterio"]
          pontos?: number
          updated_at?: string
        }
        Relationships: []
      }
      dados_empresa: {
        Row: {
          bairro: string | null
          celular: string | null
          cep: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          logradouro: string | null
          municipio: string | null
          nome_fantasia: string | null
          numero: string | null
          politica_privacidade_url: string | null
          razao_social: string | null
          singleton: boolean
          site: string | null
          suporte_email: string | null
          suporte_nome: string | null
          suporte_telefone: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          politica_privacidade_url?: string | null
          razao_social?: string | null
          singleton?: boolean
          site?: string | null
          suporte_email?: string | null
          suporte_nome?: string | null
          suporte_telefone?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          politica_privacidade_url?: string | null
          razao_social?: string | null
          singleton?: boolean
          site?: string | null
          suporte_email?: string | null
          suporte_nome?: string | null
          suporte_telefone?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ebook_capitulos: {
        Row: {
          artigo_id: string
          ebook_id: string
          id: string
          ordem: number
        }
        Insert: {
          artigo_id: string
          ebook_id: string
          id?: string
          ordem?: number
        }
        Update: {
          artigo_id?: string
          ebook_id?: string
          id?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "ebook_capitulos_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "artigos_tecnicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebook_capitulos_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "vw_ebook_capitulos"
            referencedColumns: ["artigo_id"]
          },
          {
            foreignKeyName: "ebook_capitulos_ebook_id_fkey"
            columns: ["ebook_id"]
            isOneToOne: false
            referencedRelation: "ebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      ebooks: {
        Row: {
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          publicado_em: string | null
          situacao: Database["public"]["Enums"]["situacao_ebook"]
          subtitulo: string | null
          titulo: string
          updated_at: string
          versao: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          publicado_em?: string | null
          situacao?: Database["public"]["Enums"]["situacao_ebook"]
          subtitulo?: string | null
          titulo: string
          updated_at?: string
          versao?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          publicado_em?: string | null
          situacao?: Database["public"]["Enums"]["situacao_ebook"]
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_patio: {
        Row: {
          cliente_id: string
          condicao_entrada: string | null
          created_at: string
          entrada_em: string
          id: string
          justificativa_km: string | null
          km: number | null
          km_anterior: number | null
          km_inconsistente: boolean
          motorista_documento: string | null
          motorista_nome: string | null
          motorista_observacao: string | null
          motorista_telefone: string | null
          numero: number
          observacoes: string | null
          recebido_por: string | null
          saida_em: string | null
          situacao: Database["public"]["Enums"]["situacao_entrada"]
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          cliente_id: string
          condicao_entrada?: string | null
          created_at?: string
          entrada_em?: string
          id?: string
          justificativa_km?: string | null
          km?: number | null
          km_anterior?: number | null
          km_inconsistente?: boolean
          motorista_documento?: string | null
          motorista_nome?: string | null
          motorista_observacao?: string | null
          motorista_telefone?: string | null
          numero?: never
          observacoes?: string | null
          recebido_por?: string | null
          saida_em?: string | null
          situacao?: Database["public"]["Enums"]["situacao_entrada"]
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          cliente_id?: string
          condicao_entrada?: string | null
          created_at?: string
          entrada_em?: string
          id?: string
          justificativa_km?: string | null
          km?: number | null
          km_anterior?: number | null
          km_inconsistente?: boolean
          motorista_documento?: string | null
          motorista_nome?: string | null
          motorista_observacao?: string | null
          motorista_telefone?: string | null
          numero?: never
          observacoes?: string | null
          recebido_por?: string | null
          saida_em?: string | null
          situacao?: Database["public"]["Enums"]["situacao_entrada"]
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_patio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_patio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_patio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "entradas_patio_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_patio_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_patio_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_patio_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entradas_patio_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      especialidades: {
        Row: {
          created_at: string
          de_laboratorio: boolean
          descricao: string | null
          id: string
          nome: string
          situacao: Database["public"]["Enums"]["situacao_registro"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          de_laboratorio?: boolean
          descricao?: string | null
          id?: string
          nome: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          de_laboratorio?: boolean
          descricao?: string | null
          id?: string
          nome?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Relationships: []
      }
      estoque_movimentos: {
        Row: {
          created_at: string
          id: number
          motivo: string | null
          os_id: string | null
          produto_id: string
          quantidade: number
          saldo_anterior: number
          saldo_posterior: number
          tipo: Database["public"]["Enums"]["tipo_movimento_estoque"]
          usuario_id: string | null
          venda_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          motivo?: string | null
          os_id?: string | null
          produto_id: string
          quantidade: number
          saldo_anterior: number
          saldo_posterior: number
          tipo: Database["public"]["Enums"]["tipo_movimento_estoque"]
          usuario_id?: string | null
          venda_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          motivo?: string | null
          os_id?: string | null
          produto_id?: string
          quantidade?: number
          saldo_anterior?: number
          saldo_posterior?: number
          tipo?: Database["public"]["Enums"]["tipo_movimento_estoque"]
          usuario_id?: string | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_performance: {
        Row: {
          created_at: string
          criterio_id: string
          id: string
          motivo: string
          ocorrido_em: string
          pontos: number
          registrado_por: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          criterio_id: string
          id?: string
          motivo: string
          ocorrido_em?: string
          pontos: number
          registrado_por?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          criterio_id?: string
          id?: string
          motivo?: string
          ocorrido_em?: string
          pontos?: number
          registrado_por?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_performance_criterio_id_fkey"
            columns: ["criterio_id"]
            isOneToOne: false
            referencedRelation: "criterios_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_performance_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_performance_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_performance_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_performance_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_performance_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_performance_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_veiculo: {
        Row: {
          cliente_id: string | null
          created_at: string
          descricao: string | null
          id: string
          km: number | null
          ocorrido_em: string
          referencia_id: string | null
          referencia_tabela: string | null
          registrado_por: string | null
          tipo: string
          titulo: string
          veiculo_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          km?: number | null
          ocorrido_em?: string
          referencia_id?: string | null
          referencia_tabela?: string | null
          registrado_por?: string | null
          tipo: string
          titulo: string
          veiculo_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          km?: number | null
          ocorrido_em?: string
          referencia_id?: string | null
          referencia_tabela?: string | null
          registrado_por?: string | null
          tipo?: string
          titulo?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_veiculo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_veiculo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_veiculo_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "eventos_veiculo_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_veiculo_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_veiculo_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      evidencias: {
        Row: {
          caminho: string
          categoria: string | null
          contexto: Json | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          entidade: string
          entidade_id: string
          id: string
          nome_arquivo: string | null
          tamanho_bytes: number | null
          tipo: Database["public"]["Enums"]["tipo_evidencia"]
        }
        Insert: {
          caminho: string
          categoria?: string | null
          contexto?: Json | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          entidade: string
          entidade_id: string
          id?: string
          nome_arquivo?: string | null
          tamanho_bytes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_evidencia"]
        }
        Update: {
          caminho?: string
          categoria?: string | null
          contexto?: Json | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          entidade?: string
          entidade_id?: string
          id?: string
          nome_arquivo?: string | null
          tamanho_bytes?: number | null
          tipo?: Database["public"]["Enums"]["tipo_evidencia"]
        }
        Relationships: [
          {
            foreignKeyName: "evidencias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidencias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidencias_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      fatura_parcelas: {
        Row: {
          fatura_id: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          id: string
          numero: number
          observacao: string | null
          pago_em: string | null
          valor: number
          vencimento: string
        }
        Insert: {
          fatura_id: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          numero: number
          observacao?: string | null
          pago_em?: string | null
          valor: number
          vencimento: string
        }
        Update: {
          fatura_id?: string
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          numero?: number
          observacao?: string | null
          pago_em?: string | null
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "fatura_parcelas_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas: {
        Row: {
          cliente_id: string | null
          condicao: string
          created_at: string
          emitida_em: string
          emitida_por: string | null
          id: string
          numero: number
          observacoes: string | null
          os_id: string
          valor_total: number
        }
        Insert: {
          cliente_id?: string | null
          condicao: string
          created_at?: string
          emitida_em?: string
          emitida_por?: string | null
          id?: string
          numero?: never
          observacoes?: string | null
          os_id: string
          valor_total: number
        }
        Update: {
          cliente_id?: string | null
          condicao?: string
          created_at?: string
          emitida_em?: string
          emitida_por?: string | null
          id?: string
          numero?: never
          observacoes?: string | null
          os_id?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "faturas_emitida_por_fkey"
            columns: ["emitida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_emitida_por_fkey"
            columns: ["emitida_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_emitida_por_fkey"
            columns: ["emitida_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "faturas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          cliente_id: string
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          criado_por: string | null
          data: string
          id: string
          interacao_id: string | null
          observacao: string | null
          prioridade: Database["public"]["Enums"]["prioridade_acao"]
          proxima_acao: string
          responsavel_id: string | null
          resultado: string | null
          situacao: Database["public"]["Enums"]["situacao_follow_up"]
          updated_at: string
        }
        Insert: {
          cliente_id: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          criado_por?: string | null
          data: string
          id?: string
          interacao_id?: string | null
          observacao?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_acao"]
          proxima_acao: string
          responsavel_id?: string | null
          resultado?: string | null
          situacao?: Database["public"]["Enums"]["situacao_follow_up"]
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          interacao_id?: string | null
          observacao?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade_acao"]
          proxima_acao?: string
          responsavel_id?: string | null
          resultado?: string | null
          situacao?: Database["public"]["Enums"]["situacao_follow_up"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "follow_ups_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "interacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          bairro: string | null
          cep: string | null
          codigo: number
          complemento: string | null
          created_at: string
          descricao: string
          documento: string | null
          documento_digitos: string | null
          email: string | null
          id: string
          inscricao_estadual: string | null
          logradouro: string | null
          municipio: string | null
          nome_fantasia: string | null
          numero: string | null
          observacoes: string | null
          omie_enviado_em: string | null
          omie_erro: string | null
          omie_id: string | null
          omie_sincronizado_em: string | null
          origem: Database["public"]["Enums"]["origem_registro"]
          situacao: Database["public"]["Enums"]["situacao_registro"]
          telefone1: string | null
          telefone2: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          codigo?: never
          complemento?: string | null
          created_at?: string
          descricao: string
          documento?: string | null
          documento_digitos?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          telefone1?: string | null
          telefone2?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          codigo?: never
          complemento?: string | null
          created_at?: string
          descricao?: string
          documento?: string | null
          documento_digitos?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          telefone1?: string | null
          telefone2?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      funcoes: {
        Row: {
          atua_como_mecanico: boolean
          atua_no_laboratorio: boolean
          created_at: string
          descricao: string | null
          id: string
          is_system: boolean
          nome: string
          situacao: Database["public"]["Enums"]["situacao_registro"]
          updated_at: string
        }
        Insert: {
          atua_como_mecanico?: boolean
          atua_no_laboratorio?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          is_system?: boolean
          nome: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Update: {
          atua_como_mecanico?: boolean
          atua_no_laboratorio?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          is_system?: boolean
          nome?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Relationships: []
      }
      garantias: {
        Row: {
          cliente_id: string
          created_at: string
          criada_por: string | null
          descricao_item: string
          fim: string | null
          id: string
          inicio: string
          km_inicial: number | null
          km_limite: number | null
          numero: number
          observacoes: string | null
          os_id: string | null
          os_produto_id: string | null
          os_servico_id: string | null
          politica: string | null
          produto_id: string | null
          servico_id: string | null
          situacao: Database["public"]["Enums"]["situacao_garantia"]
          tipo_item: Database["public"]["Enums"]["tipo_item_garantia"]
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          criada_por?: string | null
          descricao_item: string
          fim?: string | null
          id?: string
          inicio?: string
          km_inicial?: number | null
          km_limite?: number | null
          numero?: never
          observacoes?: string | null
          os_id?: string | null
          os_produto_id?: string | null
          os_servico_id?: string | null
          politica?: string | null
          produto_id?: string | null
          servico_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_garantia"]
          tipo_item: Database["public"]["Enums"]["tipo_item_garantia"]
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          criada_por?: string | null
          descricao_item?: string
          fim?: string | null
          id?: string
          inicio?: string
          km_inicial?: number | null
          km_limite?: number | null
          numero?: never
          observacoes?: string | null
          os_id?: string | null
          os_produto_id?: string | null
          os_servico_id?: string | null
          politica?: string | null
          produto_id?: string | null
          servico_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_garantia"]
          tipo_item?: Database["public"]["Enums"]["tipo_item_garantia"]
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "garantias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "garantias_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "garantias_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "garantias_os_produto_id_fkey"
            columns: ["os_produto_id"]
            isOneToOne: false
            referencedRelation: "os_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_os_servico_id_fkey"
            columns: ["os_servico_id"]
            isOneToOne: false
            referencedRelation: "os_servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "garantias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      ia_aprendizados: {
        Row: {
          artigo_id: string | null
          created_at: string
          criado_por: string | null
          id: string
          mensagem_id: string
          motivo_descarte: string | null
          situacao: string
        }
        Insert: {
          artigo_id?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          mensagem_id: string
          motivo_descarte?: string | null
          situacao?: string
        }
        Update: {
          artigo_id?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          mensagem_id?: string
          motivo_descarte?: string | null
          situacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_aprendizados_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "artigos_tecnicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_aprendizados_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "vw_ebook_capitulos"
            referencedColumns: ["artigo_id"]
          },
          {
            foreignKeyName: "ia_aprendizados_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_aprendizados_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_aprendizados_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_aprendizados_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: true
            referencedRelation: "ia_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_config: {
        Row: {
          aprendizado_ativo: boolean
          artigos_contexto: number
          exige_revisao: boolean
          id: boolean
          instrucoes_extra: string | null
          max_tokens: number
          modelo: string
          provedor: string
          updated_at: string
          updated_por: string | null
        }
        Insert: {
          aprendizado_ativo?: boolean
          artigos_contexto?: number
          exige_revisao?: boolean
          id?: boolean
          instrucoes_extra?: string | null
          max_tokens?: number
          modelo?: string
          provedor?: string
          updated_at?: string
          updated_por?: string | null
        }
        Update: {
          aprendizado_ativo?: boolean
          artigos_contexto?: number
          exige_revisao?: boolean
          id?: boolean
          instrucoes_extra?: string | null
          max_tokens?: number
          modelo?: string
          provedor?: string
          updated_at?: string
          updated_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_config_updated_por_fkey"
            columns: ["updated_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_config_updated_por_fkey"
            columns: ["updated_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_config_updated_por_fkey"
            columns: ["updated_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_conversas: {
        Row: {
          arquivada: boolean
          cliente_id: string | null
          created_at: string
          id: string
          os_id: string | null
          titulo: string
          updated_at: string
          usuario_id: string | null
          veiculo_id: string | null
        }
        Insert: {
          arquivada?: boolean
          cliente_id?: string | null
          created_at?: string
          id?: string
          os_id?: string | null
          titulo?: string
          updated_at?: string
          usuario_id?: string | null
          veiculo_id?: string | null
        }
        Update: {
          arquivada?: boolean
          cliente_id?: string | null
          created_at?: string
          id?: string
          os_id?: string | null
          titulo?: string
          updated_at?: string
          usuario_id?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "ia_conversas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "ia_conversas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "ia_conversas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_conversas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      ia_dominios: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
          nome: string
          ordem: number
          termos: string[]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
          nome: string
          ordem?: number
          termos?: string[]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
          nome?: string
          ordem?: number
          termos?: string[]
        }
        Relationships: []
      }
      ia_equipamentos: {
        Row: {
          ativo: boolean
          cobertura: string[]
          created_at: string
          descricao: string
          fabricante: string | null
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          cobertura?: string[]
          created_at?: string
          descricao: string
          fabricante?: string | null
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          cobertura?: string[]
          created_at?: string
          descricao?: string
          fabricante?: string | null
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      ia_feedback: {
        Row: {
          comentario: string | null
          created_at: string
          mensagem_id: string
          usuario_id: string
          util: boolean
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          mensagem_id: string
          usuario_id: string
          util: boolean
        }
        Update: {
          comentario?: string | null
          created_at?: string
          mensagem_id?: string
          usuario_id?: string
          util?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ia_feedback_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "ia_mensagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_feedback_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_feedback_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_feedback_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_fontes: {
        Row: {
          artigo_id: string | null
          created_at: string
          id: string
          mensagem_id: string
          titulo: string
          versao: number | null
        }
        Insert: {
          artigo_id?: string | null
          created_at?: string
          id?: string
          mensagem_id: string
          titulo: string
          versao?: number | null
        }
        Update: {
          artigo_id?: string | null
          created_at?: string
          id?: string
          mensagem_id?: string
          titulo?: string
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_fontes_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "artigos_tecnicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_fontes_artigo_id_fkey"
            columns: ["artigo_id"]
            isOneToOne: false
            referencedRelation: "vw_ebook_capitulos"
            referencedColumns: ["artigo_id"]
          },
          {
            foreignKeyName: "ia_fontes_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "ia_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_mensagens: {
        Row: {
          anexos: Json | null
          avaliado_em: string | null
          avaliado_por: string | null
          conteudo: string
          conversa_id: string
          created_at: string
          erro: string | null
          estruturado: Json | null
          fora_do_escopo: boolean
          id: string
          modelo: string | null
          papel: Database["public"]["Enums"]["papel_mensagem"]
          sem_fonte: boolean
          tokens_entrada: number | null
          tokens_saida: number | null
          transcricao: string | null
          util: boolean | null
        }
        Insert: {
          anexos?: Json | null
          avaliado_em?: string | null
          avaliado_por?: string | null
          conteudo?: string
          conversa_id: string
          created_at?: string
          erro?: string | null
          estruturado?: Json | null
          fora_do_escopo?: boolean
          id?: string
          modelo?: string | null
          papel: Database["public"]["Enums"]["papel_mensagem"]
          sem_fonte?: boolean
          tokens_entrada?: number | null
          tokens_saida?: number | null
          transcricao?: string | null
          util?: boolean | null
        }
        Update: {
          anexos?: Json | null
          avaliado_em?: string | null
          avaliado_por?: string | null
          conteudo?: string
          conversa_id?: string
          created_at?: string
          erro?: string | null
          estruturado?: Json | null
          fora_do_escopo?: boolean
          id?: string
          modelo?: string | null
          papel?: Database["public"]["Enums"]["papel_mensagem"]
          sem_fonte?: boolean
          tokens_entrada?: number | null
          tokens_saida?: number | null
          transcricao?: string | null
          util?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_mensagens_avaliado_por_fkey"
            columns: ["avaliado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_mensagens_avaliado_por_fkey"
            columns: ["avaliado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_mensagens_avaliado_por_fkey"
            columns: ["avaliado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "ia_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes: {
        Row: {
          ambiente: string
          app_key: string | null
          app_secret: string | null
          ativa: boolean
          configurado_por: string | null
          created_at: string
          id: string
          provedor: string
          status: Database["public"]["Enums"]["status_integracao"]
          ultima_conexao_em: string | null
          ultimo_erro: string | null
          updated_at: string
        }
        Insert: {
          ambiente?: string
          app_key?: string | null
          app_secret?: string | null
          ativa?: boolean
          configurado_por?: string | null
          created_at?: string
          id?: string
          provedor: string
          status?: Database["public"]["Enums"]["status_integracao"]
          ultima_conexao_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string
          app_key?: string | null
          app_secret?: string | null
          ativa?: boolean
          configurado_por?: string | null
          created_at?: string
          id?: string
          provedor?: string
          status?: Database["public"]["Enums"]["status_integracao"]
          ultima_conexao_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracoes_configurado_por_fkey"
            columns: ["configurado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracoes_configurado_por_fkey"
            columns: ["configurado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracoes_configurado_por_fkey"
            columns: ["configurado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes: {
        Row: {
          assunto: string
          cliente_id: string
          contato_id: string | null
          created_at: string
          descricao: string | null
          id: string
          ocorrida_em: string
          os_id: string | null
          responsavel_id: string | null
          tipo: Database["public"]["Enums"]["tipo_interacao"]
        }
        Insert: {
          assunto: string
          cliente_id: string
          contato_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ocorrida_em?: string
          os_id?: string | null
          responsavel_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_interacao"]
        }
        Update: {
          assunto?: string
          cliente_id?: string
          contato_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          ocorrida_em?: string
          os_id?: string | null
          responsavel_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_interacao"]
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "interacoes_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "cliente_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "interacoes_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "interacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      push_inscricoes: {
        Row: {
          agente: string | null
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          agente?: string | null
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          agente?: string | null
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string
          dispensada_em: string | null
          id: string
          lida_em: string | null
          link: string | null
          mensagem: string | null
          tipo: Database["public"]["Enums"]["tipo_notificacao"]
          titulo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dispensada_em?: string | null
          id?: string
          lida_em?: string | null
          link?: string | null
          mensagem?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacao"]
          titulo: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          dispensada_em?: string | null
          id?: string
          lida_em?: string | null
          link?: string | null
          mensagem?: string | null
          tipo?: Database["public"]["Enums"]["tipo_notificacao"]
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          aberta_em: string
          aberta_por: string | null
          acrescimo: number
          cliente_id: string
          condicao_pagamento: string | null
          created_at: string
          desconto: number
          diagnostico: string | null
          encerrada_em: string | null
          encerrada_por: string | null
          entrada_id: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          id: string
          km: number | null
          numero: number
          observacao_pagamento: string | null
          observacoes: string | null
          pago_em: string | null
          parcelas: number | null
          previsao_em: string | null
          prioridade: number
          problema_alegado: string | null
          recibo_numero: number | null
          saida_em: string | null
          saida_por: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          status_alterado_em: string
          status_id: string | null
          tipo: Database["public"]["Enums"]["tipo_os"]
          updated_at: string
          valor_pago: number
          valor_produtos: number
          valor_servicos: number
          valor_total: number
          veiculo_id: string
        }
        Insert: {
          aberta_em?: string
          aberta_por?: string | null
          acrescimo?: number
          cliente_id: string
          condicao_pagamento?: string | null
          created_at?: string
          desconto?: number
          diagnostico?: string | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          entrada_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          km?: number | null
          numero?: never
          observacao_pagamento?: string | null
          observacoes?: string | null
          pago_em?: string | null
          parcelas?: number | null
          previsao_em?: string | null
          prioridade?: number
          problema_alegado?: string | null
          recibo_numero?: number | null
          saida_em?: string | null
          saida_por?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          status_alterado_em?: string
          status_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_os"]
          updated_at?: string
          valor_pago?: number
          valor_produtos?: number
          valor_servicos?: number
          valor_total?: number
          veiculo_id: string
        }
        Update: {
          aberta_em?: string
          aberta_por?: string | null
          acrescimo?: number
          cliente_id?: string
          condicao_pagamento?: string | null
          created_at?: string
          desconto?: number
          diagnostico?: string | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          entrada_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          km?: number | null
          numero?: never
          observacao_pagamento?: string | null
          observacoes?: string | null
          pago_em?: string | null
          parcelas?: number | null
          previsao_em?: string | null
          prioridade?: number
          problema_alegado?: string | null
          recibo_numero?: number | null
          saida_em?: string | null
          saida_por?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          status_alterado_em?: string
          status_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_os"]
          updated_at?: string
          valor_pago?: number
          valor_produtos?: number
          valor_servicos?: number
          valor_total?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_aberta_por_fkey"
            columns: ["aberta_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_aberta_por_fkey"
            columns: ["aberta_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_aberta_por_fkey"
            columns: ["aberta_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "ordens_servico_encerrada_por_fkey"
            columns: ["encerrada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_encerrada_por_fkey"
            columns: ["encerrada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_encerrada_por_fkey"
            columns: ["encerrada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_entrada_id_fkey"
            columns: ["entrada_id"]
            isOneToOne: false
            referencedRelation: "entradas_patio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_saida_por_fkey"
            columns: ["saida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_saida_por_fkey"
            columns: ["saida_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_saida_por_fkey"
            columns: ["saida_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "status_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["status_id"]
          },
          {
            foreignKeyName: "ordens_servico_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      os_apontamentos: {
        Row: {
          concluido_em: string | null
          created_at: string
          id: string
          iniciado_em: string
          motivo_pausa: string | null
          observacao: string | null
          os_id: string
          pausado_em: string | null
          segundos_pausa: number
          situacao: Database["public"]["Enums"]["situacao_apontamento"]
          updated_at: string
          usuario_id: string
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          id?: string
          iniciado_em?: string
          motivo_pausa?: string | null
          observacao?: string | null
          os_id: string
          pausado_em?: string | null
          segundos_pausa?: number
          situacao?: Database["public"]["Enums"]["situacao_apontamento"]
          updated_at?: string
          usuario_id: string
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          id?: string
          iniciado_em?: string
          motivo_pausa?: string | null
          observacao?: string | null
          os_id?: string
          pausado_em?: string | null
          segundos_pausa?: number
          situacao?: Database["public"]["Enums"]["situacao_apontamento"]
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_apontamentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_apontamentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_apontamentos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_apontamentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_apontamentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_apontamentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      os_eventos: {
        Row: {
          dados: Json | null
          descricao: string | null
          id: string
          ocorrido_em: string
          os_id: string
          tipo: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          dados?: Json | null
          descricao?: string | null
          id?: string
          ocorrido_em?: string
          os_id: string
          tipo: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          dados?: Json | null
          descricao?: string | null
          id?: string
          ocorrido_em?: string
          os_id?: string
          tipo?: string
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_eventos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_eventos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_eventos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      os_mecanicos: {
        Row: {
          atribuido_em: string
          especialidade_id: string | null
          os_id: string
          principal: boolean
          usuario_id: string
        }
        Insert: {
          atribuido_em?: string
          especialidade_id?: string | null
          os_id: string
          principal?: boolean
          usuario_id: string
        }
        Update: {
          atribuido_em?: string
          especialidade_id?: string | null
          os_id?: string
          principal?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_mecanicos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mecanicos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mecanicos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_mecanicos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_mecanicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mecanicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mecanicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      os_produtos: {
        Row: {
          aprovacao: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em: string | null
          aprovado_por: string | null
          codigo: string | null
          created_at: string
          desconto: number
          descricao: string
          estado: Database["public"]["Enums"]["estado_produto_os"]
          id: string
          ordem: number
          os_id: string
          produto_id: string | null
          quantidade: number
          situacao: Database["public"]["Enums"]["situacao_item"]
          unidade: string
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          aprovacao?: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em?: string | null
          aprovado_por?: string | null
          codigo?: string | null
          created_at?: string
          desconto?: number
          descricao: string
          estado?: Database["public"]["Enums"]["estado_produto_os"]
          id?: string
          ordem?: number
          os_id: string
          produto_id?: string | null
          quantidade?: number
          situacao?: Database["public"]["Enums"]["situacao_item"]
          unidade?: string
          valor_total?: number | null
          valor_unitario?: number
        }
        Update: {
          aprovacao?: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em?: string | null
          aprovado_por?: string | null
          codigo?: string | null
          created_at?: string
          desconto?: number
          descricao?: string
          estado?: Database["public"]["Enums"]["estado_produto_os"]
          id?: string
          ordem?: number
          os_id?: string
          produto_id?: string | null
          quantidade?: number
          situacao?: Database["public"]["Enums"]["situacao_item"]
          unidade?: string
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_produtos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_produtos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_produtos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_produtos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_produtos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_produtos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_produtos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      os_servicos: {
        Row: {
          aprovacao: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em: string | null
          aprovado_por: string | null
          codigo: string | null
          created_at: string
          desconto: number
          descricao: string
          id: string
          ordem: number
          os_id: string
          quantidade: number
          servico_id: string | null
          situacao: Database["public"]["Enums"]["situacao_item"]
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          aprovacao?: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em?: string | null
          aprovado_por?: string | null
          codigo?: string | null
          created_at?: string
          desconto?: number
          descricao: string
          id?: string
          ordem?: number
          os_id: string
          quantidade?: number
          servico_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_item"]
          valor_total?: number | null
          valor_unitario?: number
        }
        Update: {
          aprovacao?: Database["public"]["Enums"]["situacao_aprovacao"]
          aprovado_em?: string | null
          aprovado_por?: string | null
          codigo?: string | null
          created_at?: string
          desconto?: number
          descricao?: string
          id?: string
          ordem?: number
          os_id?: string
          quantidade?: number
          servico_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_item"]
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_servicos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_servicos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_servicos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_servicos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_servicos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_servicos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_servicos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      os_tags: {
        Row: {
          os_id: string
          tag_id: string
        }
        Insert: {
          os_id: string
          tag_id: string
        }
        Update: {
          os_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_tags_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_tags_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_tags_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "os_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          atualizado_por: string | null
          chave: string
          descricao: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          atualizado_por?: string | null
          chave: string
          descricao?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          atualizado_por?: string | null
          chave?: string
          descricao?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "parametros_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametros_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametros_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      pecas_teste: {
        Row: {
          cliente_id: string
          created_at: string
          descricao: string | null
          entrada_em: string
          entregue_em: string | null
          especialidade_id: string | null
          fabricante: string | null
          id: string
          laudo: string | null
          mecanico_id: string | null
          numero_serie: string | null
          observacao: string | null
          os_id: string | null
          peca: string
          prazo_em: string | null
          protocolo: string
          quantidade: number
          recebido_por: string | null
          sla_horas: number
          status: Database["public"]["Enums"]["status_peca_teste"]
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descricao?: string | null
          entrada_em?: string
          entregue_em?: string | null
          especialidade_id?: string | null
          fabricante?: string | null
          id?: string
          laudo?: string | null
          mecanico_id?: string | null
          numero_serie?: string | null
          observacao?: string | null
          os_id?: string | null
          peca: string
          prazo_em?: string | null
          protocolo?: string
          quantidade?: number
          recebido_por?: string | null
          sla_horas?: number
          status?: Database["public"]["Enums"]["status_peca_teste"]
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descricao?: string | null
          entrada_em?: string
          entregue_em?: string | null
          especialidade_id?: string | null
          fabricante?: string | null
          id?: string
          laudo?: string | null
          mecanico_id?: string | null
          numero_serie?: string | null
          observacao?: string | null
          os_id?: string | null
          peca?: string
          prazo_em?: string | null
          protocolo?: string
          quantidade?: number
          recebido_por?: string | null
          sla_horas?: number
          status?: Database["public"]["Enums"]["status_peca_teste"]
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pecas_teste_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "pecas_teste_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_mecanico_id_fkey"
            columns: ["mecanico_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_mecanico_id_fkey"
            columns: ["mecanico_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_mecanico_id_fkey"
            columns: ["mecanico_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "pecas_teste_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "pecas_teste_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_recebido_por_fkey"
            columns: ["recebido_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      pecas_teste_eventos: {
        Row: {
          id: string
          observacao: string | null
          ocorrido_em: string
          peca_id: string
          status: Database["public"]["Enums"]["status_peca_teste"]
          usuario_id: string | null
        }
        Insert: {
          id?: string
          observacao?: string | null
          ocorrido_em?: string
          peca_id: string
          status: Database["public"]["Enums"]["status_peca_teste"]
          usuario_id?: string | null
        }
        Update: {
          id?: string
          observacao?: string | null
          ocorrido_em?: string
          peca_id?: string
          status?: Database["public"]["Enums"]["status_peca_teste"]
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pecas_teste_eventos_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas_teste"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pecas_teste_eventos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_permissoes: {
        Row: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          perfil_id: string
          recurso: string
        }
        Insert: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          perfil_id: string
          recurso: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["acao_permissao"]
          perfil_id?: string
          recurso?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_permissoes_recurso_fkey"
            columns: ["recurso"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["chave"]
          },
        ]
      }
      perfis_acesso: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          is_system: boolean
          nome: string
          situacao: Database["public"]["Enums"]["situacao_registro"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          is_system?: boolean
          nome: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          is_system?: boolean
          nome?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          bloqueado: boolean
          codigo: string
          created_at: string
          custo_medio: number | null
          descricao: string
          descricao_detalhada: string | null
          ean: string | null
          estoque_minimo: number
          familia: string | null
          fisico: number | null
          fornecedor_id: string | null
          id: string
          localizacao: string | null
          marca: string | null
          modelo: string | null
          ncm: string | null
          observacoes: string | null
          observacoes_internas: string | null
          omie_enviado_em: string | null
          omie_erro: string | null
          omie_familia_id: string | null
          omie_id: string | null
          omie_local_estoque: string | null
          omie_sincronizado_em: string | null
          origem: Database["public"]["Enums"]["origem_registro"]
          pendente: number | null
          peso_bruto: number | null
          peso_liquido: number | null
          preco_custo: number | null
          preco_venda: number
          referencia: string | null
          reservado: number
          saldo: number
          situacao: Database["public"]["Enums"]["situacao_registro"]
          tipo_item: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          bloqueado?: boolean
          codigo: string
          created_at?: string
          custo_medio?: number | null
          descricao: string
          descricao_detalhada?: string | null
          ean?: string | null
          estoque_minimo?: number
          familia?: string | null
          fisico?: number | null
          fornecedor_id?: string | null
          id?: string
          localizacao?: string | null
          marca?: string | null
          modelo?: string | null
          ncm?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_familia_id?: string | null
          omie_id?: string | null
          omie_local_estoque?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          pendente?: number | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco_custo?: number | null
          preco_venda?: number
          referencia?: string | null
          reservado?: number
          saldo?: number
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tipo_item?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          bloqueado?: boolean
          codigo?: string
          created_at?: string
          custo_medio?: number | null
          descricao?: string
          descricao_detalhada?: string | null
          ean?: string | null
          estoque_minimo?: number
          familia?: string | null
          fisico?: number | null
          fornecedor_id?: string | null
          id?: string
          localizacao?: string | null
          marca?: string | null
          modelo?: string | null
          ncm?: string | null
          observacoes?: string | null
          observacoes_internas?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_familia_id?: string | null
          omie_id?: string | null
          omie_local_estoque?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          pendente?: number | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco_custo?: number | null
          preco_venda?: number
          referencia?: string | null
          reservado?: number
          saldo?: number
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tipo_item?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      recursos: {
        Row: {
          acoes: Database["public"]["Enums"]["acao_permissao"][]
          chave: string
          grupo: string
          nome: string
          ordem: number
        }
        Insert: {
          acoes: Database["public"]["Enums"]["acao_permissao"][]
          chave: string
          grupo: string
          nome: string
          ordem?: number
        }
        Update: {
          acoes?: Database["public"]["Enums"]["acao_permissao"][]
          chave?: string
          grupo?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      retornos: {
        Row: {
          analise: string | null
          cliente_id: string
          concluido_em: string | null
          created_at: string
          data_retorno: string
          decisao: Database["public"]["Enums"]["decisao_retorno"]
          descricao: string | null
          garantia_id: string | null
          id: string
          km: number | null
          motivo: string
          numero: number
          os_origem_id: string | null
          os_retorno_id: string | null
          responsavel_id: string | null
          situacao: Database["public"]["Enums"]["situacao_retorno"]
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          analise?: string | null
          cliente_id: string
          concluido_em?: string | null
          created_at?: string
          data_retorno?: string
          decisao?: Database["public"]["Enums"]["decisao_retorno"]
          descricao?: string | null
          garantia_id?: string | null
          id?: string
          km?: number | null
          motivo: string
          numero?: never
          os_origem_id?: string | null
          os_retorno_id?: string | null
          responsavel_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_retorno"]
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          analise?: string | null
          cliente_id?: string
          concluido_em?: string | null
          created_at?: string
          data_retorno?: string
          decisao?: Database["public"]["Enums"]["decisao_retorno"]
          descricao?: string | null
          garantia_id?: string | null
          id?: string
          km?: number | null
          motivo?: string
          numero?: never
          os_origem_id?: string | null
          os_retorno_id?: string | null
          responsavel_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_retorno"]
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retornos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "retornos_garantia_id_fkey"
            columns: ["garantia_id"]
            isOneToOne: false
            referencedRelation: "garantias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_os_origem_id_fkey"
            columns: ["os_origem_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_os_origem_id_fkey"
            columns: ["os_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "retornos_os_origem_id_fkey"
            columns: ["os_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "retornos_os_retorno_id_fkey"
            columns: ["os_retorno_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_os_retorno_id_fkey"
            columns: ["os_retorno_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "retornos_os_retorno_id_fkey"
            columns: ["os_retorno_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "retornos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retornos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      servicos: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          especialidade_id: string | null
          id: string
          observacoes: string | null
          omie_enviado_em: string | null
          omie_erro: string | null
          omie_id: string | null
          omie_sincronizado_em: string | null
          origem: Database["public"]["Enums"]["origem_registro"]
          situacao: Database["public"]["Enums"]["situacao_registro"]
          tempo_estimado_min: number | null
          updated_at: string
          valor_padrao: number
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
          especialidade_id?: string | null
          id?: string
          observacoes?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tempo_estimado_min?: number | null
          updated_at?: string
          valor_padrao?: number
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          especialidade_id?: string | null
          id?: string
          observacoes?: string | null
          omie_enviado_em?: string | null
          omie_erro?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tempo_estimado_min?: number | null
          updated_at?: string
          valor_padrao?: number
        }
        Relationships: [
          {
            foreignKeyName: "servicos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      sincronizacoes: {
        Row: {
          atualizados: number
          created_at: string
          executada_por: string | null
          falhas: number
          finalizada_em: string | null
          id: string
          iniciada_em: string
          mensagem: string | null
          novos: number
          processados: number
          provedor: string
          resultado: Database["public"]["Enums"]["resultado_sincronizacao"]
          tipo: Database["public"]["Enums"]["tipo_sincronizacao"]
        }
        Insert: {
          atualizados?: number
          created_at?: string
          executada_por?: string | null
          falhas?: number
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          mensagem?: string | null
          novos?: number
          processados?: number
          provedor?: string
          resultado?: Database["public"]["Enums"]["resultado_sincronizacao"]
          tipo: Database["public"]["Enums"]["tipo_sincronizacao"]
        }
        Update: {
          atualizados?: number
          created_at?: string
          executada_por?: string | null
          falhas?: number
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          mensagem?: string | null
          novos?: number
          processados?: number
          provedor?: string
          resultado?: Database["public"]["Enums"]["resultado_sincronizacao"]
          tipo?: Database["public"]["Enums"]["tipo_sincronizacao"]
        }
        Relationships: [
          {
            foreignKeyName: "sincronizacoes_executada_por_fkey"
            columns: ["executada_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sincronizacoes_executada_por_fkey"
            columns: ["executada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sincronizacoes_executada_por_fkey"
            columns: ["executada_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      status_os: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_status_os"]
          conta_no_patio: boolean
          cor: string
          created_at: string
          descricao: string | null
          id: string
          is_final: boolean
          is_system: boolean
          nome: string
          ordem: number
          situacao: Database["public"]["Enums"]["situacao_registro"]
          updated_at: string
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_status_os"]
          conta_no_patio?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          is_final?: boolean
          is_system?: boolean
          nome: string
          ordem?: number
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_status_os"]
          conta_no_patio?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          is_final?: boolean
          is_system?: boolean
          nome?: string
          ordem?: number
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          cor: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          situacao: Database["public"]["Enums"]["situacao_registro"]
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          updated_at?: string
        }
        Relationships: []
      }
      termos_recusa: {
        Row: {
          assinado_em: string | null
          cliente_id: string
          created_at: string
          defeito: string
          defeito_id: string | null
          id: string
          item_recusado: string | null
          km: number | null
          numero: number
          os_id: string | null
          recomendacao: string | null
          responsavel_id: string | null
          risco: string | null
          snapshot: Json | null
          updated_at: string
          veiculo_id: string | null
        }
        Insert: {
          assinado_em?: string | null
          cliente_id: string
          created_at?: string
          defeito: string
          defeito_id?: string | null
          id?: string
          item_recusado?: string | null
          km?: number | null
          numero?: never
          os_id?: string | null
          recomendacao?: string | null
          responsavel_id?: string | null
          risco?: string | null
          snapshot?: Json | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Update: {
          assinado_em?: string | null
          cliente_id?: string
          created_at?: string
          defeito?: string
          defeito_id?: string | null
          id?: string
          item_recusado?: string | null
          km?: number | null
          numero?: never
          os_id?: string | null
          recomendacao?: string | null
          responsavel_id?: string | null
          risco?: string | null
          snapshot?: Json | null
          updated_at?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termos_recusa_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "termos_recusa_defeito_id_fkey"
            columns: ["defeito_id"]
            isOneToOne: false
            referencedRelation: "checklist_defeitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_minhas_tarefas"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "termos_recusa_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["os_id"]
          },
          {
            foreignKeyName: "termos_recusa_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_recusa_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      usuario_especialidades: {
        Row: {
          created_at: string
          especialidade_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          especialidade_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          especialidade_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_especialidades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_especialidades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_especialidades_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_permissoes: {
        Row: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          concedida: boolean
          created_at: string
          motivo: string | null
          recurso: string
          usuario_id: string
        }
        Insert: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          concedida: boolean
          created_at?: string
          motivo?: string | null
          recurso: string
          usuario_id: string
        }
        Update: {
          acao?: Database["public"]["Enums"]["acao_permissao"]
          concedida?: boolean
          created_at?: string
          motivo?: string | null
          recurso?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_permissoes_recurso_fkey"
            columns: ["recurso"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["chave"]
          },
          {
            foreignKeyName: "usuario_permissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_permissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          funcao_id: string | null
          id: string
          is_admin: boolean
          nome_completo: string
          perfil_id: string | null
          situacao: Database["public"]["Enums"]["situacao_usuario"]
          telefone: string | null
          tema: Database["public"]["Enums"]["tema_interface"]
          ultimo_acesso_em: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          funcao_id?: string | null
          id: string
          is_admin?: boolean
          nome_completo: string
          perfil_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_usuario"]
          telefone?: string | null
          tema?: Database["public"]["Enums"]["tema_interface"]
          ultimo_acesso_em?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          funcao_id?: string | null
          id?: string
          is_admin?: boolean
          nome_completo?: string
          perfil_id?: string | null
          situacao?: Database["public"]["Enums"]["situacao_usuario"]
          telefone?: string | null
          tema?: Database["public"]["Enums"]["tema_interface"]
          ultimo_acesso_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculo_proprietarios: {
        Row: {
          cliente_id: string | null
          fim_em: string | null
          id: string
          inicio_em: string
          registrado_por: string | null
          veiculo_id: string
        }
        Insert: {
          cliente_id?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string
          registrado_por?: string | null
          veiculo_id: string
        }
        Update: {
          cliente_id?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string
          registrado_por?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculo_proprietarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculo_proprietarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      veiculos: {
        Row: {
          alerta_operador: string | null
          ano: number | null
          chassi: string | null
          cliente_id: string | null
          codigo: number
          cor: string | null
          created_at: string
          descricao: string
          id: string
          km_atual: number | null
          marca: string | null
          modelo: string | null
          municipio: string | null
          numero_frota: string | null
          observacoes: string | null
          placa: string
          placa_normalizada: string | null
          renavam: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          tipo: Database["public"]["Enums"]["tipo_veiculo"] | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          alerta_operador?: string | null
          ano?: number | null
          chassi?: string | null
          cliente_id?: string | null
          codigo?: never
          cor?: string | null
          created_at?: string
          descricao: string
          id?: string
          km_atual?: number | null
          marca?: string | null
          modelo?: string | null
          municipio?: string | null
          numero_frota?: string | null
          observacoes?: string | null
          placa: string
          placa_normalizada?: string | null
          renavam?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tipo?: Database["public"]["Enums"]["tipo_veiculo"] | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          alerta_operador?: string | null
          ano?: number | null
          chassi?: string | null
          cliente_id?: string | null
          codigo?: never
          cor?: string | null
          created_at?: string
          descricao?: string
          id?: string
          km_atual?: number | null
          marca?: string | null
          modelo?: string | null
          municipio?: string | null
          numero_frota?: string | null
          observacoes?: string | null
          placa?: string
          placa_normalizada?: string | null
          renavam?: string | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          tipo?: Database["public"]["Enums"]["tipo_veiculo"] | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
        ]
      }
      venda_itens: {
        Row: {
          descricao: string
          id: string
          omie_produto_id: string | null
          produto_id: string | null
          quantidade: number
          valor_total: number
          valor_unitario: number
          venda_id: string
        }
        Insert: {
          descricao: string
          id?: string
          omie_produto_id?: string | null
          produto_id?: string | null
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
          venda_id: string
        }
        Update: {
          descricao?: string
          id?: string
          omie_produto_id?: string | null
          produto_id?: string | null
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_estoque"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cliente_id: string | null
          created_at: string
          data_venda: string
          etapa: string | null
          id: string
          numero: string
          observacoes: string | null
          omie_cliente_id: string | null
          omie_id: string | null
          origem: Database["public"]["Enums"]["origem_registro"]
          sincronizado_em: string | null
          updated_at: string
          valor_total: number
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          data_venda?: string
          etapa?: string | null
          id?: string
          numero: string
          observacoes?: string | null
          omie_cliente_id?: string | null
          omie_id?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          sincronizado_em?: string | null
          updated_at?: string
          valor_total?: number
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          data_venda?: string
          etapa?: string | null
          id?: string
          numero?: string
          observacoes?: string | null
          omie_cliente_id?: string | null
          omie_id?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          sincronizado_em?: string | null
          updated_at?: string
          valor_total?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_clientes_relacionamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_patio"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "vendas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores: {
        Row: {
          bairro: string | null
          base_comissao: Database["public"]["Enums"]["base_comissao"] | null
          cep: string | null
          codigo: number
          created_at: string
          descricao: string
          documento: string | null
          documento_digitos: string | null
          email: string | null
          forma_comissao: Database["public"]["Enums"]["forma_comissao"] | null
          gerar_comissao: boolean
          id: string
          inscricao_estadual: string | null
          logradouro: string | null
          momento_comissao:
            | Database["public"]["Enums"]["momento_comissao"]
            | null
          municipio: string | null
          nascimento: string | null
          numero: string | null
          omie_id: string | null
          origem: Database["public"]["Enums"]["origem_registro"]
          percentual_comissao: number | null
          situacao: Database["public"]["Enums"]["situacao_registro"]
          telefone: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string | null
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          bairro?: string | null
          base_comissao?: Database["public"]["Enums"]["base_comissao"] | null
          cep?: string | null
          codigo?: never
          created_at?: string
          descricao: string
          documento?: string | null
          documento_digitos?: string | null
          email?: string | null
          forma_comissao?: Database["public"]["Enums"]["forma_comissao"] | null
          gerar_comissao?: boolean
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          momento_comissao?:
            | Database["public"]["Enums"]["momento_comissao"]
            | null
          municipio?: string | null
          nascimento?: string | null
          numero?: string | null
          omie_id?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          percentual_comissao?: number | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          bairro?: string | null
          base_comissao?: Database["public"]["Enums"]["base_comissao"] | null
          cep?: string | null
          codigo?: never
          created_at?: string
          descricao?: string
          documento?: string | null
          documento_digitos?: string | null
          email?: string | null
          forma_comissao?: Database["public"]["Enums"]["forma_comissao"] | null
          gerar_comissao?: boolean
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          momento_comissao?:
            | Database["public"]["Enums"]["momento_comissao"]
            | null
          municipio?: string | null
          nascimento?: string | null
          numero?: string | null
          omie_id?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"]
          percentual_comissao?: number | null
          situacao?: Database["public"]["Enums"]["situacao_registro"]
          telefone?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendedores_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendedores_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_clientes_relacionamento: {
        Row: {
          celular: string | null
          codigo: number | null
          dias_sem_atendimento: number | null
          documento: string | null
          email: string | null
          follow_ups_abertos: number | null
          id: string | null
          municipio: string | null
          nome_fantasia: string | null
          nome_razao: string | null
          proximo_follow_up: string | null
          situacao: Database["public"]["Enums"]["situacao_registro"] | null
          telefone: string | null
          total_interacoes: number | null
          total_os: number | null
          total_vendas: number | null
          uf: string | null
          ultima_interacao: string | null
          ultimo_atendimento: string | null
          valor_os: number | null
          valor_vendas: number | null
        }
        Relationships: []
      }
      vw_ebook_capitulos: {
        Row: {
          artigo_id: string | null
          categoria: string | null
          conteudo: string | null
          ebook_id: string | null
          fabricante: string | null
          id: string | null
          numero: number | null
          ordem: number | null
          publicado_em: string | null
          resumo: string | null
          situacao: Database["public"]["Enums"]["situacao_artigo"] | null
          titulo: string | null
          versao: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ebook_capitulos_ebook_id_fkey"
            columns: ["ebook_id"]
            isOneToOne: false
            referencedRelation: "ebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_estoque: {
        Row: {
          codigo: string | null
          custo_medio: number | null
          descricao: string | null
          disponivel: number | null
          ean: string | null
          estoque_minimo: number | null
          familia: string | null
          fisico: number | null
          id: string | null
          localizacao: string | null
          marca: string | null
          omie_id: string | null
          omie_sincronizado_em: string | null
          origem: Database["public"]["Enums"]["origem_registro"] | null
          pendente: number | null
          preco_custo: number | null
          preco_venda: number | null
          referencia: string | null
          reservado: number | null
          saldo: number | null
          situacao: Database["public"]["Enums"]["situacao_registro"] | null
          situacao_estoque: string | null
          unidade: string | null
          valor_custo_total: number | null
        }
        Insert: {
          codigo?: string | null
          custo_medio?: number | null
          descricao?: string | null
          disponivel?: never
          ean?: string | null
          estoque_minimo?: number | null
          familia?: string | null
          fisico?: number | null
          id?: string | null
          localizacao?: string | null
          marca?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"] | null
          pendente?: number | null
          preco_custo?: number | null
          preco_venda?: number | null
          referencia?: string | null
          reservado?: number | null
          saldo?: number | null
          situacao?: Database["public"]["Enums"]["situacao_registro"] | null
          situacao_estoque?: never
          unidade?: string | null
          valor_custo_total?: never
        }
        Update: {
          codigo?: string | null
          custo_medio?: number | null
          descricao?: string | null
          disponivel?: never
          ean?: string | null
          estoque_minimo?: number | null
          familia?: string | null
          fisico?: number | null
          id?: string | null
          localizacao?: string | null
          marca?: string | null
          omie_id?: string | null
          omie_sincronizado_em?: string | null
          origem?: Database["public"]["Enums"]["origem_registro"] | null
          pendente?: number | null
          preco_custo?: number | null
          preco_venda?: number | null
          referencia?: string | null
          reservado?: number | null
          saldo?: number | null
          situacao?: Database["public"]["Enums"]["situacao_registro"] | null
          situacao_estoque?: never
          unidade?: string | null
          valor_custo_total?: never
        }
        Relationships: []
      }
      vw_mecanicos: {
        Row: {
          avatar_url: string | null
          email: string | null
          funcao: string | null
          funcao_id: string | null
          id: string | null
          nome_completo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_mecanicos_laboratorio: {
        Row: {
          avatar_url: string | null
          email: string | null
          funcao: string | null
          funcao_id: string | null
          id: string | null
          nome_completo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_funcao_id_fkey"
            columns: ["funcao_id"]
            isOneToOne: false
            referencedRelation: "funcoes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_minhas_tarefas: {
        Row: {
          apontamento_id: string | null
          apontamento_iniciado_em: string | null
          apontamento_situacao:
            | Database["public"]["Enums"]["situacao_apontamento"]
            | null
          checklists_abertos: number | null
          cliente_nome: string | null
          os_id: string | null
          os_numero: number | null
          placa: string | null
          previsao_em: string | null
          prioridade: number | null
          problema_alegado: string | null
          status_categoria:
            | Database["public"]["Enums"]["categoria_status_os"]
            | null
          status_cor: string | null
          status_nome: string | null
          usuario_id: string | null
          veiculo_descricao: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_mecanicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mecanicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mecanicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "vw_mecanicos_laboratorio"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_patio: {
        Row: {
          aberta_em: string | null
          alerta_operador: string | null
          checklists_abertos: number | null
          cliente_id: string | null
          cliente_nome: string | null
          itens_pendentes: number | null
          km: number | null
          mecanicos: Json | null
          os_id: string | null
          os_numero: number | null
          placa: string | null
          previsao_em: string | null
          prioridade: number | null
          segundos_na_oficina: number | null
          segundos_no_estagio: number | null
          sla_vencido: boolean | null
          status_alterado_em: string | null
          status_categoria:
            | Database["public"]["Enums"]["categoria_status_os"]
            | null
          status_cor: string | null
          status_id: string | null
          status_nome: string | null
          status_ordem: number | null
          tipo: Database["public"]["Enums"]["tipo_os"] | null
          valor_total: number | null
          veiculo_descricao: string | null
          veiculo_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      alertas_gestao: {
        Args: { p_limite?: number | null }
        Returns: {
          detalhe: string
          dias_vencido: number
          entidade: string
          entidade_id: string
          responsavel: string
          tipo: string
          titulo: string
          vencido_em: string
        }[]
      }
      aplicar_rls_cadastro: {
        Args: { p_recurso: string | null; p_tabela: string | null }
        Returns: undefined
      }
      buscar_artigos: {
        Args: { p_limite?: number | null; p_termo: string | null }
        Returns: {
          categoria: string
          componente: string
          equipamento: string
          fabricante: string
          id: string
          numero: number
          relevancia: number
          resumo: string
          titulo: string
          versao: number
        }[]
      }
      concluir_checklist: { Args: { p_checklist: string | null }; Returns: undefined }
      encerrar_os: {
        Args: { p_forcar?: boolean | null; p_os: string | null }
        Returns: string
      }
      evolucao_vendas: {
        Args: { p_meses?: number | null }
        Returns: {
          mes: string
          quantidade: number
          valor: number
        }[]
      }
      excluir_registro: {
        Args: {
          p_id: string | null
          p_tabela: string | null
        }
        Returns: Json
      }
      previa_exclusao: {
        Args: {
          p_id: string | null
          p_tabela: string | null
        }
        Returns: Json
      }
      excluir_checklist: {
        Args: { p_checklist: string | null; p_motivo?: string | null }
        Returns: string
      }
      garantir_cliente_e_veiculo: {
        Args: {
          p_cliente_documento: string | null
          p_cliente_id: string | null
          p_cliente_nome: string | null
          p_placa: string | null
          p_veiculo_descricao?: string | null
          p_veiculo_id: string | null
          p_veiculo_tipo?: Database["public"]["Enums"]["tipo_veiculo"] | null
        }
        Returns: {
          cliente_criado: boolean
          cliente_id: string
          veiculo_criado: boolean
          veiculo_id: string
        }[]
      }
      ia_provedores: {
        Args: never
        Returns: {
          configurada: boolean
          modelo: string
          provedor: string
          status: string
        }[]
      }
      ia_situacao: {
        Args: never
        Returns: {
          configurada: boolean
          modelo: string
          provedor: string
          status: string
          transcricao_configurada: boolean
          transcricao_status: string
          ultima_conexao_em: string
          ultimo_erro: string
        }[]
      }
      indicadores_crm: {
        Args: never
        Returns: {
          clientes_ativos: number
          faixa1: number
          faixa1_dias: number
          faixa2: number
          faixa2_dias: number
          faixa3: number
          faixa3_dias: number
          follow_ups_abertos: number
          follow_ups_atrasados: number
          interacoes_30d: number
          sem_historico: number
        }[]
      }
      indicadores_estoque: {
        Args: never
        Returns: {
          criticos: number
          itens: number
          reservados: number
          sem_saldo: number
          valor_custo: number
        }[]
      }
      indicadores_gestao: {
        Args: { p_ate?: string | null; p_de?: string | null }
        Returns: {
          acoes_vencidas: number
          aguardando_aprovacao: number
          aguardando_peca: number
          ate: string
          clientes_inativos: number
          conformidade_5s: number
          de: string
          estoque_critico: number
          faturamento_periodo: number
          follow_ups_atrasados: number
          garantias_acionadas_periodo: number
          garantias_vigentes: number
          itens_5s_avaliados: number
          os_abertas: number
          os_concluidas_periodo: number
          pecas_teste_abertas: number
          pecas_teste_vencidas: number
          retornos_periodo: number
          tempo_medio_horas: number
          veiculos_patio: number
          vendas_periodo: number
        }[]
      }
      indicadores_patio: {
        Args: never
        Returns: {
          aguardando_aprovacao: number
          aguardando_faturamento: number
          aguardando_peca: number
          aguardando_triagem: number
          checklist_final: number
          em_diagnostico: number
          em_manutencao: number
          entradas_hoje: number
          no_patio: number
          prontos: number
          sla_vencido: number
          tempo_medio_segundos: number
          urgentes: number
        }[]
      }
      indicadores_vendas: {
        Args: { p_ate?: string | null; p_de?: string | null }
        Returns: {
          ate: string
          de: string
          quantidade: number
          quantidade_anterior: number
          ticket_medio: number
          valor: number
          valor_anterior: number
        }[]
      }
      iniciar_checklist: {
        Args: {
          p_cliente?: string | null
          p_data?: string | null
          p_especialidade?: string | null
          p_km?: number | null
          p_modelo: string | null
          p_os?: string | null
          p_setor?: string | null
          p_veiculo?: string | null
        }
        Returns: string
      }
      integracao_estado: {
        Args: { p_provedor?: string | null }
        Returns: {
          ambiente: string
          app_key_mascarada: string
          ativa: boolean
          atualizada_em: string
          provedor: string
          status: Database["public"]["Enums"]["status_integracao"]
          tem_credenciais: boolean
          ultima_conexao_em: string
          ultimo_erro: string
        }[]
      }
      minhas_permissoes: {
        Args: never
        Returns: {
          acao: Database["public"]["Enums"]["acao_permissao"]
          recurso: string
        }[]
      }
      movimentar_estoque: {
        Args: {
          p_motivo?: string | null
          p_os?: string | null
          p_produto: string | null
          p_quantidade: number | null
          p_tipo: Database["public"]["Enums"]["tipo_movimento_estoque"] | null
          p_venda?: string | null
        }
        Returns: number
      }
      nova_versao_checklist: { Args: { p_modelo: string | null }; Returns: number }
      omie_pendentes_de_envio: {
        Args: never
        Returns: {
          com_erro: number
          entidade: string
          total: number
        }[]
      }
      performance_equipe: {
        Args: {
          p_ate?: string | null
          p_de?: string | null
          p_especialidade?: string | null
          p_funcao?: string | null
        }
        Returns: {
          apontamentos_concluidos: number
          checklists_concluidos: number
          conformidade_5s: number
          funcao: string
          horas_apontadas: number
          itens_5s_avaliados: number
          nao_conformidades_5s: number
          nome_completo: string
          os_concluidas: number
          pontos: number
          pontos_automaticos: number
          pontos_manuais: number
          retornos: number
          usuario_id: string
        }[]
      }
      pode_editar_parametro: { Args: { p_chave: string | null }; Returns: boolean }
      produtos_mais_vendidos: {
        Args: { p_ate?: string | null; p_de?: string | null; p_limite?: number | null }
        Returns: {
          codigo: string
          descricao: string
          produto_id: string
          quantidade: number
          valor: number
        }[]
      }
      progresso_checklist: {
        Args: { p_checklist: string | null }
        Returns: {
          negativos: number
          respondidos: number
          secao: string
          total: number
        }[]
      }
      publicar_artigo: { Args: { p_artigo: string | null }; Returns: number }
      reabrir_checklist: {
        Args: { p_checklist: string | null; p_motivo: string | null }
        Returns: undefined
      }
      reabrir_os: {
        Args: { p_motivo: string | null; p_os: string | null }
        Returns: undefined
      }
      recalcular_totais_os: { Args: { p_os: string | null }; Returns: undefined }
      registrar_saida_patio: {
        Args: {
          p_condicao?: string | null
          p_faturar?: boolean | null
          p_forma?: Database["public"]["Enums"]["forma_pagamento"] | null
          p_intervalo_dias?: number | null
          p_observacao?: string | null
          p_os: string | null
          p_parcelas?: number | null
          p_primeiro_vencimento?: string | null
          p_valor_pago?: number | null
        }
        Returns: {
          fatura_id: string
          garantias_criadas: number
          recibo: number
          saida_em: string
        }[]
      }
      rls_checklist_escrever: { Args: never; Returns: boolean }
      rls_checklist_ler: { Args: never; Returns: boolean }
      rls_os_filhos_escrever: { Args: never; Returns: boolean }
      rls_os_filhos_ler: { Args: never; Returns: boolean }
      situacao_para_saida: {
        Args: { p_os: string | null }
        Returns: {
          checklist_entrada_id: string
          checklist_entrada_ok: boolean
          checklist_saida_id: string
          checklist_saida_ok: boolean
          itens_pendentes: number
          ja_saiu: boolean
          numero: number
          os_id: string
          saldo: number
          valor_pago: number
          valor_total: number
        }[]
      }
      sla_pecas_teste: {
        Args: never
        Returns: {
          atencao: number
          entregues_mes: number
          no_prazo: number
          vencido: number
        }[]
      }
      tem_permissao: {
        Args: {
          p_acao: Database["public"]["Enums"]["acao_permissao"] | null
          p_recurso: string | null
        }
        Returns: boolean
      }
      ultimo_km_veiculo: {
        Args: { p_veiculo: string | null }
        Returns: {
          km: number
          registrado_em: string
        }[]
      }
      usuario_atual_admin: { Args: never; Returns: boolean }
      usuario_atual_ativo: { Args: never; Returns: boolean }
    }
    Enums: {
      acao_permissao:
        | "visualizar"
        | "criar"
        | "editar"
        | "aprovar"
        | "cancelar"
        | "inativar"
        | "configurar"
        | "exportar"
        | "sincronizar"
      base_comissao: "valor_total" | "produtos" | "servicos" | "lucro"
      categoria_status_os:
        | "entrada"
        | "diagnostico"
        | "aprovacao"
        | "espera"
        | "execucao"
        | "finalizacao"
        | "concluido"
        | "cancelado"
      criticidade: "baixa" | "media" | "alta" | "critica"
      decisao_retorno: "pendente" | "procedente" | "improcedente" | "cortesia"
      estado_produto_os:
        | "necessario"
        | "reservado"
        | "utilizado"
        | "nao_utilizado"
        | "devolvido"
      evento_performance:
        | "os_concluida"
        | "checklist_concluido"
        | "retorno_vinculado"
        | "nao_conformidade_5s"
        | "apontamento_concluido"
        | "manual"
      forma_comissao: "percentual" | "valor_fixo"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "debito"
        | "credito"
        | "boleto"
        | "transferencia"
        | "faturado"
        | "outro"
      momento_comissao: "faturamento" | "recebimento" | "entrega"
      origem_criterio: "manual" | "automatico"
      origem_registro: "manual" | "omie"
      papel_mensagem: "usuario" | "assistente"
      prioridade_acao: "baixa" | "media" | "alta" | "critica"
      resposta_checklist:
        | "ok"
        | "nao_ok"
        | "nao_se_aplica"
        | "nao_verificado"
        | "conforme"
        | "nao_conforme"
      resultado_sincronizacao:
        | "em_andamento"
        | "concluida"
        | "concluida_com_falhas"
        | "falhou"
        | "cancelada"
      situacao_apontamento: "em_execucao" | "pausado" | "concluido"
      situacao_aprovacao: "pendente" | "aprovado" | "recusado"
      situacao_artigo:
        | "rascunho"
        | "em_revisao"
        | "aprovado"
        | "publicado"
        | "arquivado"
      situacao_checklist: "em_andamento" | "concluido" | "cancelado"
      situacao_ebook: "rascunho" | "publicado" | "arquivado"
      situacao_entrada: "no_patio" | "encerrada" | "cancelada"
      situacao_follow_up: "aberto" | "concluido" | "cancelado"
      situacao_garantia: "vigente" | "expirada" | "acionada" | "cancelada"
      situacao_item: "ativo" | "cancelado"
      situacao_registro: "ativo" | "inativo"
      situacao_retorno: "aberto" | "em_analise" | "concluido" | "cancelado"
      situacao_usuario: "pendente" | "ativo" | "inativo" | "recusado"
      status_acao: "aberta" | "em_andamento" | "concluida" | "cancelada"
      status_integracao:
        | "nao_configurada"
        | "configurada"
        | "conectada"
        | "erro"
      status_peca_teste:
        | "recebida"
        | "aguardando_teste"
        | "em_teste"
        | "aguardando_peca"
        | "reparada"
        | "reprovada"
        | "aguardando_cliente"
        | "entregue"
      tema_interface: "claro" | "escuro" | "sistema"
      tipo_avaria:
        | "batido"
        | "riscado"
        | "amassado"
        | "quebrado"
        | "faltante"
        | "trincado"
      tipo_checklist:
        | "tecnico_inicial"
        | "final_os"
        | "diario_abertura"
        | "diario_fechamento"
      tipo_evidencia: "foto" | "video" | "audio" | "documento"
      tipo_interacao: "ligacao" | "whatsapp" | "email" | "visita" | "observacao"
      tipo_item_garantia: "produto" | "servico"
      tipo_movimento_estoque:
        | "entrada"
        | "saida"
        | "ajuste"
        | "reserva"
        | "liberacao"
      tipo_notificacao: "alerta_inteligente" | "sistema"
      tipo_os: "os" | "orcamento" | "garantia"
      tipo_pessoa: "fisica" | "juridica"
      tipo_resposta_checklist: "estado" | "conformidade"
      tipo_sincronizacao:
        | "clientes"
        | "fornecedores"
        | "produtos"
        | "servicos"
        | "estoque"
        | "vendas"
      tipo_veiculo:
        | "cavalo"
        | "carreta"
        | "truck"
        | "toco"
        | "bitrem"
        | "rodotrem"
        | "vanderleia"
        | "onibus"
        | "van"
        | "utilitario"
        | "outro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acao_permissao: [
        "visualizar",
        "criar",
        "editar",
        "aprovar",
        "cancelar",
        "inativar",
        "configurar",
        "exportar",
        "sincronizar",
      ],
      base_comissao: ["valor_total", "produtos", "servicos", "lucro"],
      categoria_status_os: [
        "entrada",
        "diagnostico",
        "aprovacao",
        "espera",
        "execucao",
        "finalizacao",
        "concluido",
        "cancelado",
      ],
      criticidade: ["baixa", "media", "alta", "critica"],
      decisao_retorno: ["pendente", "procedente", "improcedente", "cortesia"],
      estado_produto_os: [
        "necessario",
        "reservado",
        "utilizado",
        "nao_utilizado",
        "devolvido",
      ],
      evento_performance: [
        "os_concluida",
        "checklist_concluido",
        "retorno_vinculado",
        "nao_conformidade_5s",
        "apontamento_concluido",
        "manual",
      ],
      forma_comissao: ["percentual", "valor_fixo"],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "debito",
        "credito",
        "boleto",
        "transferencia",
        "faturado",
        "outro",
      ],
      momento_comissao: ["faturamento", "recebimento", "entrega"],
      origem_criterio: ["manual", "automatico"],
      origem_registro: ["manual", "omie"],
      papel_mensagem: ["usuario", "assistente"],
      prioridade_acao: ["baixa", "media", "alta", "critica"],
      resposta_checklist: [
        "ok",
        "nao_ok",
        "nao_se_aplica",
        "nao_verificado",
        "conforme",
        "nao_conforme",
      ],
      resultado_sincronizacao: [
        "em_andamento",
        "concluida",
        "concluida_com_falhas",
        "falhou",
        "cancelada",
      ],
      situacao_apontamento: ["em_execucao", "pausado", "concluido"],
      situacao_aprovacao: ["pendente", "aprovado", "recusado"],
      situacao_artigo: [
        "rascunho",
        "em_revisao",
        "aprovado",
        "publicado",
        "arquivado",
      ],
      situacao_checklist: ["em_andamento", "concluido", "cancelado"],
      situacao_ebook: ["rascunho", "publicado", "arquivado"],
      situacao_entrada: ["no_patio", "encerrada", "cancelada"],
      situacao_follow_up: ["aberto", "concluido", "cancelado"],
      situacao_garantia: ["vigente", "expirada", "acionada", "cancelada"],
      situacao_item: ["ativo", "cancelado"],
      situacao_registro: ["ativo", "inativo"],
      situacao_retorno: ["aberto", "em_analise", "concluido", "cancelado"],
      situacao_usuario: ["pendente", "ativo", "inativo", "recusado"],
      status_acao: ["aberta", "em_andamento", "concluida", "cancelada"],
      status_integracao: [
        "nao_configurada",
        "configurada",
        "conectada",
        "erro",
      ],
      status_peca_teste: [
        "recebida",
        "aguardando_teste",
        "em_teste",
        "aguardando_peca",
        "reparada",
        "reprovada",
        "aguardando_cliente",
        "entregue",
      ],
      tema_interface: ["claro", "escuro", "sistema"],
      tipo_avaria: [
        "batido",
        "riscado",
        "amassado",
        "quebrado",
        "faltante",
        "trincado",
      ],
      tipo_checklist: [
        "tecnico_inicial",
        "final_os",
        "diario_abertura",
        "diario_fechamento",
      ],
      tipo_evidencia: ["foto", "video", "audio", "documento"],
      tipo_interacao: ["ligacao", "whatsapp", "email", "visita", "observacao"],
      tipo_item_garantia: ["produto", "servico"],
      tipo_movimento_estoque: [
        "entrada",
        "saida",
        "ajuste",
        "reserva",
        "liberacao",
      ],
      tipo_notificacao: ["alerta_inteligente", "sistema"],
      tipo_os: ["os", "orcamento", "garantia"],
      tipo_pessoa: ["fisica", "juridica"],
      tipo_resposta_checklist: ["estado", "conformidade"],
      tipo_sincronizacao: [
        "clientes",
        "fornecedores",
        "produtos",
        "servicos",
        "estoque",
        "vendas",
      ],
      tipo_veiculo: [
        "cavalo",
        "carreta",
        "truck",
        "toco",
        "bitrem",
        "rodotrem",
        "vanderleia",
        "onibus",
        "van",
        "utilitario",
        "outro",
      ],
    },
  },
} as const

/* ---------------------------------------------------------------------- *
 * Aliases de conveniencia sobre o `Database` gerado pelo Supabase.
 * Mantidos neste arquivo (e nao em db.ts) para sobreviver a regeneracoes.
 * ------------------------------------------------------------------------ */

type PublicSchema = Database['public']

export type Tabelas<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TabelasInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TabelasUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Visoes<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enumeracoes<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
export type FuncaoRetorno<T extends keyof PublicSchema['Functions']> =
  PublicSchema['Functions'][T]['Returns'] extends (infer Linha)[] ? Linha : PublicSchema['Functions'][T]['Returns']

/* Tabelas */
export type LinhaArtigoAjuda = Tabelas<'artigos_ajuda'>
export type LinhaAuditoria = Tabelas<'auditoria'>
export type LinhaDadosEmpresa = Tabelas<'dados_empresa'>
export type LinhaEspecialidade = Tabelas<'especialidades'>
export type LinhaFuncao = Tabelas<'funcoes'>
export type LinhaNotificacao = Tabelas<'notificacoes'>
export type LinhaPerfilAcesso = Tabelas<'perfis_acesso'>
export type LinhaPerfilPermissao = Tabelas<'perfil_permissoes'>
export type LinhaRecurso = Tabelas<'recursos'>
export type LinhaUsuario = Tabelas<'usuarios'>
export type LinhaUsuarioPermissao = Tabelas<'usuario_permissoes'>
export type LinhaCliente = Tabelas<'clientes'>
export type LinhaClienteContato = Tabelas<'cliente_contatos'>
export type LinhaFornecedor = Tabelas<'fornecedores'>
export type LinhaTag = Tabelas<'tags'>
export type LinhaVendedor = Tabelas<'vendedores'>
export type LinhaVeiculo = Tabelas<'veiculos'>
export type LinhaVeiculoProprietario = Tabelas<'veiculo_proprietarios'>
export type LinhaProduto = Tabelas<'produtos'>
export type LinhaServico = Tabelas<'servicos'>
export type LinhaStatusOS = Tabelas<'status_os'>
export type LinhaSincronizacao = Tabelas<'sincronizacoes'>
export type LinhaConflitoSincronizacao = Tabelas<'conflitos_sincronizacao'>
export type LinhaVenda = Tabelas<'vendas'>
export type LinhaVendaItem = Tabelas<'venda_itens'>
export type LinhaEvidencia = Tabelas<'evidencias'>
export type LinhaEventoVeiculo = Tabelas<'eventos_veiculo'>
export type LinhaEntradaPatio = Tabelas<'entradas_patio'>
export type LinhaOrdemServico = Tabelas<'ordens_servico'>
export type LinhaOSMecanico = Tabelas<'os_mecanicos'>
export type LinhaOSServico = Tabelas<'os_servicos'>
export type LinhaOSProduto = Tabelas<'os_produtos'>
export type LinhaOSEvento = Tabelas<'os_eventos'>
export type LinhaAssinatura = Tabelas<'assinaturas'>
export type LinhaChecklistModelo = Tabelas<'checklist_modelos'>
export type LinhaChecklistModeloItem = Tabelas<'checklist_modelo_itens'>
export type LinhaChecklist = Tabelas<'checklists'>
export type LinhaChecklistResposta = Tabelas<'checklist_respostas'>
export type LinhaChecklistDefeito = Tabelas<'checklist_defeitos'>
export type LinhaAcaoCorretiva = Tabelas<'acoes_corretivas'>
export type LinhaAvariaVeiculo = Tabelas<'avarias_veiculo'>
export type LinhaFatura = Tabelas<'faturas'>
export type LinhaFaturaParcela = Tabelas<'fatura_parcelas'>
export type LinhaIADominio = Tabelas<'ia_dominios'>
export type LinhaIAEquipamento = Tabelas<'ia_equipamentos'>
export type LinhaIAConfig = Tabelas<'ia_config'>
export type LinhaIAAprendizado = Tabelas<'ia_aprendizados'>
export type LinhaOSApontamento = Tabelas<'os_apontamentos'>
export type LinhaGarantia = Tabelas<'garantias'>
export type LinhaRetorno = Tabelas<'retornos'>
export type LinhaTermoRecusa = Tabelas<'termos_recusa'>
export type LinhaPecaTeste = Tabelas<'pecas_teste'>
export type LinhaPecaTesteEvento = Tabelas<'pecas_teste_eventos'>
export type LinhaParametro = Tabelas<'parametros'>
export type LinhaInteracao = Tabelas<'interacoes'>
export type LinhaFollowUp = Tabelas<'follow_ups'>
export type LinhaEstoqueMovimento = Tabelas<'estoque_movimentos'>
export type LinhaCriterioPerformance = Tabelas<'criterios_performance'>
export type LinhaEventoPerformance = Tabelas<'eventos_performance'>
export type LinhaArtigoTecnico = Tabelas<'artigos_tecnicos'>
export type LinhaArtigoVersao = Tabelas<'artigo_versoes'>
export type LinhaIAConversa = Tabelas<'ia_conversas'>
export type LinhaIAMensagem = Tabelas<'ia_mensagens'>
export type LinhaIAFonte = Tabelas<'ia_fontes'>
export type LinhaIAFeedback = Tabelas<'ia_feedback'>
export type LinhaEbook = Tabelas<'ebooks'>
export type LinhaEbookCapitulo = Tabelas<'ebook_capitulos'>

/* Views */
/** `id`/`nome_completo` vêm de `usuarios` (JOIN obrigatório); o resto é opcional. */
export type LinhaMecanico = ReafirmaNaoNulo<Visoes<'vw_mecanicos'>, 'funcao' | 'funcao_id' | 'email' | 'avatar_url'>

/** Marca como não-nulas as colunas de `T` que a SQL de origem garante preenchidas
 *  (JOIN obrigatório ou COALESCE), mesmo o gerador do Supabase marcando toda
 *  coluna de view como nullable. `K` são as exceções que continuam opcionais. */
type ReafirmaNaoNulo<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: NonNullable<T[P]> } & {
  [P in K]: T[P]
}

/**
 * `vw_patio` reúne JOINs obrigatórios (OS/status/veículo/cliente) e colunas
 * computadas com COALESCE — nunca voltam nulas na prática. Só `previsao_em`
 * e `alerta_operador` são opcionais de fato.
 */
export type LinhaPatio = Omit<
  ReafirmaNaoNulo<Visoes<'vw_patio'>, 'previsao_em' | 'alerta_operador'>,
  'mecanicos'
> & { mecanicos: Array<{ id: string; nome: string }> }

/**
 * As demais views seguem o mesmo padrão de `vw_patio`: montadas a partir de
 * JOINs obrigatórios e colunas computadas, mas o gerador do Supabase marca
 * toda coluna de view como nullable. Reafirmamos o que a SQL garante.
 */
export type LinhaMinhaTarefa = ReafirmaNaoNulo<Visoes<'vw_minhas_tarefas'>, never>
export type LinhaEstoque = Omit<ReafirmaNaoNulo<Visoes<'vw_estoque'>, never>, 'situacao_estoque'> & {
  situacao_estoque: SituacaoEstoque
}
/** Dados de contato/endereço e métricas de atendimento continuam opcionais de fato. */
export type LinhaClienteRelacionamento = ReafirmaNaoNulo<
  Visoes<'vw_clientes_relacionamento'>,
  | 'celular'
  | 'telefone'
  | 'email'
  | 'nome_fantasia'
  | 'municipio'
  | 'uf'
  | 'documento'
  | 'ultimo_atendimento'
  | 'dias_sem_atendimento'
  | 'ultima_interacao'
  | 'proximo_follow_up'
>
/** Colunas opcionais do artigo técnico vinculado (resumo/categoria/fabricante/publicação). */
export type LinhaEbookCapituloDetalhe = ReafirmaNaoNulo<
  Visoes<'vw_ebook_capitulos'>,
  'resumo' | 'categoria' | 'fabricante' | 'publicado_em'
>

/* Enums */
export type AcaoPermissao = Enumeracoes<'acao_permissao'>
export type SituacaoRegistro = Enumeracoes<'situacao_registro'>
export type SituacaoUsuario = Enumeracoes<'situacao_usuario'>
export type TemaInterface = Enumeracoes<'tema_interface'>
export type TipoNotificacao = Enumeracoes<'tipo_notificacao'>
export type TipoPessoa = Enumeracoes<'tipo_pessoa'>
export type OrigemRegistro = Enumeracoes<'origem_registro'>
export type MomentoComissao = Enumeracoes<'momento_comissao'>
export type BaseComissao = Enumeracoes<'base_comissao'>
export type FormaComissao = Enumeracoes<'forma_comissao'>
export type TipoVeiculo = Enumeracoes<'tipo_veiculo'>
export type CategoriaStatusOS = Enumeracoes<'categoria_status_os'>
export type StatusIntegracao = Enumeracoes<'status_integracao'>
export type TipoSincronizacao = Enumeracoes<'tipo_sincronizacao'>
export type ResultadoSincronizacao = Enumeracoes<'resultado_sincronizacao'>
export type TipoEvidencia = Enumeracoes<'tipo_evidencia'>
export type SituacaoEntrada = Enumeracoes<'situacao_entrada'>
export type TipoOS = Enumeracoes<'tipo_os'>
export type FormaPagamento = Enumeracoes<'forma_pagamento'>
export type SituacaoAprovacao = Enumeracoes<'situacao_aprovacao'>
export type EstadoProdutoOS = Enumeracoes<'estado_produto_os'>
export type SituacaoItem = Enumeracoes<'situacao_item'>
export type TipoChecklist = Enumeracoes<'tipo_checklist'>
export type TipoRespostaChecklist = Enumeracoes<'tipo_resposta_checklist'>
export type RespostaChecklist = Enumeracoes<'resposta_checklist'>
export type SituacaoChecklist = Enumeracoes<'situacao_checklist'>
export type Criticidade = Enumeracoes<'criticidade'>
export type TipoAvaria = Enumeracoes<'tipo_avaria'>
export type TipoItemGarantia = Enumeracoes<'tipo_item_garantia'>
export type SituacaoGarantia = Enumeracoes<'situacao_garantia'>
export type DecisaoRetorno = Enumeracoes<'decisao_retorno'>
export type SituacaoRetorno = Enumeracoes<'situacao_retorno'>
export type StatusPecaTeste = Enumeracoes<'status_peca_teste'>
export type TipoInteracao = Enumeracoes<'tipo_interacao'>
export type SituacaoFollowUp = Enumeracoes<'situacao_follow_up'>
export type TipoMovimentoEstoque = Enumeracoes<'tipo_movimento_estoque'>
export type StatusAcao = Enumeracoes<'status_acao'>
export type PrioridadeAcao = Enumeracoes<'prioridade_acao'>
export type SituacaoApontamento = Enumeracoes<'situacao_apontamento'>
export type OrigemCriterio = Enumeracoes<'origem_criterio'>
export type EventoPerformance = Enumeracoes<'evento_performance'>
export type PapelMensagem = Enumeracoes<'papel_mensagem'>
export type SituacaoArtigo = Enumeracoes<'situacao_artigo'>
export type SituacaoEbook = Enumeracoes<'situacao_ebook'>

/* Colunas texto com CHECK constraint em vez de enum nativo do Postgres. */
export type ProvedorIA = 'anthropic' | 'openai' | 'gemini'
export type SituacaoAprendizado = 'pendente' | 'rascunho_gerado' | 'publicado' | 'descartado'
/** Computado em `vw_estoque`, nao e uma coluna propria. */
export type SituacaoEstoque = 'sem_saldo' | 'critico' | 'baixo' | 'ok'
/** Progresso por secao do checklist (retorno de `progresso_checklist`). */
export type ProgressoSecao = FuncaoRetorno<'progresso_checklist'>

/* Retornos de RPC (funcoes RETURNS TABLE viram array; pegamos o item). */
export type IndicadoresPatio = FuncaoRetorno<'indicadores_patio'>
export type IndicadoresEstoque = FuncaoRetorno<'indicadores_estoque'>
export type IndicadoresVendas = FuncaoRetorno<'indicadores_vendas'>
export type IndicadoresCRM = FuncaoRetorno<'indicadores_crm'>
export type IndicadoresGestao = FuncaoRetorno<'indicadores_gestao'>
export type AlertaGestao = FuncaoRetorno<'alertas_gestao'>
export type ProdutoMaisVendido = FuncaoRetorno<'produtos_mais_vendidos'>
export type EvolucaoVenda = FuncaoRetorno<'evolucao_vendas'>
export type LinhaPerformance = FuncaoRetorno<'performance_equipe'>
export type ProvedorListado = FuncaoRetorno<'ia_provedores'>
export type SituacaoIA = FuncaoRetorno<'ia_situacao'>
export type ArtigoBuscado = FuncaoRetorno<'buscar_artigos'>
export type EstadoIntegracao = FuncaoRetorno<'integracao_estado'>
export type SlaPecasTeste = FuncaoRetorno<'sla_pecas_teste'>

/** Anexo de mensagem da Tecnoar IA (coluna jsonb ia_mensagens.anexos). */
export interface AnexoIA {
  tipo: 'foto' | 'video' | 'audio' | 'documento' | 'link'
  nome: string
  url: string
  tamanho?: number
}

/** Resposta estruturada da Tecnoar IA quando o modelo devolve JSON em vez de texto livre. */
export interface RespostaEstruturada {
  resumo: string
  passos?: string[]
  fontes?: Array<{ titulo: string; artigo_id?: string }>
}
