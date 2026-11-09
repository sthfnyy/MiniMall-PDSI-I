import React from "react";
import { Store, Package, Star } from "lucide-react";

export default function MerchantNav({ current = "configuracao", go }) {
  const tabs = [
    { id: "configuracao", label: "Configuração da Loja", path: "lojista", icon: Store },
    { id: "produtos", label: "Catálogo de Produtos", path: "lojista/produtos", icon: Package },
    { id: "avaliacoes", label: "Avaliações", path: "lojista/avaliacoes", icon: Star },
  ];

  return (
    <nav className="admin-navigation merchant-navigation" aria-label="Painel do lojista">
      {tabs.map(({ id, label, path, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={current === id ? "page" : undefined}
          className={current === id ? "active" : ""}
          onClick={() => go(path)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </nav>
  );
}

