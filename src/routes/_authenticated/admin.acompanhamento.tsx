import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Download, FileEdit } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import logoAsset from "@/assets/logo-manuelito.png.asset.json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { generateRoteirosPdf, pdfFilename } from "@/lib/pdf";
import { configQuery, turmasQuery, turmaDisciplinaQuery } from "@/lib/queries";
import type { ItemRoteiro } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/admin/acompanhamento")({
  head: () => ({ meta: [{ title: "Acompanhamento — Admin" }] }),
  component: Page,
});

function Page() {
  const { data: cfg } = useQuery(configQuery);
  const { data: turmas } = useQuery(turmasQuery);
  const { data: td } = useQuery(turmaDisciplinaQuery);
  const { data: roteiros } = useQuery({
    queryKey: ["roteiros-admin", cfg?.etapa_atual, cfg?.tipo_avaliacao],
    enabled: !!cfg,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roteiros")
        .select("*")
        .eq("etapa", cfg!.etapa_atual)
        .eq("tipo_avaliacao", cfg!.tipo_avaliacao);
      if (error) throw error;
      return data;
    },
  });
  const [exportando, setExportando] = useState<string | null>(null);

  const porTurma = useMemo(() => {
    const map = new Map<
      string,
      { turma: { id: string; nome: string; segmento: string }; disciplinas: {
        turma_disciplina_id: string;
        disciplina_id: string;
        disciplina_nome: string;
        ordem: number;
        status?: "rascunho" | "enviado";
        roteiro_id?: string;
      }[] }
    >();
    (turmas ?? []).forEach((t) => map.set(t.id, { turma: t, disciplinas: [] }));
    (td ?? []).forEach((r) => {
      const d = r.disciplinas as unknown as { nome: string } | null;
      const rot = (roteiros ?? []).find(
        (rt) => rt.turma_id === r.turma_id && rt.disciplina_id === r.disciplina_id,
      );
      map.get(r.turma_id)?.disciplinas.push({
        turma_disciplina_id: r.id,
        disciplina_id: r.disciplina_id,
        disciplina_nome: d?.nome ?? "",
        ordem: r.ordem_exibicao,
        status: rot?.status,
        roteiro_id: rot?.id,
      });
    });
    map.forEach((v) => v.disciplinas.sort((a, b) => a.ordem - b.ordem));
    return Array.from(map.values()).filter((v) => v.disciplinas.length > 0);
  }, [turmas, td, roteiros]);

  async function exportPdf(
    turma: { id: string; nome: string; segmento: string },
    disciplinas: { disciplina_id: string; disciplina_nome: string }[],
  ) {
    if (!cfg) return;
    setExportando(turma.id);
    try {
      const enviados = (roteiros ?? []).filter((r) => r.turma_id === turma.id && r.status === "enviado");
      if (enviados.length === 0) {
        toast.error("Nenhum roteiro enviado para esta turma.");
        return;
      }
      const inicios = enviados.map((r) => r.data_inicio_realizacao).filter(Boolean) as string[];
      const fins = enviados.map((r) => r.data_fim_realizacao).filter(Boolean) as string[];
      const dataInicio = inicios.sort()[0] ?? null;
      const dataFim = fins.sort().slice(-1)[0] ?? null;

      const ordered = disciplinas
        .map((d) => {
          const r = enviados.find((e) => e.disciplina_id === d.disciplina_id);
          if (!r) return null;
          return {
            disciplinaNome: d.disciplina_nome,
            itens: (r.itens as unknown as ItemRoteiro[]) ?? [],
            observacao: r.observacao,
          };
        })
        .filter(Boolean) as { disciplinaNome: string; itens: ItemRoteiro[]; observacao: string | null }[];

      const blob = await generateRoteirosPdf({
        turmaNome: turma.nome,
        segmento: turma.segmento,
        etapa: cfg.etapa_atual,
        tipoAvaliacao: cfg.tipo_avaliacao,
        dataInicio,
        dataFim,
        anoLetivo: cfg.ano_letivo,
        roteiros: ordered,
        logoUrl: logoAsset.url,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename(turma.nome, cfg.etapa_atual, cfg.tipo_avaliacao);
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Erro ao gerar PDF", { description: String(e) });
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3 text-sm">
        Etapa atual:{" "}
        <strong>
          {cfg?.etapa_atual}ª — {cfg?.tipo_avaliacao === "global" ? "Global" : "Parcial"}
        </strong>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {porTurma.map(({ turma, disciplinas }) => {
          const enviados = disciplinas.filter((d) => d.status === "enviado").length;
          return (
            <Card key={turma.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{turma.nome}</CardTitle>
                  <p className="text-xs text-muted-foreground">{turma.segmento}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {enviados}/{disciplinas.length} enviados
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={enviados === 0 || exportando === turma.id}
                    onClick={() => exportPdf(turma, disciplinas)}
                  >
                    <Download className="mr-1 h-3 w-3" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {disciplinas.map((d) => (
                    <Link
                      key={d.disciplina_id}
                      to="/app/roteiro/$disciplinaId/$turmaId"
                      params={{ disciplinaId: d.disciplina_id, turmaId: turma.id }}
                      className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent"
                    >
                      {d.status === "enviado" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : d.status === "rascunho" ? (
                        <FileEdit className="h-4 w-4 text-amber-600" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="truncate">{d.disciplina_nome}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
