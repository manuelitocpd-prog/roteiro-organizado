import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createProfSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
});

function randomPassword() {
  return Math.random().toString(36).slice(2, 10) + "A1!";
}

export const createProfessorWithAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createProfSchema.parse(input))
  .handler(async ({ data, context }) => {
    // authorize: caller must be admin
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = randomPassword();

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (authErr || !created?.user) throw new Error(authErr?.message ?? "Falha ao criar usuário");

    const userId = created.user.id;

    const { data: prof, error: pErr } = await supabaseAdmin
      .from("professores")
      .insert({ nome: data.nome, email: data.email, user_id: userId })
      .select()
      .single();
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(pErr.message);
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "professor" });
    return { professor: prof, senhaInicial: password };
  });

export const resetProfessorSenha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ professor_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("professores")
      .select("user_id")
      .eq("id", data.professor_id)
      .single();
    if (!prof?.user_id) throw new Error("Professor sem usuário vinculado.");
    const password = randomPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(prof.user_id, { password });
    if (error) throw new Error(error.message);
    return { senhaInicial: password };
  });

export const promoteToAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.listUsers();
    const target = u?.users?.find((usr) => usr.email === data.email);
    if (!target) throw new Error("Usuário não encontrado.");
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: target.id, role: "admin" })
      .select();
    return { ok: true };
  });
