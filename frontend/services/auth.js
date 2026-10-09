import { getSupabaseClient } from "./supabase.js";

export const DEMO_PASSWORD = "Demo1234!";
const KEY = "minimall-delivery-credentials-v1";
async function digest(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function signIn(
  _users,
  email,
  password,
  client = getSupabaseClient(),
) {
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw new Error(error.message || "Não foi possível entrar.");
  if (!data.session || !data.user) {
    throw new Error("O Supabase não retornou uma sessão válida.");
  }

  return {
    user: data.user,
    session: data.session,
    accessToken: data.session.access_token,
  };
}
export async function signUp(users, values) {
  const email = values.email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === email))
    throw new Error("Este e-mail já está cadastrado.");
  if (!["consumidor", "lojista"].includes(values.role))
    throw new Error("Selecione um perfil válido.");
  if (values.password.length < 8)
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const user = {
    id: "user-" + crypto.randomUUID(),
    name: values.name.trim(),
    email,
    role: values.role,
    status: "Ativo",
  };
  const salt = crypto.randomUUID();
  const credentials = JSON.parse(localStorage.getItem(KEY) || "{}");
  credentials[user.id] = { salt, hash: await digest(values.password, salt) };
  localStorage.setItem(KEY, JSON.stringify(credentials));
  return user;
}

export async function getCurrentSession(client = getSupabaseClient()) {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || "Não foi possível recuperar a sessão.");
  }
  return data.session;
}

export function observeAuthChanges(callback, client = getSupabaseClient()) {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => data.subscription.unsubscribe();
}

export async function signOut(client = getSupabaseClient()) {
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message || "Não foi possível sair.");
}

export async function getAccessToken(client = getSupabaseClient()) {
  const session = await getCurrentSession(client);
  return session?.access_token ?? null;
}
