import React, { useState } from "react";
import { Modal, Field } from "../../components/ui";
import { normalize } from "../../services/catalog";
import { saveCategory, deleteCategory } from "../../services/admin";
export default function Registrations({ data, update, notify }) {
  const [query, setQuery] = useState(""),
    [user, setUser] = useState(null),
    [name, setName] = useState(""),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(null);
  const users = (data.users || []).filter((u) =>
    normalize(u.name + " " + u.email).includes(normalize(query)),
  );
  return (
    <>
      <section className="panel">
        <h2>Usuários cadastrados</h2>
        <Field
          label="Pesquisar usuário"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome ou e-mail"
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.status}</td>
                  <td>
                    <button className="text-button" onClick={() => setUser(u)}>
                      Consultar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!users.length && <p>Nenhum usuário encontrado.</p>}
      </section>
      <section className="panel section-space">
        <h2>Categorias globais</h2>
        <form
          className="category-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const next = saveCategory(structuredClone(data), name, editing);
              update(() => next);
              setName("");
              setEditing(null);
              setError("");
              notify("Categoria salva.");
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <input
            aria-label="Nome da categoria"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da categoria"
          />
          <button className="primary">
            {editing ? "Salvar alteração" : "Cadastrar categoria"}
          </button>
          {editing && (
            <button
              className="outline"
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setError("");
              }}
            >
              Cancelar
            </button>
          )}
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {data.categories.map((c) => (
          <div className="admin-row" key={c}>
            <strong>{c}</strong>
            <div className="row">
              <button
                className="text-button"
                onClick={() => {
                  setEditing(c);
                  setName(c);
                  setError("");
                }}
                aria-label={`Alterar ${c}`}
              >
                Alterar
              </button>
              <button
                className="text-button danger"
                aria-label={`Excluir ${c}`}
                onClick={() => {
                  try {
                    deleteCategory(structuredClone(data), c);
                    setDeleting(c);
                    setError("");
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </section>
      {user && (
        <Modal title="Dados do usuário" onClose={() => setUser(null)}>
          <dl className="metric-list">
            {[
              ["Nome", user.name],
              ["E-mail", user.email],
              ["Perfil", user.role],
              ["Situação", user.status],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
      {deleting && (
        <Modal title="Excluir categoria?" onClose={() => setDeleting(null)}>
          <p>{deleting}</p>
          <div className="modal-actions">
            <button className="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button
              className="primary red"
              onClick={() => {
                try {
                  const next = deleteCategory(structuredClone(data), deleting);
                  update(() => next);
                  setDeleting(null);
                  notify("Categoria excluída.");
                } catch (err) {
                  setDeleting(null);
                  setError(err.message);
                }
              }}
            >
              Excluir categoria
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
