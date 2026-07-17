import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Gate,
});

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
