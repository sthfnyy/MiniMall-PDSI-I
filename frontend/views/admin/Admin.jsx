import React, { useState } from "react";
import { PageTitle } from "../../components/ui";
import Dashboard from "./Dashboard";
import Moderation from "./Moderation";
import Registrations from "./Registrations";
export default function Admin(props) {
  const [page, setPage] = useState("dashboard");
  const pages = [
    ["dashboard", "Dados da Plataforma"],
    ["moderation", "Moderação"],
    ["registrations", "Gestão de Cadastros"],
  ];
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRAÇÃO"
        title={pages.find(([id]) => id === page)[1]}
      />
      <nav className="admin-navigation" aria-label="Painel do administrador">
        {pages.map(([id, label]) => (
          <button
            key={id}
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {page === "dashboard" ? (
        <Dashboard {...props} />
      ) : page === "moderation" ? (
        <Moderation {...props} />
      ) : (
        <Registrations {...props} />
      )}
    </>
  );
}
