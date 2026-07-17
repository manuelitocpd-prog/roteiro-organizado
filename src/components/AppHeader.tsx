import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck, User } from "lucide-react";
import logoAsset from "@/assets/logo-manuelito.png.asset.json";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function AppHeader() {
  const { isAdmin, professorNome, session, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/app" className="flex items-center gap-3">
          <img src={logoAsset.url} alt="Colégio Manuelito" className="h-10 w-auto" />
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-tight">Colégio Manuelito</div>
            <div className="text-xs text-muted-foreground">Roteiros de Prova</div>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          {isAdmin && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/acompanhamento">
                <ShieldCheck className="mr-1 h-4 w-4" /> Painel Admin
              </Link>
            </Button>
          )}
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <User className="h-4 w-4" />
            <span>{professorNome ?? session?.user.email}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </nav>
      </div>
    </header>
  );
}
