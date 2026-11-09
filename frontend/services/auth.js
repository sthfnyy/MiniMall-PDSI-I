import { getSupabaseClient, isSupabaseConfigured } from "./supabase.js";

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

export async function signIn(users, email, password, client) {
  const normalizedEmail = email.trim().toLowerCase();

  // Se um client foi passado explicitamente (ex: em testes unitários)
  if (client !== undefined) {
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

  // Se o Supabase estiver configurado com variáveis de ambiente
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!error && data.session && data.user) {
        return {
          user: data.user,
          session: data.session,
          accessToken: data.session.access_token,
        };
      }
    } catch {
      // Falha de conexão Supabase, tenta autenticação local abaixo se for conta demo/local
    }
  }

  // Autenticação local / demonstração (ex: lojista@exemplo.com)
  const user = users?.find(
    (u) => u.email.toLowerCase() === normalizedEmail,
  );
  if (!user) throw new Error("E-mail ou senha inválidos.");

  const credentials = JSON.parse(localStorage.getItem(KEY) || "{}");
  const saved = credentials[user.id];
  const valid = saved
    ? (await digest(password, saved.salt)) === saved.hash
    : !user.id.startsWith("user-") && password === DEMO_PASSWORD;

  if (!valid) throw new Error("E-mail ou senha inválidos.");
  return user;
}

export async function signUp(users, values, client) {
  const email = values.email.trim().toLowerCase();
  const role = values.role;
  const name = values.name.trim();

  if (users?.some((u) => u.email.toLowerCase() === email))
    throw new Error("Este e-mail já está cadastrado.");
  if (!["consumidor", "lojista"].includes(role))
    throw new Error("Selecione um perfil válido.");
  if (values.password.length < 8)
    throw new Error("A senha deve ter pelo menos 8 caracteres.");

  // Se um client foi passado explicitamente (ex: em testes unitários)
  if (client !== undefined) {
    const { data, error } = await client.auth.signUp({
      email,
      password: values.password,
      options: {
        data: { nome_completo: name, role },
      },
    });
    if (error) throw new Error(error.message || "Não foi possível cadastrar.");
    return {
      user: data.user,
      session: data.session,
      accessToken: data.session?.access_token,
    };
  }

  // Se o Supabase estiver configurado com variáveis de ambiente
  if (isSupabaseConfigured()) {
    const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    try {
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password: values.password,
          role,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Não foi possível criar a conta.");
      }

      const result = await response.json();

      // Sincroniza sessão no cliente Supabase se disponível
      if (result.session && result.accessToken) {
        try {
          const supabase = getSupabaseClient();
          await supabase.auth.setSession({
            access_token: result.accessToken,
            refresh_token: result.session.refresh_token,
          });
        } catch {}
      }

      return result;
    } catch (err) {
      if (err.message && !err.message.includes("Failed to fetch")) {
        throw err;
      }
    }
  }

  // Autenticação local / fallback de demonstração (testes unitários e sem backend)
  const user = {
    id: "user-" + crypto.randomUUID(),
    name,
    email,
    role,
    status: "Ativo",
  };
  const salt = crypto.randomUUID();
  const credentials = JSON.parse(localStorage.getItem(KEY) || "{}");
  credentials[user.id] = { salt, hash: await digest(values.password, salt) };
  localStorage.setItem(KEY, JSON.stringify(credentials));
  return user;
}

export async function getCurrentSession(client) {
  if (client !== undefined) {
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw new Error(error.message || "Não foi possível recuperar a sessão.");
    }
    return data.session;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) {
    throw new Error(error.message || "Não foi possível recuperar a sessão.");
  }
  return data.session;
}

export function observeAuthChanges(callback, client) {
  if (client !== undefined) {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });

    return () => data.subscription.unsubscribe();
  }

  if (!isSupabaseConfigured()) {
    return () => {};
  }

  const { data } = getSupabaseClient().auth.onAuthStateChange(
    (_event, session) => {
      callback(session);
    },
  );

  return () => data.subscription.unsubscribe();
}

export async function signOut(client) {
  if (client !== undefined) {
    const { error } = await client.auth.signOut();
    if (error) throw new Error(error.message || "Não foi possível sair.");
    return;
  }

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) throw new Error(error.message || "Não foi possível sair.");
  }
}

export async function getAccessToken(client) {
  const session = await getCurrentSession(client);
  return session?.access_token ?? null;
}

export function isConsumerRoute(route) {
  return (
    route === "consumidor" ||
    (typeof route === "string" && route.startsWith("consumidor/"))
  );
}

export function canAccessConsumerRoute(route, user) {
  if (!isConsumerRoute(route)) return true;
  return Boolean(user && user.role === "consumidor");
}

export function getAuthenticatedRoute(role) {
  if (role === "admin") return "admin";
  if (role === "consumidor") return "consumidor";
  if (role === "lojista") return "lojista";
  return "inicio";
}

export function getPendingAuthenticatedRoute(pending, user) {
  if (!pending || !user?.role) return null;
  return getAuthenticatedRoute(user.role);
}

export async function getAuthenticatedProfile() {
  const token = await getAccessToken();

  if (!token) {
    return null;
  }

  const apiUrl = import.meta.env.VITE_API_URL;

  const response = await fetch(`${apiUrl}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Não foi possível carregar o perfil: HTTP ${response.status}`,
    );
  }

  return response.json();
}
