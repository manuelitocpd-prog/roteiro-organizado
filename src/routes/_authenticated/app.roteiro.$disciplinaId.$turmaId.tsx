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

interface Section {
  _key: string;
  titulo: string;
  topicos: string; // multi-line textarea; each line starts with "- "
}

// Normalize topic lines: strip leading spaces, convert leading "*" to "-",
// ensure each non-empty line starts with "- ".
function normalizeTopicos(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.replace(/^\s+/, "");
      if (!trimmed) return "";
      const body = trimmed.replace(/^[-*•]+\s*/, "");
      return body ? `- ${body}` : "";
    })
    .join("\n");
}

// Convert sections → persisted ItemRoteiro[]
function sectionsToItens(sections: Section[]): ItemRoteiro[] {
  const out: ItemRoteiro[] = [];
  for (const s of sections) {
    const titulo = s.titulo.trim();
    if (titulo) out.push({ tipo: "subtitulo", texto: titulo });
    for (const line of s.topicos.split(/\r?\n/)) {
      const t = line.replace(/^\s+/, "").replace(/^[-*•]+\s*/, "").trim();
      if (t) out.push({ tipo: "topico", texto: t });
    }
  }
  return out;
}

// Convert persisted ItemRoteiro[] → sections
function itensToSections(itens: ItemRoteiro[]): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const it of itens) {
    if (it.tipo === "subtitulo") {
      cur = { _key: makeId(), titulo: it.texto, topicos: "" };
      out.push(cur);
    } else {
      if (!cur) {
        cur = { _key: makeId(), titulo: "", topicos: "" };
        out.push(cur);
      }
      cur.topicos = cur.topicos ? `${cur.topicos}\n- ${it.texto}` : `- ${it.texto}`;
    }
  }
  return out;
}

function SortableSection({
  section,
  onChange,
  onRemove,
  disabled,
}: {
  section: Section;
  onChange: (patch: Partial<Section>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section._key,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="rounded border bg-card p-3"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-2 cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
          aria-label="Reordenar subtítulo"
          disabled={disabled}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-2">
          <Input
            value={section.titulo}
            onChange={(e) => onChange({ titulo: e.target.value })}
            placeholder="Subtítulo (ex: Livro 02 — Unidade 2)"
            disabled={disabled}
            className="font-semibold"
          />
          <Textarea
            value={section.topicos}
            onChange={(e) => onChange({ topicos: e.target.value })}
            onBlur={(e) => onChange({ topicos: normalizeTopicos(e.target.value) })}
            placeholder={"- Autor: **Marcelo Bizerril**\n- Capítulo 3"}
            disabled={disabled}
            rows={4}
            className="font-mono text-sm"
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remover subtítulo"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
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

  const [sections, setSections] = useState<Section[]>([]);
  const [obs, setObs] = useState("");
  const [status, setStatus] = useState<"rascunho" | "enviado">("rascunho");
  const locked =
    !!existing &&
    !!cfg &&
    (existing.etapa !== cfg.etapa_atual || existing.tipo_avaliacao !== cfg.tipo_avaliacao) &&
    !isAdmin;

  useEffect(() => {
    if (!existing) {
      setSections([]);
      setObs("");
      setStatus("rascunho");
      return;
    }
    setSections(itensToSections((existing.itens as unknown as ItemRoteiro[]) ?? []));
    setObs(existing.observacao ?? "");
    setStatus(existing.status);
  }, [existing?.id]);

  const save = useMutation({
    mutationFn: async (novoStatus: "rascunho" | "enviado") => {
      const itens = sectionsToItens(sections);
      const payload = {
        disciplina_id: disciplinaId,
        turma_id: turmaId,
        professor_id: professorId!,
        etapa: cfg!.etapa_atual,
        tipo_avaliacao: cfg!.tipo_avaliacao,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        itens: itens as any,
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
    const oldIdx = sections.findIndex((i) => i._key === active.id);
    const newIdx = sections.findIndex((i) => i._key === over.id);
    setSections((prev) => arrayMove(prev, oldIdx, newIdx));
  };

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return "";
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  };
  const periodoTxt = (() => {
    const i = fmtDate(cfg?.data_inicio_realizacao);
    const f = fmtDate(cfg?.data_fim_realizacao);
    if (i && f && i !== f) return `${i} a ${f}`;
    return i || f || "período não definido";
  })();

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
              <span className="text-xs text-muted-foreground">Realização: {periodoTxt}</span>
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

          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">Como preencher</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>
                Adicione um <strong>subtítulo</strong> para cada bloco (ex.: "Livro 02 — Unidade 2").
              </li>
              <li>
                Escreva os tópicos no campo abaixo, <strong>um por linha</strong>, cada linha
                iniciando com <code>-</code>.
              </li>
              <li>
                Não use <code>*</code> ou outros símbolos no início — use apenas <code>-</code>.
              </li>
              <li>
                Para <strong>negrito</strong> dentro de um tópico, envolva o texto com{" "}
                <code>**dois asteriscos**</code>.
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Conteúdo do roteiro</Label>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={sections.map((i) => i._key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {sections.map((sec, idx) => (
                    <SortableSection
                      key={sec._key}
                      section={sec}
                      disabled={locked}
                      onChange={(patch) =>
                        setSections((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
                        )
                      }
                      onRemove={() => setSections((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() =>
                  setSections((p) => [...p, { _key: makeId(), titulo: "", topicos: "" }])
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
              disabled={locked || save.isPending || sections.length === 0}
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
