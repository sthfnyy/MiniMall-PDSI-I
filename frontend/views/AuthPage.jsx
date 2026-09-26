import React, { useState } from "react";
import { Field } from "../components/ui";
import { signIn, signUp } from "../services/auth";
export default function AuthPage({ mode, users, onSuccess, onRegister, go }) {
  const signup = mode === "cadastro";
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (signup && values.password !== values.confirm)
      return setError("As senhas não coincidem.");
    setBusy(true);
    try {
      const user = signup
        ? await signUp(users, values)
        : await signIn(users, values.email, values.password);
      if (signup) onRegister(user);
      onSuccess(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-page">
      <div className="auth-intro">
        <h1>{signup ? "Criar conta" : "Entrar"}</h1>
        <p>
          {signup
            ? "Cadastre-se como consumidor ou lojista."
            : "Acesse sua conta MiniMall."}
        </p>
        <div className="auth-visual" aria-hidden="true">
          <span>m.</span>
        </div>
      </div>
      <div className="panel auth-form">
        <form onSubmit={submit}>
          {signup && (
            <Field
              label="Nome"
              name="name"
              required
              minLength={2}
              autoComplete="name"
            />
          )}
          <Field
            label="E-mail"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
          <Field
            label="Senha"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={signup ? "new-password" : "current-password"}
          />
          {signup && (
            <>
              <Field
                label="Confirmar senha"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <Field label="Perfil">
                <select name="role">
                  <option value="consumidor">Consumidor</option>
                  <option value="lojista">Lojista</option>
                </select>
              </Field>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}
          </button>
        </form>
        <button
          className="text-button section-space"
          onClick={() => go(signup ? "login" : "cadastro")}
        >
          {signup ? "Já tenho uma conta" : "Criar uma conta"}
        </button>
        <p className="demo-notice">
          Demonstração local, sem conexão com o servidor.
        </p>
      </div>
    </section>
  );
}
