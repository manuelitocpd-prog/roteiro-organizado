import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [tdId, setTdId] = useState("");

  // Disciplinas do currículo, filtradas pela turma selecionada
  const disciplinasDaTurma = useMemo(() => {
    return (td ?? [])
      .filter((r) => r.turma_id === turmaId)
      .map((r) => {
        const d = r.disciplinas as unknown as { nome: string } | null;
        return {
          id: r.id, // id da linha em turma_disciplina, usado para criar o vínculo
          disciplina_id: r.disciplina_id,
          nome: d?.nome ?? "",
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [td, turmaId]);

  const opcoesCurriculo = useMemo(() => {
    return (td ?? []).map((r) => ({
      id: r.id,
      turma_id: r.turma_id,
      disciplina_id: r.disciplina_id,
    }));
  }, [td]);

  const resetForm = () => {
    setProfId("");
    setTurmaId("");
    setTdId("");
  };

  const add = useMutation({
    mutationFn: async () => {
      const opt = opcoesCurriculo.find((o) => o.id === tdId);
      if (!opt) throw new Error("Escolha uma combinação");
      const { error } = await supabase.from("professor_disciplina_turma").insert({
        professor_id: profId,
        turma_id: opt.turma_id,
        disciplina_id: opt.disciplina_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setOpen(false);
      resetForm();
      toast.success("Vínculo criado");
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
              <DialogTitle>Vincular professor a uma disciplina/turma</DialogTitle>
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
                <Select
                  value={turmaId}
                  onValueChange={(v) => {
                    setTurmaId(v);
                    setTdId(""); // limpa a disciplina ao trocar de turma
                  }}
                >
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

              <div>
                <Label>Disciplina</Label>
                <Select value={tdId} onValueChange={setTdId} disabled={!turmaId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={turmaId ? "Escolha a disciplina" : "Escolha a turma primeiro"}
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {disciplinasDaTurma.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {turmaId && disciplinasDaTurma.length === 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Essa turma ainda não tem disciplinas cadastradas no currículo.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => add.mutate()} disabled={!profId || !tdId}>
                Criar
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
