import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { pdtQuery, professoresQuery, turmaDisciplinaQuery, turmasQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/vinculos")({
  head: () => ({ meta: [{ title: "Vínculos — Admin" }] }),
  component: Page,
});

type Turma = { id: string; nome: string; segmento: string };

function Page() {
  const { data: profs } = useQuery(professoresQuery);
  const { data: turmas } = useQuery(turmasQuery);
  const { data: td } = useQuery(turmaDisciplinaQuery);
  const { data: pdt } = useQuery(pdtQuery);
  const qc = useQueryClient();

  const [profId, setProfId] = useState("");
  // chave "turmaId:disciplinaId" para cada disciplina marcada
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  // Agrupa disciplinas por turma a partir do currículo
  const disciplinasPorTurma = useMemo(() => {
    const map = new Map<string, { disciplina_id: string; nome: string }[]>();
    (td ?? []).forEach((r) => {
      const d = r.disciplinas as unknown as { nome: string } | null;
      const arr = map.get(r.turma_id) ?? [];
      arr.push({ disciplina_id: r.disciplina_id, nome: d?.nome ?? "" });
      map.set(r.turma_id, arr);
    });
    for (const arr of map.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome));
    return map;
  }, [td]);

  // Vínculos atuais do professor selecionado (Set de "turmaId:disciplinaId")
  const vinculosAtuais = useMemo(() => {
    const s = new Set<string>();
    if (!profId) return s;
    (pdt ?? [])
      .filter((v) => v.professor_id === profId)
      .forEach((v) => s.add(`${v.turma_id}:${v.disciplina_id}`));
    return s;
  }, [pdt, profId]);

  // Sempre que trocar professor, reinicia a seleção com o que já está vinculado
  useEffect(() => {
    setSelecionadas(new Set(vinculosAtuais));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profId]);

  const toggleDisciplina = (turmaId: string, disciplinaId: string) => {
    const key = `${turmaId}:${disciplinaId}`;
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleTurmaToda = (turmaId: string, marcar: boolean) => {
    const ds = disciplinasPorTurma.get(turmaId) ?? [];
    setSelecionadas((prev) => {
      const next = new Set(prev);
      ds.forEach((d) => {
        const key = `${turmaId}:${d.disciplina_id}`;
        if (marcar) next.add(key);
        else next.delete(key);
      });
      return next;
    });
  };

  const salvar = useMutation({
    mutationFn: async () => {
      const paraCriar: { turma_id: string; disciplina_id: string }[] = [];
      const paraRemover: { turma_id: string; disciplina_id: string }[] = [];

      const todas = new Set<string>([...selecionadas, ...vinculosAtuais]);
      todas.forEach((key) => {
        const [turma_id, disciplina_id] = key.split(":");
        const marcada = selecionadas.has(key);
        const jaVinculada = vinculosAtuais.has(key);
        if (marcada && !jaVinculada) paraCriar.push({ turma_id, disciplina_id });
        else if (!marcada && jaVinculada) paraRemover.push({ turma_id, disciplina_id });
      });

      if (paraCriar.length > 0) {
        const { error } = await supabase.from("professor_disciplina_turma").insert(
          paraCriar.map((r) => ({ ...r, professor_id: profId })),
        );
        if (error) throw error;
      }

      if (paraRemover.length > 0) {
        const idsExistentes = (pdt ?? [])
          .filter(
            (v) =>
              v.professor_id === profId &&
              paraRemover.some(
                (r) => r.turma_id === v.turma_id && r.disciplina_id === v.disciplina_id,
              ),
          )
          .map((v) => v.id);
        if (idsExistentes.length > 0) {
          const { error } = await supabase
            .from("professor_disciplina_turma")
            .delete()
            .in("id", idsExistentes);
          if (error) throw error;
        }
      }

      return paraCriar.length + paraRemover.length;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries();
      toast.success(qtd > 0 ? "Vínculos atualizados" : "Nenhuma alteração");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("professor_disciplina_turma").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });

  // Agrupa turmas por segmento para exibição
  const turmasPorSegmento = useMemo(() => {
    const map = new Map<string, Turma[]>();
    (turmas ?? []).forEach((t) => {
      const arr = map.get(t.segmento) ?? [];
      arr.push(t as Turma);
      map.set(t.segmento, arr);
    });
    return Array.from(map.entries());
  }, [turmas]);

  const houveMudanca = useMemo(() => {
    if (selecionadas.size !== vinculosAtuais.size) return true;
    for (const k of selecionadas) if (!vinculosAtuais.has(k)) return true;
    return false;
  }, [selecionadas, vinculosAtuais]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vincular disciplinas a um professor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <Label>Professor</Label>
            <Select value={profId} onValueChange={setProfId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um professor" />
              </SelectTrigger>
              <SelectContent>
                {profs?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {profId && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {turmasPorSegmento.map(([segmento, ts]) => (
                  <div key={segmento} className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {segmento}
                    </h3>
                    {ts.map((t) => {
                      const ds = disciplinasPorTurma.get(t.id) ?? [];
                      const totalMarcadas = ds.filter((d) =>
                        selecionadas.has(`${t.id}:${d.disciplina_id}`),
                      ).length;
                      const todasMarcadas = ds.length > 0 && totalMarcadas === ds.length;
                      return (
                        <div key={t.id} className="rounded-md border">
                          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                              <Checkbox
                                checked={
                                  todasMarcadas
                                    ? true
                                    : totalMarcadas > 0
                                      ? "indeterminate"
                                      : false
                                }
                                onCheckedChange={(v) => toggleTurmaToda(t.id, v === true)}
                                disabled={ds.length === 0}
                              />
                              {t.nome}
                            </label>
                            <span className="text-xs text-muted-foreground">
                              {totalMarcadas}/{ds.length}
                            </span>
                          </div>
                          {ds.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                              Sem disciplinas no currículo.
                            </p>
                          ) : (
                            <div className="space-y-1 p-2">
                              {ds.map((d) => {
                                const key = `${t.id}:${d.disciplina_id}`;
                                return (
                                  <label
                                    key={key}
                                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60"
                                  >
                                    <Checkbox
                                      checked={selecionadas.has(key)}
                                      onCheckedChange={() =>
                                        toggleDisciplina(t.id, d.disciplina_id)
                                      }
                                    />
                                    {d.nome}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setSelecionadas(new Set(vinculosAtuais))}
                  disabled={!houveMudanca || salvar.isPending}
                >
                  Descartar alterações
                </Button>
                <Button
                  onClick={() => salvar.mutate()}
                  disabled={!houveMudanca || salvar.isPending}
                >
                  Salvar vínculos
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Todos os vínculos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Professor</TableHead>
                <TableHead>Turma</TableHead>
                <TableHead>Disciplina</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pdt?.map((v) => {
                const p = v.professores as unknown as { nome: string } | null;
                const t = v.turmas as unknown as { nome: string } | null;
                const d = v.disciplinas as unknown as { nome: string } | null;
                return (
                  <TableRow key={v.id}>
                    <TableCell>{p?.nome}</TableCell>
                    <TableCell>{t?.nome}</TableCell>
                    <TableCell>{d?.nome}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(v.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
