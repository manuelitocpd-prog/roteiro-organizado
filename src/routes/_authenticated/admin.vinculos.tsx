import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { pdtQuery, professoresQuery, turmaDisciplinaQuery, turmasQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/vinculos")({
  head: () => ({ meta: [{ title: "Vínculos — Admin" }] }),
  component: Page,
});

function Page() {
  const { data: profs } = useQuery(professoresQuery);
  const { data: turmas } = useQuery(turmasQuery);
  const { data: td } = useQuery(turmaDisciplinaQuery);
  const { data: pdt } = useQuery(pdtQuery);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [profId, setProfId] = useState("");
  const [turmaId, setTurmaId] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set()); // ids de turma_disciplina

  // Disciplinas do currículo da turma escolhida
  const disciplinasDaTurma = useMemo(() => {
    return (td ?? [])
      .filter((r) => r.turma_id === turmaId)
      .map((r) => {
        const d = r.disciplinas as unknown as { nome: string } | null;
        return {
          id: r.id, // id da linha em turma_disciplina
          disciplina_id: r.disciplina_id,
          nome: d?.nome ?? "",
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [td, turmaId]);

  // Vínculos já existentes desse professor nessa turma (para pré-marcar os checkboxes)
  const vinculosAtuais = useMemo(() => {
    if (!profId || !turmaId) return new Set<string>();
    const jaVinculadas = new Set(
      (pdt ?? [])
        .filter((v) => v.professor_id === profId && v.turma_id === turmaId)
        .map((v) => v.disciplina_id),
    );
    // Precisamos do id de turma_disciplina correspondente, não do disciplina_id
    const ids = disciplinasDaTurma.filter((d) => jaVinculadas.has(d.disciplina_id)).map((d) => d.id);
    return new Set(ids);
  }, [pdt, profId, turmaId, disciplinasDaTurma]);

  // Sempre que trocar professor/turma, reinicia a seleção com o que já está vinculado
  useEffect(() => {
    setSelecionadas(new Set(vinculosAtuais));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profId, turmaId]);

  const resetForm = () => {
    setProfId("");
    setTurmaId("");
    setSelecionadas(new Set());
  };

  const toggleDisciplina = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const marcarTodas = () => setSelecionadas(new Set(disciplinasDaTurma.map((d) => d.id)));
  const desmarcarTodas = () => setSelecionadas(new Set());

  const salvar = useMutation({
    mutationFn: async () => {
      // Diferença entre o que já existia e o que ficou marcado agora:
      // cria os novos vínculos marcados e remove os que foram desmarcados.
      const paraCriar = disciplinasDaTurma.filter(
        (d) => selecionadas.has(d.id) && !vinculosAtuais.has(d.id),
      );
      const paraRemover = disciplinasDaTurma.filter(
        (d) => !selecionadas.has(d.id) && vinculosAtuais.has(d.id),
      );

      if (paraCriar.length > 0) {
        const { error } = await supabase.from("professor_disciplina_turma").insert(
          paraCriar.map((d) => ({
            professor_id: profId,
            turma_id: turmaId,
            disciplina_id: d.disciplina_id,
          })),
        );
        if (error) throw error;
      }

      if (paraRemover.length > 0) {
        const idsExistentes = (pdt ?? [])
          .filter(
            (v) =>
              v.professor_id === profId &&
              v.turma_id === turmaId &&
              paraRemover.some((d) => d.disciplina_id === v.disciplina_id),
          )
          .map((v) => v.id);
        const { error } = await supabase
          .from("professor_disciplina_turma")
          .delete()
          .in("id", idsExistentes);
        if (error) throw error;
      }

      return paraCriar.length + paraRemover.length;
    },
    onSuccess: (qtd) => {
      qc.invalidateQueries();
      setOpen(false);
      resetForm();
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Professores × Turmas × Disciplinas</CardTitle>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Novo vínculo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular disciplinas a um professor</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Professor</Label>
                <Select value={profId} onValueChange={setProfId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha" />
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

              <div>
                <Label>Turma</Label>
                <Select value={turmaId} onValueChange={setTurmaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a turma" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {turmas?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} ({t.segmento})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {turmaId && (
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Disciplinas dessa turma</Label>
                    {disciplinasDaTurma.length > 0 && (
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={marcarTodas}
                        >
                          Marcar todas
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground underline"
                          onClick={desmarcarTodas}
                        >
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>

                  {disciplinasDaTurma.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Essa turma ainda não tem disciplinas cadastradas no currículo.
                    </p>
                  ) : (
                    <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                      {disciplinasDaTurma.map((d) => (
                        <label
                          key={d.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60"
                        >
                          <Checkbox
                            checked={selecionadas.has(d.id)}
                            onCheckedChange={() => toggleDisciplina(d.id)}
                          />
                          {d.nome}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => salvar.mutate()}
                disabled={!profId || !turmaId || salvar.isPending}
              >
                Salvar vínculos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
  );
}
