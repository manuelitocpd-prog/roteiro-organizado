import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { configQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/etapa")({
  head: () => ({ meta: [{ title: "Etapa atual — Admin" }] }),
  component: Page,
});

function Page() {
  const { data: cfg } = useQuery(configQuery);
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState(1);
  const [tipo, setTipo] = useState<"parcial" | "global">("parcial");
  const [ano, setAno] = useState(2026);

  useEffect(() => {
    if (cfg) {
      setEtapa(cfg.etapa_atual);
      setTipo(cfg.tipo_avaliacao);
      setAno(cfg.ano_letivo);
    }
  }, [cfg]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracao_etapa")
        .update({ etapa_atual: etapa, tipo_avaliacao: tipo, ano_letivo: ano })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração atualizada");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Etapa e tipo de avaliação</CardTitle>
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
        <div className="rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
          Atenção: ao mudar a etapa ou o tipo, os roteiros da configuração anterior ficam travados
          para os professores (só leitura). Você, como admin, ainda pode editá-los.
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
