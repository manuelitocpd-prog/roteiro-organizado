import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bold, Italic, Underline as UnderlineIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { configQuery } from "@/lib/queries";
import type { ItemRoteiro } from "@/lib/types";
import { itensToHtml, htmlToItens, isHtmlPayload } from "@/lib/roteiro-html";

export const Route = createFileRoute("/_authenticated/app/roteiro/$disciplinaId/$turmaId")({
  head: () => ({ meta: [{ title: "Editar roteiro" }] }),
  component: Editor,
});

function Editor() {
  const { disciplinaId, turmaId } = Route.useParams();
  const { professorId, isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const { data: profsVinculados } = useQuery({
    queryKey: ["pdt-professores", disciplinaId, turmaId],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professor_disciplina_turma")
        .select("professor_id, professores(id, nome)")
        .eq("disciplina_id", disciplinaId)
        .eq("turma_id", turmaId);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.professores as { id: string; nome: string } | null)
        .filter((p): p is { id: string; nome: string } => !!p);
    },
  });

  const [selectedProfessorId, setSelectedProfessorId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin && !selectedProfessorId && profsVinculados && profsVinculados.length === 1) {
      setSelectedProfessorId(profsVinculados[0].id);
    }
  }, [isAdmin, profsVinculados, selectedProfessorId]);

  const effectiveProfessorId = isAdmin ? selectedProfessorId : professorId;

  const { data: existing } = useQuery({
    queryKey: [
      "roteiro",
      disciplinaId,
      turmaId,
      cfg?.etapa_atual,
      cfg?.tipo_avaliacao,
      isAdmin ? selectedProfessorId : professorId,
    ],
    enabled: !!cfg && (isAdmin ? !!selectedProfessorId : !!professorId),
    queryFn: async () => {
      let q = supabase
        .from("roteiros")
        .select("*")
        .eq("disciplina_id", disciplinaId)
        .eq("turma_id", turmaId)
        .eq("etapa", cfg!.etapa_atual)
        .eq("tipo_avaliacao", cfg!.tipo_avaliacao);
      if (isAdmin && selectedProfessorId) {
        q = q.eq("professor_id", selectedProfessorId);
      }
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const [obs, setObs] = useState("");
  const [status, setStatus] = useState<"rascunho" | "enviado">("rascunho");
  const [isEmpty, setIsEmpty] = useState(true);
  const [activeFmt, setActiveFmt] = useState({ bold: false, italic: false, underline: false });
  const locked =
    !!existing &&
    !!cfg &&
    (existing.etapa !== cfg.etapa_atual || existing.tipo_avaliacao !== cfg.tipo_avaliacao) &&
    !isAdmin;

  useEffect(() => {
    const itens = ((existing?.itens as unknown as ItemRoteiro[]) ?? []);
    const html = isHtmlPayload(itens) ? itens[0].texto : itensToHtml(itens);
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
      setIsEmpty(!editorRef.current.textContent?.trim());
    }
    setObs(existing?.observacao ?? "");
    setStatus(existing?.status ?? "rascunho");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const exec = (cmd: "bold" | "italic" | "underline") => {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    updateActiveFmt();
  };

  const updateActiveFmt = () => {
    // Só atualiza se a seleção atual estiver dentro do editor
    const sel = document.getSelection();
    const anchorNode = sel?.anchorNode;
    if (!editorRef.current || !anchorNode || !editorRef.current.contains(anchorNode)) return;
    setActiveFmt({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  useEffect(() => {
    document.addEventListener("selectionchange", updateActiveFmt);
    return () => document.removeEventListener("selectionchange", updateActiveFmt);
  }, []);

  const onInput = () => {
    setIsEmpty(!editorRef.current?.textContent?.trim());
    updateActiveFmt();
  };

  const save = useMutation({
    mutationFn: async (novoStatus: "rascunho" | "enviado") => {
      if (!effectiveProfessorId) {
        throw new Error(
          isAdmin
            ? "Selecione o professor em cujo nome o roteiro será enviado."
            : "Professor não identificado.",
        );
      }
      const html = editorRef.current?.innerHTML ?? "";
      const itens = htmlToItens(html);
      const payload = {
        disciplina_id: disciplinaId,
        turma_id: turmaId,
        professor_id: effectiveProfessorId,
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
            <p className="mt-1">
              Escreva o conteúdo da prova no campo abaixo. Use os botões da barra para aplicar{" "}
              <strong>negrito</strong>, <em>itálico</em> ou{" "}
              <span className="underline">sublinhado</span> ao texto selecionado.
            </p>
          </div>

          <div>
            <Label>Conteúdo do roteiro</Label>
            <div className="mt-2 overflow-hidden rounded-md border">
              <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1">
                <Button
                  type="button"
                  size="icon"
                  variant={activeFmt.bold ? "secondary" : "ghost"}
                  className={activeFmt.bold ? "h-8 w-8 bg-primary/15 text-primary" : "h-8 w-8"}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec("bold");
                  }}
                  disabled={locked}
                  aria-label="Negrito"
                  aria-pressed={activeFmt.bold}
                  title="Negrito (Ctrl+B)"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={activeFmt.italic ? "secondary" : "ghost"}
                  className={activeFmt.italic ? "h-8 w-8 bg-primary/15 text-primary" : "h-8 w-8"}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec("italic");
                  }}
                  disabled={locked}
                  aria-label="Itálico"
                  aria-pressed={activeFmt.italic}
                  title="Itálico (Ctrl+I)"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={activeFmt.underline ? "secondary" : "ghost"}
                  className={activeFmt.underline ? "h-8 w-8 bg-primary/15 text-primary" : "h-8 w-8"}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec("underline");
                  }}
                  disabled={locked}
                  aria-label="Sublinhado"
                  aria-pressed={activeFmt.underline}
                  title="Sublinhado (Ctrl+U)"
                >
                  <UnderlineIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                {isEmpty && (
                  <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
                    Digite o conteúdo do roteiro…
                  </div>
                )}
                <div
                  ref={editorRef}
                  contentEditable={!locked}
                  suppressContentEditableWarning
                  onInput={onInput}
                  className="min-h-[240px] w-full px-3 py-3 text-sm outline-none [&_p]:my-1 [&_u]:underline"
                />
              </div>
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
              disabled={locked || save.isPending || isEmpty}
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
