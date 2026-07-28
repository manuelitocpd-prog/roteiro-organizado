import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, FileEdit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { configPorSegmento, configsQuery, segmentoLabel } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Minhas disciplinas — Roteiros" }] }),
  component: Home,
});

function Home() {
  const { professorId, isAdmin, loading } = useAuth();
  const { data: cfgs } = useQuery(configsQuery);
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
    queryKey: ["roteiros-me", professorId],
    enabled: !!professorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roteiros")
        .select("id, disciplina_id, turma_id, status, etapa, tipo_avaliacao")
        .eq("professor_id", professorId!);
      if (error) throw error;
      return data;
    },
  });

  if (loading) return null;
  if (!professorId && isAdmin) return <Navigate to="/admin/acompanhamento" replace />;

  const segmentosDoProfessor = Array.from(
    new Set(
      (pdt ?? [])
        .map((v) => (v.turmas as unknown as { segmento: string } | null)?.segmento)
        .filter((s): s is string => !!s),
    ),
  );

  const grouped = new Map<
    string,
    { disciplinaNome: string; turmas: { id: string; nome: string; turma_id: string; disciplina_id: string; status?: string }[] }
  >();
  (pdt ?? []).forEach((v) => {
    const dName = (v.disciplinas as unknown as { nome: string })?.nome ?? "";
    const turma = v.turmas as unknown as { nome: string; segmento: string } | null;
    const tName = turma?.nome ?? "";
    const cfg = configPorSegmento(cfgs, turma?.segmento);
    const g = grouped.get(v.disciplina_id) ?? { disciplinaNome: dName, turmas: [] };
    const rot = (roteiros ?? []).find(
      (r) =>
        r.disciplina_id === v.disciplina_id &&
        r.turma_id === v.turma_id &&
        !!cfg &&
        r.etapa === cfg.etapa_atual &&
        r.tipo_avaliacao === cfg.tipo_avaliacao,
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
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Etapa atual
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {segmentosDoProfessor.map((seg) => {
            const c = configPorSegmento(cfgs, seg);
            return (
              <div key={seg} className="flex items-center justify-between gap-2 rounded border p-2">
                <div>
                  <div className="text-xs text-muted-foreground">{segmentoLabel(seg)}</div>
                  <div className="font-semibold">
                    {c
                      ? `${c.etapa_atual}ª Etapa — ${c.tipo_avaliacao === "global" ? "Global" : "Parcial"}`
                      : "Não configurada"}
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {c?.ano_letivo ?? ""}
                </Badge>
              </div>
            );
          })}
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
