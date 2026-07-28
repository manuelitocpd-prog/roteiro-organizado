import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const qk = {
  session: ["session"] as const,
  me: ["me"] as const,
  config: ["configuracao_etapa"] as const,
  turmas: ["turmas"] as const,
  disciplinas: ["disciplinas"] as const,
  turmaDisciplina: ["turma_disciplina"] as const,
  professores: ["professores"] as const,
  pdt: ["professor_disciplina_turma"] as const,
  roteiros: (filter?: string) => ["roteiros", filter ?? "all"] as const,
};

export type ConfigEtapa = {
  id: number;
  segmento: string;
  etapa_atual: number;
  tipo_avaliacao: "parcial" | "global";
  ano_letivo: number;
  data_inicio_realizacao: string | null;
  data_fim_realizacao: string | null;
};

/** Segmentos oficiais (valor no banco -> rótulo exibido) */
export const SEGMENTOS: { valor: string; label: string }[] = [
  { valor: "Educação Infantil", label: "Educação Infantil" },
  { valor: "Fundamental I", label: "Ensino Fundamental I" },
  { valor: "Fundamental II", label: "Ensino Fundamental II" },
];

export const segmentoLabel = (valor?: string | null) =>
  SEGMENTOS.find((s) => s.valor === valor)?.label ?? valor ?? "";

export const configsQuery = queryOptions({
  queryKey: qk.config,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("configuracao_etapa")
      .select("*")
      .order("id");
    if (error) throw error;
    return (data ?? []) as unknown as ConfigEtapa[];
  },
});

export const configPorSegmento = (
  cfgs: ConfigEtapa[] | undefined,
  segmento: string | null | undefined,
): ConfigEtapa | undefined => cfgs?.find((c) => c.segmento === segmento);


export const turmasQuery = queryOptions({
  queryKey: qk.turmas,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("turmas")
      .select("*")
      .order("segmento")
      .order("nome");
    if (error) throw error;
    return data;
  },
});

export const disciplinasQuery = queryOptions({
  queryKey: qk.disciplinas,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("disciplinas")
      .select("*")
      .order("nome");
    if (error) throw error;
    return data;
  },
});

export const turmaDisciplinaQuery = queryOptions({
  queryKey: qk.turmaDisciplina,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("turma_disciplina")
      .select("*, turmas(nome,segmento), disciplinas(nome)")
      .order("ordem_exibicao");
    if (error) throw error;
    return data;
  },
});

export const professoresQuery = queryOptions({
  queryKey: qk.professores,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("professores")
      .select("*")
      .order("nome");
    if (error) throw error;
    return data;
  },
});

export const pdtQuery = queryOptions({
  queryKey: qk.pdt,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("professor_disciplina_turma")
      .select("*, professores(nome,email), turmas(nome), disciplinas(nome)");
    if (error) throw error;
    return data;
  },
});
