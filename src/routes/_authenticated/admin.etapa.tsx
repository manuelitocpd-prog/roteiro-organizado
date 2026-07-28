import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { SEGMENTOS, configPorSegmento, configsQuery, type ConfigEtapa } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/etapa")({
  head: () => ({ meta: [{ title: "Etapa atual — Admin" }] }),
  component: Page,
});

const fmt = (d: string | null) => {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

function Page() {
  const { data: cfgs } = useQuery(configsQuery);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por segmento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {SEGMENTOS.map((s) => {
            const c = configPorSegmento(cfgs, s.valor);
            return (
              <div key={s.valor} className="rounded border p-3 text-sm">
                <p className="font-semibold">{s.label}</p>
                <p className="text-muted-foreground">
                  {c ? `${c.etapa_atual}ª Etapa — ${c.tipo_avaliacao === "global" ? "Global" : "Parcial"}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Realização: {fmt(c?.data_inicio_realizacao ?? null)} a {fmt(c?.data_fim_realizacao ?? null)}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Tabs defaultValue={SEGMENTOS[0].valor}>
        <TabsList>
          {SEGMENTOS.map((s) => (
            <TabsTrigger key={s.valor} value={s.valor}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SEGMENTOS.map((s) => (
          <TabsContent key={s.valor} value={s.valor}>
            <SegmentoForm label={s.label} cfg={configPorSegmento(cfgs, s.valor)} segmento={s.valor} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SegmentoForm({
  label,
  segmento,
  cfg,
}: {
  label: string;
  segmento: string;
  cfg: ConfigEtapa | undefined;
}) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState(1);
  const [tipo, setTipo] = useState<"parcial" | "global">("parcial");
  const [ano, setAno] = useState(2026);
  const [dIni, setDIni] = useState("");
  const [dFim, setDFim] = useState("");

  useEffect(() => {
    if (cfg) {
      setEtapa(cfg.etapa_atual);
      setTipo(cfg.tipo_avaliacao);
      setAno(cfg.ano_letivo);
      setDIni(cfg.data_inicio_realizacao ?? "");
      setDFim(cfg.data_fim_realizacao ?? "");
    }
  }, [cfg]);

  const save = useMutation({
    mutationFn: async () => {
      const values = {
        etapa_atual: etapa,
        tipo_avaliacao: tipo,
        ano_letivo: ano,
        data_inicio_realizacao: dIni || null,
        data_fim_realizacao: dFim || null,
      };
      if (cfg) {
        const { error } = await supabase.from("configuracao_etapa").update(values).eq("id", cfg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("configuracao_etapa")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ ...values, segmento } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`Configuração de ${label} atualizada`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{label} — etapa e tipo de avaliação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Etapa</Label>
          <Select value={String(etapa)} onValueChange={(v) => setEtapa(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}ª Etapa
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo de avaliação</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as "parcial" | "global")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Ano letivo</Label>
          <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={`dini-${segmento}`}>Início da realização</Label>
            <Input
              id={`dini-${segmento}`}
              type="date"
              value={dIni}
              onChange={(e) => setDIni(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`dfim-${segmento}`}>Fim da realização</Label>
            <Input
              id={`dfim-${segmento}`}
              type="date"
              value={dFim}
              onChange={(e) => setDFim(e.target.value)}
            />
          </div>
        </div>
        <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
          Esta configuração vale apenas para as turmas de {label}. Ao mudar a etapa ou o tipo, os
          roteiros da configuração anterior ficam travados para os professores (só leitura). Você,
          como admin, ainda pode editá-los.
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
