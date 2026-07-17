import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createProfessorWithAuth, resetProfessorSenha } from "@/lib/admin.functions";
import { professoresQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/admin/professores")({
  head: () => ({ meta: [{ title: "Professores — Admin" }] }),
  component: Page,
});

function Page() {
  const { data: profs } = useQuery(professoresQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);
  const createFn = useServerFn(createProfessorWithAuth);
  const resetFn = useServerFn(resetProfessorSenha);

  const create = useMutation({
    mutationFn: () => createFn({ data: { nome, email } }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      setOpen(false);
      setSenhaGerada({ email, senha: r.senhaInicial });
      setNome("");
      setEmail("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetSenha = useMutation({
    mutationFn: (id: string) => resetFn({ data: { professor_id: id } }),
    onSuccess: (r, id) => {
      const prof = profs?.find((p) => p.id === id);
      if (prof) setSenhaGerada({ email: prof.email, senha: r.senhaInicial });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Professores</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> Novo professor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar professor</DialogTitle>
                <DialogDescription>
                  O sistema criará automaticamente o login com uma senha inicial.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!nome || !email || create.isPending}
                >
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
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profs?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.nome}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resetSenha.isPending}
                      onClick={() => resetSenha.mutate(p.id)}
                    >
                      <KeyRound className="mr-1 h-3 w-3" /> Resetar senha
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!senhaGerada} onOpenChange={(o) => !o && setSenhaGerada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha inicial gerada</DialogTitle>
            <DialogDescription>
              Copie e envie para o professor. Ela só aparece uma vez.
            </DialogDescription>
          </DialogHeader>
          {senhaGerada && (
            <div className="space-y-2">
              <div className="text-sm">
                <strong>Email:</strong> {senhaGerada.email}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted p-2 font-mono text-sm">{senhaGerada.senha}</code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(senhaGerada.senha);
                    toast.success("Copiado");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
