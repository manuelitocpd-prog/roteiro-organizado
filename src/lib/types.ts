export type ItemRoteiro =
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "topico"; texto: string };

export interface RoteiroRow {
  id: string;
  professor_id: string;
  disciplina_id: string;
  turma_id: string;
  etapa: number;
  tipo_avaliacao: "parcial" | "global";
  data_inicio_realizacao: string | null;
  data_fim_realizacao: string | null;
  itens: ItemRoteiro[];
  observacao: string | null;
  status: "rascunho" | "enviado";
  created_at: string;
  updated_at: string;
}
