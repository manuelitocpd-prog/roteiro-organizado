import { createFileRoute, Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const links = [
  { to: "/admin/acompanhamento", label: "Acompanhamento" },
  { to: "/admin/etapa", label: "Etapa atual" },
  { to: "/admin/turmas", label: "Currículo por turma" },
  { to: "/admin/professores", label: "Professores" },
  { to: "/admin/vinculos", label: "Vínculos" },
] as const;

function AdminLayout() {
  const { isAdmin, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/app" replace />;
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <nav className="mb-6 flex flex-wrap gap-2 border-b pb-2">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition",
                loc.pathname === l.to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
