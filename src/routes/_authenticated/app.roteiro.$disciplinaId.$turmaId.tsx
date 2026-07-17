import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { configQuery } from "@/lib/queries";
import type { ItemRoteiro } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/app/roteiro/$disciplinaId/$turmaId")({
  head: () => ({ meta: [{ title: "Editar roteiro" }] }),
  component: Editor,
});

function makeId() {
  return Math.random().toString(36).slice(2);
}

interface EditorItem extends ItemRoteiro {
  _key: string;
}

function SortableRow({
  item,
  onChange,
  onRemove,
  disabled,
}: {
  item: EditorItem;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._key,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex items-start gap-2 rounded border bg-card p-2"
    >
      <button
        type="button"
        className="mt-2 cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
        aria-label="Reordenar"
        disabled={disabled}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Select
        value={item.tipo}
        onValueChange={(v) => onChange({ tipo: v as ItemRoteiro["tipo"] })}
        disabled={disabled}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="topico">Tópico</SelectItem>
          <SelectItem value="subtitulo">Subtítulo</SelectItem>
        </SelectContent>
      </Select>
      <Textarea
        value={item.texto}
        onChange={(e) => onChange({ texto: e.target.value })}
        placeholder={
          item.tipo === "subtitulo"
            ? "Ex: Livro 02 — Unidade 2"
            : "Ex: Autor: **Marcelo Bizerril**"
        }
        disabled={disabled}
        className={`min-h-[38px] flex-1 ${item.tipo === "subtitulo" ? "font-semibold" : ""}`}
        rows={1}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Editor() {
  const { disciplinaId, turmaId } = Route.useParams();
  const { professorId, isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data: cfg } = useQuery(configQuery);
  const { data: meta } = useQuery({
    queryKey: ["roteiro-meta", disciplinaId, turmaId],
    queryFn: async () => {
      const [d, t] = await Promise.all([
        supabase.from("disciplinas").select("nome").eq("id", disciplinaId).single(),
        supabase.from("turmas").select("nome, segmento").eq("id", turmaId).single(),
      ]);
      return { disciplina: d.data, turma: t.data };
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["roteiro", disciplinaId, turmaId, cfg?.etapa_atual, cfg?.tipo_avaliacao, professorId],
    enabled: !!cfg && (!!professorId || isAdmin),
    queryFn: async () => {
      const q = supabase
        .from("roteiros")
        .select("*")
        .eq("disciplina_id", disciplinaId)
        .eq("turma_id", turmaId)
        .eq("etapa", cfg!.etapa_atual)
        .eq("tipo_avaliacao", cfg!.tipo_avaliacao)
        .maybeSingle();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const [itens, setItens] = useState<EditorItem[]>([]);
  const [obs, setObs] = useState("");
  const [dIni, setDIni] = useState("");
  const [dFim, setDFim] = useState("");
  const [status, setStatus] = useState<"rascunho" | "enviado">("rascunho");
  const locked =
    !!existing &&
    !!cfg &&
    (existing.etapa !== cfg.etapa_atual || existing.tipo_avaliacao !== cfg.tipo_avaliacao) &&
    !isAdmin;

  useEffect(() => {
    if (!existing) {
      setItens([]);
      setObs("");
      setDIni("");
      setDFim("");
      setStatus("rascunho");
      return;
    }
    setItens(
      ((existing.itens as unknown as ItemRoteiro[]) ?? []).map((i) => ({ ...i, _key: makeId() })),
    );
    setObs(existing.observacao ?? "");
    setDIni(existing.data_inicio_realizacao ?? "");
    setDFim(existing.data_fim_realizacao ?? "");
    setStatus(existing.status);
  }, [existing?.id]);

  const save = useMutation({
    mutationFn: async (novoStatus: "rascunho" | "enviado") => {
      const payload = {
        disciplina_id: disciplinaId,
        turma_id: turmaId,
        professor_id: professorId!,
        etapa: cfg!.etapa_atual, // ignored by trigger on insert; kept for typing
        tipo_avaliacao: cfg!.tipo_avaliacao,
        data_inicio_realizacao: dIni || null,
        data_fim_realizacao: dFim || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itens: itens.map(({ _key, ...i }) => i) as any,
        observacao: obs || null,
        status: novoStatus,
      };
      if (existing) {
        const { error } = await supabase.from("roteiros").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("roteiros").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_d, novoStatus) => {
      toast.success(novoStatus === "enviado" ? "Roteiro enviado!" : "Rascunho salvo");
      qc.invalidateQueries();
      if (novoStatus === "enviado") navigate({ to: "/app" });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = itens.findIndex((i) => i._key === active.id);
    const newIdx = itens.findIndex((i) => i._key === over.id);
    setItens((prev) => arrayMove(prev, oldIdx, newIdx));
  };

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app">
          <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl">{meta?.disciplina?.nome ?? "..."}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {meta?.turma?.nome} • {meta?.turma?.segmento}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge>
                {cfg?.etapa_atual}ª Etapa —{" "}
                {cfg?.tipo_avaliacao === "global" ? "Global" : "Parcial"}
              </Badge>
              {status === "enviado" && <Badge variant="secondary">Enviado</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {locked && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Este roteiro é de uma etapa/tipo passado e está travado (só leitura).
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dini">Início da realização</Label>
              <Input
                id="dini"
                type="date"
                value={dIni}
                onChange={(e) => setDIni(e.target.value)}
                disabled={locked}
              />
            </div>
            <div>
              <Label htmlFor="dfim">Fim da realização</Label>
              <Input
                id="dfim"
                type="date"
                value={dFim}
                onChange={(e) => setDFim(e.target.value)}
                disabled={locked}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Conteúdo do roteiro</Label>
              <p className="text-xs text-muted-foreground">
                Use <code>**texto**</code> para negrito dentro de um tópico
              </p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={itens.map((i) => i._key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {itens.map((it, idx) => (
                    <SortableRow
                      key={it._key}
                      item={it}
                      disabled={locked}
                      onChange={(patch) =>
                        setItens((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
                      }
                      onRemove={() => setItens((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() =>
                  setItens((p) => [...p, { _key: makeId(), tipo: "topico", texto: "" }])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Tópico
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() =>
                  setItens((p) => [...p, { _key: makeId(), tipo: "subtitulo", texto: "" }])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Subtítulo
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Textarea
              id="obs"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={locked}
              rows={2}
              placeholder="Aparece como OBS: ao final da disciplina"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="outline"
              disabled={locked || save.isPending}
              onClick={() => save.mutate("rascunho")}
            >
              Salvar rascunho
            </Button>
            <Button
              disabled={locked || save.isPending || itens.length === 0}
              onClick={() => save.mutate("enviado")}
            >
              Enviar roteiro
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
