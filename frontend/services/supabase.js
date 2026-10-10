import { createClient } from "@supabase/supabase-js";

let supabaseClient;

export function isSupabaseConfigured() {
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && anonKey);
}

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = import.meta.env?.VITE_SUPABASE_URL;
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar a autenticação.",
    );
  }

  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}
