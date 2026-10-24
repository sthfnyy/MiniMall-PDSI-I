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
import { saveConsumerProfile } from "./services/profile.js";
import {
  createConsumerReview,
  isBackendStoreId,
  publishReview,
} from "./services/reviews.js";
import {
  getCurrentSession,
  getAuthenticatedProfile,
  observeAuthChanges,
  signOut,
  isConsumerRoute,
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
  const [backendProfile, setBackendProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);
  const [toast, setToast] = useState("");
  const [contact, setContact] = useState(null);

  
  const currentUser = authUser
    ? backendProfile?.id === authUser.id
      ? {
          id: backendProfile.id,
          name: backendProfile.nome_completo || authUser.email,
          email: authUser.email || "",
          role: backendProfile.role,
          status: "Ativo",
          favorites: [],
        }
      : null
    : user;


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
      await signOut();
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
    let active = true;

    async function loadProfile() {
      setBackendProfile(null);

      if (!authSession?.access_token) return;

      try {
        const profile = await getAuthenticatedProfile();

        if (active) {
          setBackendProfile(profile);
        }
      } catch (error) {
        if (active) {
          console.error("Erro ao consultar perfil:", error.message);
        }
      }
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [authSession?.access_token]);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser && isConsumerRoute(route)) {
      go("login");
      return;
    }

    if (currentUser && route === "login") {
      go("inicio");
    }
  }, [authLoading, currentUser, route]);

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
    if (authSession?.access_token) {
      return false;
    }

    if (!currentUser || currentUser.role !== "consumidor") {
      return false;
    }

    const currentConsumerData = data.users.find(
      (u) => u.id === currentUser.id,
    );

    return (
      currentConsumerData?.favorites?.some(
        (id) => Number(id) === Number(productId),
      ) ||
      currentUser?.favorites?.some(
        (id) => Number(id) === Number(productId),
      ) ||
      false
    );
  };

  const toggleFavorite = (product) => {
    if (!currentUser || currentUser.role !== "consumidor") {
      setToast(
        "Entre como consumidor para adicionar favoritos.",
      );

      go("login");
      return;
    }

    if (authSession?.access_token) {
      setToast(
        "Favoritos reais estarão disponíveis quando o catálogo usar produtos da API.",
      );
      return;
    }

    update((draft) => {
      let currentConsumerData = draft.users.find(
        (u) => u.id === currentUser.id,
      );

      if (!currentConsumerData) {
        currentConsumerData = { ...currentUser, favorites: [] };
        draft.users.push(currentConsumerData);
      }

      currentConsumerData.favorites =
        currentConsumerData.favorites || [];

      const index = currentConsumerData.favorites.findIndex(
        (id) => Number(id) === Number(product.id),
      );

      if (index >= 0) {
        currentConsumerData.favorites.splice(index, 1);

        setToast(
          `"${product.name}" removido dos favoritos.`,
        );
      } else {
        currentConsumerData.favorites.push(product.id);

        setToast(
          `"${product.name}" adicionado aos favoritos.`,
        );
      }

      if (draft.favorites) {
        const favIndex = draft.favorites.findIndex(
          (f) =>
            f.user === currentUser.id &&
            Number(f.product) === Number(product.id),
        );
        if (index >= 0 && favIndex >= 0) {
          draft.favorites.splice(favIndex, 1);
        } else if (index < 0 && favIndex < 0) {
          draft.favorites.push({
            user: currentUser.id,
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

    ...(currentUser?.role === "consumidor"
      ? [["consumidor", "Minha conta", User]]
      : []),

    ...(currentUser?.role === "lojista"
      ? [
          ["lojista", "Minha loja", Store],
          ["lojista/produtos", "Meus produtos", Package],
        ]
      : []),

    ...(currentUser?.role === "admin" && !!authSession && !!backendProfile
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
          ) : currentUser ? (
            <div className="row account-status">
              <span>{currentUser.name || currentUser.email}</span>

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
            user={currentUser}
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
          (route === "cadastro" || !currentUser) && (
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
          (currentUser?.role === "consumidor" ? (
            <ConsumerProfile
              user={currentUser}
              onFavorites={() =>
                go("consumidor/favoritos")
              }
              onPoints={() =>
                go("consumidor/pontos")
              }
              onReviews={() =>
                go("consumidor/avaliacoes")
              }
              onLogout={handleLogout}
              useRealApi={Boolean(authSession?.access_token)}
              onUpdate={async (updatedUser) => {
                const result = await saveConsumerProfile({
                  useRealApi: Boolean(authSession?.access_token),
                  user: updatedUser,
                });

                if (result.backendProfile) {
                  setBackendProfile(result.backendProfile);
                  setToast("Perfil atualizado.");
                  return result.user;
                }

                setUser(result.user);

                update((d) => {
                  const index = d.users.findIndex(
                    (u) => u.id === result.user.id,
                  );

                  if (index !== -1) {
                    d.users[index] = result.user;
                  } else {
                    d.users.push(result.user);
                  }

                  return d;
                });

                setToast("Perfil atualizado.");
                return result.user;
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
          (currentUser?.role === "consumidor" ? (
            <ConsumerFavorites
              user={currentUser}
              data={data}
              products={products.filter((p) => isFavorite(p.id))}
              onProduct={onProduct}
              onStore={onStore}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
              go={go}
              useRealApi={Boolean(authSession?.access_token)}
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
          (currentUser?.role === "consumidor" ? (
            <ConsumerPoints
              user={currentUser}
              data={data}
              go={go}
              useRealApi={Boolean(authSession?.access_token)}
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
          (currentUser?.role === "consumidor" ? (
            <ConsumerReviews
              user={currentUser}
              data={data}
              go={go}
              useRealApi={Boolean(authSession?.access_token)}
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
          (currentUser?.role === "consumidor" ? (
            <ReviewForm
              store={reviewStore}
              onCancel={() => go(`loja/${reviewStore.id}`)}
              onPublish={async (values) => {
                if (authSession?.access_token) {
                  if (!isBackendStoreId(reviewStore.id)) {
                    throw new Error(
                      "Esta loja ainda não está disponível para avaliações na API.",
                    );
                  }

                  await createConsumerReview({
                    loja_id: reviewStore.id,
                    nota: Number(values.rating),
                    comentario: values.comment.trim(),
                  });
                  setToast("Avaliação publicada com sucesso.");
                  go("consumidor/avaliacoes");
                  return;
                }

                const nextData = structuredClone(data);
                publishReview(nextData, {
                  ...values,
                  user: currentUser,
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
          (currentUser?.role === "admin" && !!authSession && !!backendProfile ? (
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
          (currentUser?.role === "lojista" ? (
            <StoreSettings
              user={currentUser}
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
          (currentUser?.role === "lojista" ? (
            <ProductList
              user={currentUser}
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
          (currentUser?.role === "lojista" ? (
            <ProductForm
              user={currentUser}
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
