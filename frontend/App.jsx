import { whatsappLink } from "./services/contact";
import React, { useState, useEffect } from "react";
import {
  House,
  Search,
  ArrowRight,
  Store,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  User,
  X,
  MessageCircle,
  Package,
} from "lucide-react";

import Home from "./views/Home";
import Catalog from "./views/Catalog";
import StorePage from "./views/StorePage";
import ProductDetail from "./views/ProductDetail";
import AuthPage from "./views/AuthPage";
import Admin from "./views/admin/Admin";
import ConsumerProfile from "./views/consumer/ConsumerProfile";
import ConsumerFavorites from "./views/consumer/ConsumerFavorites";
import ConsumerPoints from "./views/consumer/ConsumerPoints";
import ConsumerReviews from "./views/consumer/ConsumerReviews";
import ReviewForm from "./views/consumer/ReviewForm";
import StoreSettings from "./views/merchant/StoreSettings";
import ProductList from "./views/merchant/ProductList";
import ProductForm from "./views/merchant/ProductForm";

import StoreCard from "./components/StoreCard";
import { Modal, Empty } from "./components/ui";

import { money, price } from "./services/catalog";
import { loadData, saveData } from "./services/storage";
import { publishReview } from "./services/reviews";
import {
  getCurrentSession,
  observeAuthChanges,
  signOut,
} from "./services/auth";

const emptyFilters = {
  query: "",
  category: "",
  store: "",
  min: "",
  max: "",
  sort: "relevancia",
};

export default function App() {
  const [data, setData] = useState(loadData);
  const [route, setRoute] = useState(
    location.hash.slice(1) || "inicio",
  );
  const [user, setUser] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [authSession, setAuthSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);
  const [toast, setToast] = useState("");
  const [contact, setContact] = useState(null);

  const go = (path) => {
    location.hash = path;
  };

  const applyAuthSession = (session) => {
    setAuthSession(session);
    setAuthUser(session?.user ?? null);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    try {
      if (authSession) await signOut();
      setUser(null);
      applyAuthSession(null);
      go("inicio");
      setToast("Você saiu da conta.");
    } catch (error) {
      setToast(error.message);
    }
  };

  useEffect(() => {
    let active = true;
    let stopObserving = () => {};

    const updateSession = (session) => {
      if (active) applyAuthSession(session);
    };

    async function initializeAuth() {
      try {
        updateSession(await getCurrentSession());
        stopObserving = observeAuthChanges(updateSession);
      } catch (error) {
        updateSession(null);
        setToast(error.message);
      }
    }

    initializeAuth();

    return () => {
      active = false;
      stopObserving();
    };
  }, []);

  useEffect(() => {
    const protectedRoute =
      route === "admin" ||
      route.startsWith("consumidor") ||
      route.startsWith("lojista");
    if (!authLoading && authUser && (route === "login" || protectedRoute)) {
      go("inicio");
    }
  }, [authLoading, authUser, route]);

  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || "inicio");
      window.scrollTo(0, 0);
    };

    window.addEventListener("hashchange", change);

    return () =>
      window.removeEventListener("hashchange", change);
  }, []);

  useEffect(() => {
    try {
      saveData(data);
    } catch {
      setToast(
        "Não foi possível salvar as alterações neste navegador.",
      );
    }
  }, [data]);

  useEffect(() => {
    if (!toast) return;

    const t = setTimeout(() => setToast(""), 4500);

    return () => clearTimeout(t);
  }, [toast]);

  // Count product/store page visits, including direct hash navigation.
  useEffect(() => {
    const [, id] = route.split("/");

    const store = route.startsWith("loja/")
      ? data.stores.find(
          (s) =>
            s.id === Number(id) &&
            s.status === "aprovada",
        )
      : null;

    const product = route.startsWith("produto/")
      ? data.products.find(
          (p) =>
            p.id === Number(id) &&
            !p.deleted &&
            data.stores.some(
              (s) =>
                s.id === p.store &&
                s.status === "aprovada",
            ),
        )
      : null;

    if (store || product) {
      setData((d) => ({
        ...d,
        views: (d.views || 0) + 1,
      }));
    }
  }, [route]);

  const update = (fn) =>
    setData((prev) => fn(structuredClone(prev)));

  const approved = data.stores.filter(
    (s) => s.status === "aprovada",
  );

  const products = data.products.filter(
    (p) =>
      !p.deleted &&
      approved.some((s) => s.id === p.store),
  );

  const product = products.find(
    (p) => route === `produto/${p.id}`,
  );

  const store = approved.find(
    (s) => route === `loja/${s.id}`,
  );

  const reviewStore = approved.find(
    (s) => route === `consumidor/avaliar/${s.id}`,
  );

  const onProduct = (p) =>
    go(`produto/${p.id}`);

  const onStore = (id) =>
    go(`loja/${id}`);

  const isFavorite = (productId) => {
    if (!user || user.role !== "consumidor") {
      return false;
    }

    const currentUser = data.users.find(
      (u) => u.id === user.id,
    );

    return (
      currentUser?.favorites?.some(
        (id) => Number(id) === Number(productId),
      ) || false
    );
  };

  const toggleFavorite = (product) => {
    if (!user || user.role !== "consumidor") {
      setToast(
        "Entre como consumidor para adicionar favoritos.",
      );

      go("login");
      return;
    }

    update((draft) => {
      const currentUser = draft.users.find(
        (u) => u.id === user.id,
      );

      if (!currentUser) return draft;

      currentUser.favorites =
        currentUser.favorites || [];

      const index = currentUser.favorites.findIndex(
        (id) => Number(id) === Number(product.id),
      );

      if (index >= 0) {
        currentUser.favorites.splice(index, 1);

        setToast(
          `"${product.name}" removido dos favoritos.`,
        );
      } else {
        currentUser.favorites.push(product.id);

        setToast(
          `"${product.name}" adicionado aos favoritos.`,
        );
      }

      if (draft.favorites) {
        const favIndex = draft.favorites.findIndex(
          (f) =>
            f.user === user.id &&
            Number(f.product) === Number(product.id),
        );
        if (index >= 0 && favIndex >= 0) {
          draft.favorites.splice(favIndex, 1);
        } else if (index < 0 && favIndex < 0) {
          draft.favorites.push({
            user: user.id,
            product: product.id,
            date: new Date().toISOString().split("T")[0],
          });
        }
      }

      return draft;
    });
  };

  const storeCard = (s) => (
    <StoreCard
      key={s.id}
      store={s}
      data={data}
      onStore={onStore}
    />
  );

  const nav = [
    ["inicio", "Início", House],
    ["explorar", "Produtos", LayoutGrid],
    ["lojas", "Lojas", Store],

    ...(user?.role === "consumidor"
      ? [["consumidor", "Minha conta", User]]
      : []),

    ...(user?.role === "lojista"
      ? [
          ["lojista", "Minha loja", Store],
          ["lojista/produtos", "Meus produtos", Package],
        ]
      : []),

    ...(user?.role === "administrador"
      ? [["admin", "Administração", ShieldCheck]]
      : []),
  ];

  const currentStore =
    contact &&
    data.stores.find(
      (s) => s.id === contact.store,
    );

  const message = contact
    ? `Olá! Vi ${contact.name} por ${money(
        price(contact),
      )} no MiniMall e gostaria de saber mais. ${
        location.origin
      }/#produto/${contact.id}`
    : "";

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document
            .getElementById("main-content")
            .focus();
        }}
      >
        Pular para o conteúdo
      </a>

      <header>
        <div className="header-inner">
          <a className="brand" href="#inicio">
            <span className="brand-symbol">
              <svg
                viewBox="0 0 32 32"
                width="27"
                height="27"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 25V12a5.5 5.5 0 0 1 11 0v13-13a5.5 5.5 0 0 1 11 0v13"
                  stroke="currentColor"
                  strokeWidth="3.5"
                />
                <path
                  d="M3 26h26"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </span>

            mini<span>mall</span>
            <i />
          </a>

          <form
            className="searchbox"
            onSubmit={(e) => {
              e.preventDefault();
              go("explorar");
            }}
          >
            <Search size={19} />

            <input
              aria-label="Buscar produtos"
              placeholder="Buscar produtos"
              value={filters.query}
              onChange={(e) => {
                setFilters((f) => ({
                  ...f,
                  query: e.target.value,
                }));

                if (route !== "explorar") {
                  go("explorar");
                }
              }}
            />

            <button
              className="search-submit"
              aria-label="Pesquisar"
            >
              <ArrowRight size={18} />
            </button>
          </form>

          {authLoading ? (
            <span className="muted">Verificando sessão…</span>
          ) : user || authUser ? (
            <div className="row account-status">
              <span>{user?.name || authUser?.email}</span>

              <button
                className="icon-button"
                aria-label="Sair"
                onClick={handleLogout}
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button
              className="account-button"
              onClick={() => go("login")}
            >
              Entrar
            </button>
          )}
        </div>
      </header>

      <nav className="nav-bar">
        <div className="nav-inner">
          <div>
            {nav.map(([path, label, Icon]) => (
              <button
                key={path}
                aria-current={
                  route === path ? "page" : undefined
                }
                className={
                  route === path ? "active" : ""
                }
                onClick={() => go(path)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main
        id="main-content"
        tabIndex={-1}
        className={
          route === "inicio" ? "home-main" : ""
        }
      >
        {route === "inicio" && (
          <Home
            products={products}
            stores={approved}
            onProduct={onProduct}
            onExplore={(c) => {
              setFilters({
                ...emptyFilters,
                category: c || "",
              });

              go("explorar");
            }}
            onStores={() => go("lojas")}
            storeCard={storeCard}
          />
        )}

        {route === "explorar" && (
          <Catalog
            data={data}
            filters={filters}
            setFilters={setFilters}
            onProduct={onProduct}
            onStore={onStore}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {route === "lojas" && (
          <>
            <div className="page-title">
              <h1>Lojas</h1>
            </div>

            <div className="store-grid all-stores">
              {approved.map(storeCard)}
            </div>
          </>
        )}

        {store && (
          <StorePage
            store={store}
            data={data}
            onProduct={onProduct}
            onStore={onStore}
            go={go}
            user={user}
            onReview={(selectedStore) =>
              go(`consumidor/avaliar/${selectedStore.id}`)
            }
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {product && (
          <ProductDetail
            product={product}
            store={data.stores.find(
              (s) => s.id === product.store,
            )}
            data={data}
            go={go}
            contact={() => setContact(product)}
            isFavorite={isFavorite(product.id)}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {["login", "cadastro"].includes(route) &&
          !authLoading &&
          (route === "cadastro" || !authUser) && (
            <AuthPage
              key={route}
              mode={route}
              users={data.users}
              go={go}
              onRegister={(u) =>
                update((d) => {
                  d.users.push(u);
                  return d;
                })
              }
              onSuccess={(result) => {
                if (result.session) {
                  applyAuthSession(result.session);
                  setUser(null);
                  go("inicio");
                  setToast("Você entrou na conta.");
                  return;
                }

                setUser(result);

                if (result.role === "administrador") {
                  go("admin");
                } else if (result.role === "consumidor") {
                  go("consumidor");
                } else if (result.role === "lojista") {
                  go("lojista");
                } else {
                  go("explorar");
                }

                setToast("Cadastro concluído.");
              }}
            />
          )}

        {/* PERFIL DO CONSUMIDOR */}
        {route === "consumidor" &&
          (user?.role === "consumidor" ? (
            <ConsumerProfile
              user={user}
              onFavorites={() =>
                go("consumidor/favoritos")
              }
              onPoints={() =>
                go("consumidor/pontos")
              }
              onReviews={() =>
                go("consumidor/avaliacoes")
              }
              onUpdate={(updatedUser) => {
                setUser(updatedUser);

                update((d) => {
                  const index = d.users.findIndex(
                    (u) => u.id === updatedUser.id,
                  );

                  if (index !== -1) {
                    d.users[index] = updatedUser;
                  }

                  return d;
                });

                setToast("Perfil atualizado.");
              }}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de consumidor."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* FAVORITOS DO CONSUMIDOR */}
        {route === "consumidor/favoritos" &&
          (user?.role === "consumidor" ? (
            <ConsumerFavorites
              user={user}
              data={data}
              products={products.filter((p) => isFavorite(p.id))}
              onProduct={onProduct}
              onStore={onStore}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
              go={go}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de consumidor."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* PONTOS DO CONSUMIDOR */}
        {route === "consumidor/pontos" &&
          (user?.role === "consumidor" ? (
            <ConsumerPoints
              user={user}
              data={data}
              go={go}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de consumidor."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* AVALIAÇÕES DO CONSUMIDOR */}
        {route === "consumidor/avaliacoes" &&
          (user?.role === "consumidor" ? (
            <ConsumerReviews
              user={user}
              data={data}
              go={go}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de consumidor."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* CRIAÇÃO DE AVALIAÇÃO */}
        {reviewStore &&
          (user?.role === "consumidor" ? (
            <ReviewForm
              store={reviewStore}
              onCancel={() => go(`loja/${reviewStore.id}`)}
              onPublish={(values) => {
                const nextData = structuredClone(data);
                publishReview(nextData, {
                  ...values,
                  user,
                  store: reviewStore,
                });
                setData(nextData);
                setToast("Avaliação publicada com sucesso.");
                go(`loja/${reviewStore.id}`);
              }}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de consumidor."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* ADMINISTRAÇÃO */}
        {route === "admin" &&
          (user?.role === "administrador" ? (
            <Admin
              data={data}
              update={update}
              notify={setToast}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de administrador."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* PAINEL DO LOJISTA / CONFIGURAÇÃO DA LOJA */}
        {route === "lojista" &&
          (user?.role === "lojista" ? (
            <StoreSettings
              user={user}
              data={data}
              go={go}
              notify={setToast}
              onSaveStore={(savedStore) => {
                update((draft) => {
                  const index = draft.stores.findIndex(
                    (s) => s.id === savedStore.id,
                  );

                  if (index !== -1) {
                    draft.stores[index] = savedStore;
                  } else {
                    draft.stores.push(savedStore);
                  }

                  return draft;
                });
              }}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de lojista para gerenciar sua loja."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* CATÁLOGO DE PRODUTOS DO LOJISTA */}
        {route === "lojista/produtos" &&
          (user?.role === "lojista" ? (
            <ProductList
              user={user}
              data={data}
              update={update}
              go={go}
              notify={setToast}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de lojista para gerenciar o catálogo de produtos."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* CADASTRO OU EDIÇÃO DE PRODUTO DO LOJISTA */}
        {(route === "lojista/produtos/novo" ||
          route.startsWith("lojista/produtos/editar/")) &&
          (user?.role === "lojista" ? (
            <ProductForm
              user={user}
              data={data}
              productId={
                route.startsWith("lojista/produtos/editar/")
                  ? route.split("/")[3]
                  : null
              }
              go={go}
              update={update}
              notify={setToast}
            />
          ) : (
            <Empty
              title="Acesso restrito"
              text="Entre com uma conta de lojista para cadastrar ou editar produtos."
              action={
                <button
                  className="primary"
                  onClick={() => go("login")}
                >
                  Entrar
                </button>
              }
            />
          ))}

        {/* ROTA NÃO ENCONTRADA */}
        {![
          "inicio",
          "explorar",
          "lojas",
          "login",
          "cadastro",
          "admin",
          "consumidor",
          "consumidor/favoritos",
          "consumidor/pontos",
          "consumidor/avaliacoes",
          "lojista",
          "lojista/produtos",
          "lojista/produtos/novo",
        ].includes(route) &&
          !route.startsWith("lojista/produtos/editar/") &&
          !product &&
          !store &&
          !reviewStore && (
            <Empty
              title="Página não encontrada"
              text="O produto ou a loja não está disponível."
              action={
                <button
                  className="primary"
                  onClick={() => go("explorar")}
                >
                  Ver produtos
                </button>
              }
            />
          )}
      </main>

      <footer>
        <a className="brand" href="#inicio">
          mini<span>mall</span>
          <i />
        </a>
      </footer>

      {toast && (
        <div role="status" className="toast">
          {toast}

          <button
            aria-label="Fechar mensagem"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {contact && (
        <Modal
          title="Contato com a loja"
          onClose={() => setContact(null)}
        >
          <div className="message-preview">
            {message}
          </div>

          {whatsappLink(
            currentStore?.whatsapp,
            message,
          ) ? (
            <a
              className="primary full whatsapp"
              href={whatsappLink(
                currentStore.whatsapp,
                message,
              )}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={18} />
              Abrir WhatsApp
            </a>
          ) : (
            <p className="demo-notice">
              Esta loja ainda não informou o WhatsApp.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
