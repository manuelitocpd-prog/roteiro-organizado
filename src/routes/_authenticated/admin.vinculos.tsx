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
import { pdtQuery, professoresQuery, turmaDisciplinaQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/vinculos")({
  head: () => ({ meta: [{ title: "Vínculos — Admin" }] }),
  component: Page,
});

function Page() {
  const { data: profs } = useQuery(professoresQuery);
  const { data: td } = useQuery(turmaDisciplinaQuery);
  const { data: pdt } = useQuery(pdtQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profId, setProfId] = useState("");
  const [tdId, setTdId] = useState("");

  const opcoesCurriculo = useMemo(() => {
    return (td ?? []).map((r) => {
      const d = r.disciplinas as unknown as { nome: string } | null;
      const t = r.turmas as unknown as { nome: string } | null;
      return {
        id: r.id,
        turma_id: r.turma_id,
        disciplina_id: r.disciplina_id,
        label: `${t?.nome} • ${d?.nome}`,
      };
    });
  }, [td]);

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
      setProfId("");
      setTdId("");
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
        <Dialog open={open} onOpenChange={setOpen}>
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
                <Label>Turma • Disciplina</Label>
                <Select value={tdId} onValueChange={setTdId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {opcoesCurriculo.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
