
import React, { useEffect, useState } from "react";
import { Modal, Field } from "../../components/ui";
import { normalize } from "../../services/catalog";
import {
  getAdminUsers,
  getAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
} from "../../services/admin";

export default function Registrations({ notify }) {
  // Usuários
  const [adminUsers, setAdminUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  // Categorias
  const [adminCategories, setAdminCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [categoryError, setCategoryError] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeleting, setCategoryDeleting] = useState(false);

  // Pesquisa de usuários
  const users = adminUsers.filter((u) =>
    normalize(
      `${u.nome_completo || ""} ${u.telefone || ""}`
    ).includes(normalize(query))
  );

  // Carregamento inicial dos usuários
  useEffect(() => {
    let active = true;

    async function loadUsers() {
      try {
        const result = await getAdminUsers();

        if (active) {
          setAdminUsers(result);
          setUsersError("");
        }
      } catch (err) {
        if (active) {
          setUsersError(err.message);
        }
      } finally {
        if (active) {
          setUsersLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      active = false;
    };
  }, []);

  // Carregamento inicial das categorias
  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const result = await getAdminCategories();

        if (active) {
          setAdminCategories(result);
          setCategoriesError("");
        }
      } catch (err) {
        if (active) {
          setCategoriesError(err.message);
        }
      } finally {
        if (active) {
          setCategoriesLoading(false);
        }
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  // Criar ou editar categoria
  async function handleSaveCategory(e) {
    e.preventDefault();

    const nome = name.trim();

    if (!nome) {
      setCategoryError("Informe o nome da categoria.");
      return;
    }

    setCategorySaving(true);
    setCategoryError("");

    try {
      if (editing) {
        const updated = await updateAdminCategory(editing.id, nome);

        setAdminCategories((prev) =>
          prev
            .map((c) => (c.id === editing.id ? updated : c))
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        );

        notify("Categoria atualizada com sucesso.");
      } else {
        const created = await createAdminCategory(nome);

        setAdminCategories((prev) =>
          [...prev, created].sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR")
          )
        );

        notify("Categoria cadastrada com sucesso.");
      }

      setName("");
      setEditing(null);
    } catch (err) {
      setCategoryError(err.message);
    } finally {
      setCategorySaving(false);
    }
  }

  // Excluir categoria
  async function handleDeleteCategory() {
    if (!deleting || categoryDeleting) return;

    setCategoryDeleting(true);
    setCategoryError("");

    try {
      await deleteAdminCategory(deleting.id);

      setAdminCategories((prev) =>
        prev.filter((c) => c.id !== deleting.id)
      );

      if (editing?.id === deleting.id) {
        setEditing(null);
        setName("");
      }

      setDeleting(null);
      notify("Categoria excluída com sucesso.");
    } catch (err) {
      setCategoryError(err.message);
      setDeleting(null);
    } finally {
      setCategoryDeleting(false);
    }
  }

  // Cancelar edição
  function cancelEditing() {
    setEditing(null);
    setName("");
    setCategoryError("");
  }

  return (
    <>
      {/* USUÁRIOS CADASTRADOS */}
      <section className="panel">
        <h2>Usuários cadastrados</h2>

        <Field
          label="Pesquisar usuário"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome ou telefone"
        />

        {!usersLoading && !usersError && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Perfil</th>
                  <th>Data de cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.nome_completo}</td>
                    <td>{u.telefone || "Não informado"}</td>
                    <td>{u.role}</td>
                    <td>
                      {new Date(u.criado_em).toLocaleDateString("pt-BR")}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelectedUser(u)}
                      >
                        Consultar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {usersLoading && <p>Carregando usuários...</p>}

        {usersError && (
          <p className="error" role="alert">
            Erro ao carregar usuários: {usersError}
          </p>
        )}

        {!usersLoading && !usersError && users.length === 0 && (
          <p>Nenhum usuário encontrado.</p>
        )}
      </section>

      {/* CATEGORIAS GLOBAIS */}
      <section className="panel section-space">
        <h2>Categorias globais</h2>

        <form
          className="category-form"
          onSubmit={handleSaveCategory}
        >
          <input
            aria-label="Nome da categoria"
            required
            value={name}
            disabled={categorySaving || categoriesLoading}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da categoria"
          />

          <button
            className="primary"
            type="submit"
            disabled={categorySaving || categoriesLoading}
          >
            {categorySaving
              ? "Salvando..."
              : editing
                ? "Salvar alteração"
                : "Cadastrar categoria"}
          </button>

          {editing && (
            <button
              className="outline"
              type="button"
              disabled={categorySaving}
              onClick={cancelEditing}
            >
              Cancelar
            </button>
          )}
        </form>

        {categoryError && (
          <p className="error" role="alert">
            {categoryError}
          </p>
        )}

        {categoriesLoading && <p>Carregando categorias...</p>}

        {categoriesError && (
          <p className="error" role="alert">
            Erro ao carregar categorias: {categoriesError}
          </p>
        )}

        {!categoriesLoading &&
          !categoriesError &&
          adminCategories.length === 0 && (
            <p>Nenhuma categoria cadastrada.</p>
          )}

        {!categoriesLoading &&
          !categoriesError &&
          adminCategories.map((c) => (
            <div className="admin-row" key={c.id}>
              <strong>{c.nome}</strong>

              <div className="row">
                <button
                  className="text-button"
                  disabled={categorySaving || categoryDeleting}
                  onClick={() => {
                    setEditing(c);
                    setName(c.nome);
                    setCategoryError("");
                  }}
                  aria-label={`Alterar ${c.nome}`}
                >
                  Alterar
                </button>

                <button
                  className="text-button danger"
                  disabled={categorySaving || categoryDeleting}
                  onClick={() => {
                    setDeleting(c);
                    setCategoryError("");
                  }}
                  aria-label={`Excluir ${c.nome}`}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
      </section>

      {/* MODAL DE USUÁRIO */}
      {selectedUser && (
        <Modal
          title="Dados do usuário"
          onClose={() => setSelectedUser(null)}
        >
          <dl className="metric-list">
            {[
              ["Nome", selectedUser.nome_completo],
              ["Telefone", selectedUser.telefone || "Não informado"],
              ["Perfil", selectedUser.role],
              [
                "Data de cadastro",
                new Date(selectedUser.criado_em).toLocaleDateString("pt-BR"),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {/* MODAL DE EXCLUSÃO DE CATEGORIA */}
      {deleting && (
        <Modal
          title="Excluir categoria?"
          onClose={() => {
            if (!categoryDeleting) setDeleting(null);
          }}
        >
          <p>{deleting.nome}</p>

          <div className="modal-actions">
            <button
              className="outline"
              disabled={categoryDeleting}
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </button>

            <button
              className="primary red"
              disabled={categoryDeleting}
              onClick={handleDeleteCategory}
            >
              {categoryDeleting
                ? "Excluindo..."
                : "Excluir categoria"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
