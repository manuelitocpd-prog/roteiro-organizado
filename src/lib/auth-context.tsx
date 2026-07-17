import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  professorId: string | null;
  professorNome: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null,
  loading: true,
  isAdmin: false,
  professorId: null,
  professorNome: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [professorId, setProfessorId] = useState<string | null>(null);
  const [professorNome, setProfessorNome] = useState<string | null>(null);
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setSession(s);
        router.invalidate();
        if (event !== "SIGNED_OUT") qc.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user) {
        setIsAdmin(false);
        setProfessorId(null);
        setProfessorNome(null);
        return;
      }
      const [roles, prof] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase.from("professores").select("id, nome").eq("user_id", session.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setIsAdmin((roles.data ?? []).some((r) => r.role === "admin"));
      setProfessorId(prof.data?.id ?? null);
      setProfessorNome(prof.data?.nome ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, loading, isAdmin, professorId, professorNome, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
