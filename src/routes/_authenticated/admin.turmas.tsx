import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { disciplinasQuery, turmasQuery, turmaDisciplinaQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/turmas")({
  head: () => ({ meta: [{ title: "Currículo — Admin" }] }),
  component: Page,
});

function SortableItem({
  id,
  nome,
  onRemove,
}: {
  id: string;
  nome: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex items-center gap-2 rounded border bg-card p-2"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1">{nome}</span>
      <Button size="icon" variant="ghost" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Page() {
  const qc = useQueryClient();
  const { data: turmas } = useQuery(turmasQuery);
  const { data: disciplinas } = useQuery(disciplinasQuery);
  const { data: td } = useQuery(turmaDisciplinaQuery);
  const [selectedTurma, setSelectedTurma] = useState<string>("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [novaDisc, setNovaDisc] = useState("");
  const [novaDiscNome, setNovaDiscNome] = useState("");
  const [novaTurmaOpen, setNovaTurmaOpen] = useState(false);
  const [novaTurmaNome, setNovaTurmaNome] = useState("");
  const [novaTurmaSeg, setNovaTurmaSeg] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const rows = useMemo(() => {
    if (!td || !selectedTurma) return [];
    return td
      .filter((r) => r.turma_id === selectedTurma)
      .sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  }, [td, selectedTurma]);

  const reorder = useMutation({
    mutationFn: async (novaOrdem: { id: string; ordem_exibicao: number }[]) => {
      // update one-by-one to satisfy RLS/unique
      for (const r of novaOrdem) {
        const { error } = await supabase
          .from("turma_disciplina")
          .update({ ordem_exibicao: r.ordem_exibicao })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["turma_disciplina"] }),
  });

  const addTD = useMutation({
    mutationFn: async () => {
      const maxOrdem = Math.max(0, ...rows.map((r) => r.ordem_exibicao));
      const { error } = await supabase.from("turma_disciplina").insert({
        turma_id: selectedTurma,
        disciplina_id: novaDisc,
        ordem_exibicao: maxOrdem + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setAddDialogOpen(false);
      setNovaDisc("");
      qc.invalidateQueries({ queryKey: ["turma_disciplina"] });
      toast.success("Disciplina adicionada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTD = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("turma_disciplina").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["turma_disciplina"] });
      toast.success("Removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createDisc = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase.from("disciplinas").insert({ nome }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["disciplinas"] });
      setNovaDisc(d.id);
      setNovaDiscNome("");
      toast.success("Disciplina criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createTurma = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("turmas")
        .insert({ nome: novaTurmaNome, segmento: novaTurmaSeg })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["turmas"] });
      setSelectedTurma(t.id);
      setNovaTurmaOpen(false);
      setNovaTurmaNome("");
      setNovaTurmaSeg("");
      toast.success("Turma criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = rows.findIndex((r) => r.id === active.id);
    const newIdx = rows.findIndex((r) => r.id === over.id);
    const novo = arrayMove(rows, oldIdx, newIdx);
    reorder.mutate(novo.map((r, i) => ({ id: r.id, ordem_exibicao: i + 1 })));
  };

  const disponiveis =
    disciplinas?.filter((d) => !rows.some((r) => r.disciplina_id === d.id)) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Currículo por turma</CardTitle>
          <Dialog open={novaTurmaOpen} onOpenChange={setNovaTurmaOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1 h-4 w-4" /> Nova turma
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova turma</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={novaTurmaNome} onChange={(e) => setNovaTurmaNome(e.target.value)} />
                </div>
                <div>
                  <Label>Segmento</Label>
                  <Input value={novaTurmaSeg} onChange={(e) => setNovaTurmaSeg(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => createTurma.mutate()} disabled={!novaTurmaNome || !novaTurmaSeg}>
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Turma</Label>
            <Select value={selectedTurma} onValueChange={setSelectedTurma}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha uma turma" />
              </SelectTrigger>
              <SelectContent>
                {turmas?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.segmento} — {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTurma && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Arraste para reordenar. Essa é a ordem de exibição no PDF desta turma.
                </p>
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-1 h-4 w-4" /> Adicionar disciplina
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar disciplina à turma</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Disciplina existente</Label>
                        <Select value={novaDisc} onValueChange={setNovaDisc}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha" />
                          </SelectTrigger>
                          <SelectContent>
                            {disponiveis.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="rounded border bg-muted/30 p-3">
                        <Label className="text-xs">Ou criar nova disciplina</Label>
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={novaDiscNome}
                            onChange={(e) => setNovaDiscNome(e.target.value)}
                            placeholder="Nome"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!novaDiscNome}
                            onClick={() => createDisc.mutate(novaDiscNome)}
                          >
                            Criar
                          </Button>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button disabled={!novaDisc} onClick={() => addTD.mutate()}>
                        Adicionar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {rows.map((r) => {
                      const d = r.disciplinas as unknown as { nome: string } | null;
                      return (
                        <SortableItem
                          key={r.id}
                          id={r.id}
                          nome={d?.nome ?? ""}
                          onRemove={() => removeTD.mutate(r.id)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
