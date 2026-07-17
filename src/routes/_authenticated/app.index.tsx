import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { configQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Minhas disciplinas — Roteiros" }] }),
  component: Home,
});

function Home() {
  const { professorId, isAdmin, loading } = useAuth();
  const { data: cfg } = useQuery(configQuery);
  const { data: pdt } = useQuery({
    queryKey: ["pdt-me", professorId],
    enabled: !!professorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professor_disciplina_turma")
        .select("id, disciplina_id, turma_id, disciplinas(nome), turmas(nome, segmento)")
        .eq("professor_id", professorId!);
      if (error) throw error;
      return data;
    },
  });
  const { data: roteiros } = useQuery({
    queryKey: ["roteiros-me", professorId, cfg?.etapa_atual, cfg?.tipo_avaliacao],
    enabled: !!professorId && !!cfg,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roteiros")
        .select("id, disciplina_id, turma_id, status")
        .eq("professor_id", professorId!)
        .eq("etapa", cfg!.etapa_atual)
        .eq("tipo_avaliacao", cfg!.tipo_avaliacao);
      if (error) throw error;
      return data;
    },
  });

  if (loading) return null;
  if (!professorId && isAdmin) return <Navigate to="/admin/acompanhamento" replace />;

  const grouped = new Map<
    string,
    { disciplinaNome: string; turmas: { id: string; nome: string; turma_id: string; disciplina_id: string; status?: string }[] }
  >();
  (pdt ?? []).forEach((v) => {
    const dName = (v.disciplinas as unknown as { nome: string })?.nome ?? "";
    const tName = (v.turmas as unknown as { nome: string })?.nome ?? "";
    const g = grouped.get(v.disciplina_id) ?? { disciplinaNome: dName, turmas: [] };
    const rot = (roteiros ?? []).find(
      (r) => r.disciplina_id === v.disciplina_id && r.turma_id === v.turma_id,
    );
    g.turmas.push({
      id: v.id,
      nome: tName,
      turma_id: v.turma_id,
      disciplina_id: v.disciplina_id,
      status: rot?.status,
    });
    grouped.set(v.disciplina_id, g);
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Etapa atual
            </div>
            <div className="text-lg font-semibold">
              {cfg ? `${cfg.etapa_atual}ª Etapa — ${cfg.tipo_avaliacao === "global" ? "Global" : "Parcial"}` : "..."}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">
            Ano letivo {cfg?.ano_letivo ?? ""}
          </Badge>
        </div>
      </section>

      {(!pdt || pdt.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Você ainda não tem disciplinas vinculadas. Peça à coordenação para configurar.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {Array.from(grouped.values()).map((g) => (
          <Card key={g.disciplinaNome}>
            <CardHeader>
              <CardTitle className="text-base">{g.disciplinaNome}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.turmas.map((t) => (
                <Link
                  key={t.id}
                  to="/app/roteiro/$disciplinaId/$turmaId"
                  params={{ disciplinaId: t.disciplina_id, turmaId: t.turma_id }}
                  className="flex items-center justify-between rounded border p-3 transition hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    {t.status === "enviado" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : t.status === "rascunho" ? (
                      <FileEdit className="h-5 w-5 text-amber-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="font-medium">{t.nome}</span>
                  </div>
                  <Badge variant={t.status === "enviado" ? "default" : "secondary"}>
                    {t.status === "enviado" ? "Enviado" : t.status === "rascunho" ? "Rascunho" : "Pendente"}
                  </Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
