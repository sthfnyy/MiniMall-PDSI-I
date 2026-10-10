import test from "node:test";
import assert from "node:assert/strict";
import { seed, rating } from "../services/catalog.js";
import { searchProducts } from "../services/search.js";
import {
  metrics,
  saveCategory,
  deleteCategory,
  moderateReview,
} from "../services/admin.js";
import { whatsappLink } from "../services/contact.js";
import {
  getStoreReviews,
  getUserReviews,
  publishReview,
} from "../services/reviews.js";
import {
  getMerchantStore,
  saveMerchantStore,
  validateStoreData,
  getStoreProducts,
  deleteStoreProduct,
  updateStoreProduct,
  createStoreProduct,
} from "../services/merchant.js";
const fresh = () => structuredClone(seed);
test("vitrine combina busca sem acentos, loja, categoria e preço", () => {
  assert.deepEqual(
    searchProducts(fresh(), {
      query: "tenis",
      category: "Calçados",
      store: "2",
      min: "100",
      max: "200",
    }).map((p) => p.id),
    [2],
  );
  assert.equal(
    searchProducts(fresh(), { query: "tenis", store: "1" }).length,
    0,
  );
  assert.throws(
    () => searchProducts(fresh(), { min: "200", max: "100" }),
    /mínimo/,
  );
});
test("lojas pendentes e produtos excluídos ficam fora da vitrine", () => {
  const data = fresh();
  data.products.push({ ...data.products[0], id: 10, store: 5 });
  data.products[0].deleted = true;
  assert.ok(!searchProducts(data, {}).some((p) => [1, 10].includes(p.id)));
});
test("categorias são únicas e alterações preservam o vínculo com produtos", () => {
  const d = fresh();
  assert.throws(() => saveCategory(d, "vestuario"), /existe/);
  saveCategory(d, "Roupas", "Vestuário");
  assert.equal(d.products[0].category, "Roupas");
  assert.throws(() => deleteCategory(d, "Roupas"), /vinculados/);
  saveCategory(d, "Papelaria");
  deleteCategory(d, "Papelaria");
  assert.ok(!d.categories.includes("Papelaria"));
});
test("moderação de comentário e foto preserva a avaliação", () => {
  const d = fresh();
  moderateReview(d, 101, "comment", "Comentário impróprio");
  assert.equal(d.reviews.find((r) => r.id === 101).comment, "");
  assert.ok(d.reviews.find((r) => r.id === 101).photo);
  moderateReview(d, 101, "photo", "Foto imprópria");
  assert.equal(d.reviews.find((r) => r.id === 101).photo, "");
  assert.equal(d.reviews.length, 3);
  assert.equal(d.audit.length, 2);
});
test("remoção integral recalcula média e exige motivo", () => {
  const d = fresh();
  assert.throws(() => moderateReview(d, 101, "review", ""), /motivo/);
  moderateReview(d, 101, "review", "Conteúdo impróprio");
  assert.equal(rating(d, 1), "Sem avaliações");
  assert.equal(d.reviews.length, 2);
});
test("métricas distinguem lojas totais, pendências e usuários engajados", () => {
  const m = metrics(fresh());
  assert.equal(m.stores, 5);
  assert.equal(m.pending, 1);
  assert.equal(m.engaged, 3);
  assert.equal(m.engagement, 50);
  assert.equal(m.products, 6);
});
test("contato codifica a mensagem e trata número não informado", () => {
  assert.equal(whatsappLink("", "x"), null);
  const url = new URL(
    whatsappLink("55 89 99999-9999", "Olá! Camisa R$ 129,90 #produto/1"),
  );
  assert.equal(url.hostname, "wa.me");
  assert.equal(
    url.searchParams.get("text"),
    "Olá! Camisa R$ 129,90 #produto/1",
  );
});
test("cadastro local preserva validações e não armazena a senha em texto", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
  };
  const { signUp } = await import("../services/auth.js");
  const users = fresh().users;
  await assert.rejects(
    signUp(users, {
      name: "Teste",
      email: "x@exemplo.com",
      role: "administrador",
      password: "Teste123!",
    }),
    /perfil/,
  );
  const user = await signUp(users, {
    name: "Teste",
    email: "teste@exemplo.com",
    role: "consumidor",
    password: "Teste123!",
  });
  users.push(user);
  assert.ok(![...values.values()].join("").includes("Teste123!"));
  await assert.rejects(
    signUp(users, {
      name: "Outro",
      email: user.email,
      role: "lojista",
      password: "Teste123!",
    }),
    /cadastrado/,
  );
});

test("login Supabase retorna usuário, sessão e access token", async () => {
  const { signIn } = await import("../services/auth.js");
  const session = { access_token: "jwt-teste", user: { id: "user-id" } };
  const client = {
    auth: {
      signInWithPassword: async (credentials) => {
        assert.deepEqual(credentials, {
          email: "teste@exemplo.com",
          password: "Senha123!",
        });
        return { data: { user: session.user, session }, error: null };
      },
    },
  };

  const result = await signIn(
    [],
    " teste@exemplo.com ",
    "Senha123!",
    client,
  );

  assert.equal(result.user.id, "user-id");
  assert.equal(result.session, session);
  assert.equal(result.accessToken, "jwt-teste");
});

test("login Supabase propaga erro de autenticação", async () => {
  const { signIn } = await import("../services/auth.js");
  const client = {
    auth: {
      signInWithPassword: async () => ({
        data: {},
        error: { message: "Invalid login credentials" },
      }),
    },
  };

  await assert.rejects(
    signIn([], "teste@exemplo.com", "invalida", client),
    /Invalid login credentials/,
  );
});

test("sessão Supabase existente pode ser restaurada", async () => {
  const { getCurrentSession } = await import("../services/auth.js");
  const session = { access_token: "jwt-restaurado" };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
    },
  };

  assert.equal(await getCurrentSession(client), session);
});

test("estado inicial sem sessão retorna null", async () => {
  const { getCurrentSession } = await import("../services/auth.js");
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };

  assert.equal(await getCurrentSession(client), null);
});

test("alterações de autenticação atualizam a sessão observada", async () => {
  const { observeAuthChanges } = await import("../services/auth.js");
  let listener;
  let unsubscribed = false;
  const client = {
    auth: {
      onAuthStateChange: (callback) => {
        listener = callback;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true;
              },
            },
          },
        };
      },
    },
  };
  let observedSession;

  const stop = observeAuthChanges((session) => {
    observedSession = session;
  }, client);
  listener("TOKEN_REFRESHED", { access_token: "jwt-renovado" });

  assert.equal(observedSession.access_token, "jwt-renovado");
  listener("SIGNED_OUT", null);
  assert.equal(observedSession, null);
  stop();
  assert.equal(unsubscribed, true);
});

test("logout chama Supabase Auth", async () => {
  const { signOut } = await import("../services/auth.js");
  let called = false;
  const client = {
    auth: {
      signOut: async () => {
        called = true;
        return { error: null };
      },
    },
  };

  await signOut(client);
  assert.equal(called, true);
});

test("access token atual fica disponível para chamadas futuras", async () => {
  const { getAccessToken } = await import("../services/auth.js");
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "jwt-atual" } },
        error: null,
      }),
    },
  };

  assert.equal(await getAccessToken(client), "jwt-atual");
});

test("favoritos do consumidor inicializam e refletem produtos aprovados", () => {
  const d = fresh();
  const caio = d.users.find((u) => u.id === "consumer");
  assert.ok(Array.isArray(caio.favorites));
  assert.deepEqual(caio.favorites, [2, 4]);

  const approved = d.stores.filter((s) => s.status === "aprovada");
  const activeProducts = d.products.filter(
    (p) => !p.deleted && approved.some((s) => s.id === p.store),
  );
  const favoriteProducts = activeProducts.filter((p) =>
    caio.favorites.some((id) => Number(id) === Number(p.id)),
  );
  assert.equal(favoriteProducts.length, 2);
  assert.deepEqual(favoriteProducts.map((p) => p.id), [2, 4]);

  // Se um produto for excluído, ele sai dos favoritos ativos
  d.products.find((p) => p.id === 2).deleted = true;
  const filteredAfterDelete = d.products
    .filter((p) => !p.deleted && approved.some((s) => s.id === p.store))
    .filter((p) => caio.favorites.some((id) => Number(id) === Number(p.id)));
  assert.equal(filteredAfterDelete.length, 1);
  assert.equal(filteredAfterDelete[0].id, 4);
});

test("pontos do consumidor calculam saldo total, saldo por loja e histórico", () => {
  const d = fresh();
  assert.ok(Array.isArray(d.pontos_transacoes));

  // Validação dos campos do schema
  for (const t of d.pontos_transacoes) {
    assert.ok(t.id);
    assert.ok(t.usuario_id);
    assert.ok(t.loja_id);
    assert.ok(["credito", "resgate"].includes(t.tipo));
    assert.ok(typeof t.quantidade === "number" && t.quantidade > 0);
    assert.ok(t.criado_em);
  }

  // Filtragem das transações do consumidor Caio
  const caioTransactions = d.pontos_transacoes.filter(
    (t) => t.usuario_id === "consumer",
  );
  assert.equal(caioTransactions.length, 4);

  // Regra de saldo total: credito soma, resgate subtrai
  const total = caioTransactions.reduce((acc, t) => {
    return t.tipo === "credito" ? acc + t.quantidade : acc - t.quantidade;
  }, 0);
  assert.equal(total, 150); // 10 + 120 + 50 - 30 = 150

  // Regra de saldo por loja
  const saldoPorLoja = caioTransactions.reduce((acc, t) => {
    acc[t.loja_id] =
      (acc[t.loja_id] || 0) + (t.tipo === "credito" ? t.quantidade : -t.quantidade);
    return acc;
  }, {});

  assert.equal(saldoPorLoja[1], 100); // Dona Flor (1): 10 + 120 - 30 = 100
  assert.equal(saldoPorLoja[2], 50); // Passo Leve (2): 50

  // Regra da avaliação publicada: gera 10 pontos de crédito
  const reviewTransaction = caioTransactions.find((t) => t.avaliacao_id === 101);
  assert.ok(reviewTransaction);
  assert.equal(reviewTransaction.tipo, "credito");
  assert.equal(reviewTransaction.quantidade, 10);
  assert.equal(reviewTransaction.descricao, "Pontos por avaliação publicada");

  // Usuário sem transações (estado vazio)
  const emptyUserTransactions = d.pontos_transacoes.filter(
    (t) => t.usuario_id === "usuario_inexistente",
  );
  assert.equal(emptyUserTransactions.length, 0);
  const emptyTotal = emptyUserTransactions.reduce((acc, t) => {
    return t.tipo === "credito" ? acc + t.quantidade : acc - t.quantidade;
  }, 0);
  assert.equal(emptyTotal, 0);
});

test("minhas avaliações filtra pelo consumidor e ordena da mais recente", () => {
  const reviews = fresh().reviews;

  assert.deepEqual(
    getUserReviews(reviews, "sample1").map((review) => review.id),
    [101],
  );
  assert.deepEqual(getUserReviews(reviews, "usuario-inexistente"), []);

  const databaseFields = reviews.map(({ user, store, date, ...review }) => ({
    ...review,
    usuario_id: user,
    loja_id: store,
    criado_em: date,
  }));

  assert.deepEqual(
    getUserReviews(databaseFields, "sample3").map((review) => review.id),
    [103],
  );

  const sameUser = reviews.map((review) => ({
    ...review,
    user: "sample1",
  }));
  assert.deepEqual(
    getUserReviews(sameUser, "sample1").map((review) => review.id),
    [103, 102, 101],
  );
});

test("publicação cria avaliação vinculada e crédito mock de 10 pontos", () => {
  const data = fresh();
  const user = data.users.find((item) => item.id === "consumer");
  const store = data.stores.find((item) => item.id === 1);
  const reviewsBefore = data.reviews.length;
  const pointsBefore = data.pontos_transacoes.length;

  const result = publishReview(data, {
    user,
    store,
    rating: 5,
    comment: "  Atendimento excelente.  ",
  });

  assert.equal(data.reviews.length, reviewsBefore + 1);
  assert.equal(data.pontos_transacoes.length, pointsBefore + 1);
  assert.equal(result.review.user, user.id);
  assert.equal(result.review.store, store.id);
  assert.equal(result.review.rating, 5);
  assert.equal(result.review.comment, "Atendimento excelente.");
  assert.equal(result.review.photo, "");
  assert.match(result.review.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(result.pointsTransaction.usuario_id, user.id);
  assert.equal(result.pointsTransaction.loja_id, store.id);
  assert.equal(result.pointsTransaction.tipo, "credito");
  assert.equal(result.pointsTransaction.quantidade, 10);
  assert.equal(result.pointsTransaction.avaliacao_id, result.review.id);
  assert.equal(
    result.pointsTransaction.descricao,
    "Pontos por avaliação publicada",
  );
  assert.equal(getUserReviews(data.reviews, user.id).at(0).id, result.review.id);
  assert.ok(getStoreReviews(data.reviews, store.id).some(
    (review) => review.id === result.review.id,
  ));
  assert.ok(!getUserReviews(data.reviews, "sample1").some(
    (review) => review.id === result.review.id,
  ));
});

test("publicação rejeita perfil, nota e comentário inválidos", () => {
  const data = fresh();
  const user = data.users.find((item) => item.id === "consumer");
  const store = data.stores.find((item) => item.id === 1);
  const merchant = data.users.find((item) => item.id === "merchant");

  assert.throws(
    () => publishReview(data, { user, store, rating: 0, comment: "Texto" }),
    /1 a 5/,
  );
  assert.throws(
    () => publishReview(data, { user, store, rating: 6, comment: "Texto" }),
    /1 a 5/,
  );
  assert.throws(
    () => publishReview(data, { user, store, rating: 5, comment: "   " }),
    /comentário/,
  );
  assert.throws(
    () => publishReview(data, { user: merchant, store, rating: 5, comment: "Texto" }),
    /consumidores/,
  );
});

test("getMerchantStore localiza a loja vinculada ao lojista", () => {
  const data = fresh();
  const merchantUser = data.users.find((u) => u.id === "merchant");
  const store = getMerchantStore(data, merchantUser);

  assert.ok(store);
  assert.equal(store.id, 1);
  assert.equal(store.name, "Dona Flor");

  const consumerUser = data.users.find((u) => u.id === "consumer");
  assert.equal(getMerchantStore(data, consumerUser), null);
  assert.equal(getMerchantStore(data, null), null);
});

test("saveMerchantStore atualiza os dados da própria loja existente", () => {
  const data = fresh();
  const merchantUser = data.users.find((u) => u.id === "merchant");

  const updated = saveMerchantStore(data, merchantUser, {
    name: "Dona Flor Modas",
    description: "Nova descrição completa da loja de roupas.",
    whatsapp: "89981234567",
    address: "Rua Nova, 123, Centro, Picos – PI",
    category: "Vestuário",
    hours: "Segunda a sábado, 8h às 19h",
    instagram: "@donaflormodas",
  });

  assert.equal(updated.isNew, false);
  assert.equal(updated.store.id, 1);
  assert.equal(updated.store.name, "Dona Flor Modas");
  assert.equal(updated.store.description, "Nova descrição completa da loja de roupas.");
  assert.equal(updated.store.whatsapp, "89981234567");
  assert.equal(updated.store.address, "Rua Nova, 123, Centro, Picos – PI");
  assert.equal(updated.store.status, "aprovada"); // Preserva status aprovada existente
  assert.equal(updated.store.initials, "df");

  const fromData = data.stores.find((s) => s.id === 1);
  assert.equal(fromData.name, "Dona Flor Modas");
  assert.equal(fromData.whatsapp, "89981234567");
});

test("saveMerchantStore cadastra uma nova loja vinculada ao lojista com status pendente", () => {
  const data = fresh();
  const newMerchant = {
    id: "lojista-2",
    name: "Carlos Calçados",
    email: "carlos@exemplo.com",
    role: "lojista",
  };
  data.users.push(newMerchant);

  assert.equal(getMerchantStore(data, newMerchant), null);

  const result = saveMerchantStore(data, newMerchant, {
    name: "Picos Calçados",
    description: "Sapataria e calçados em couro.",
    whatsapp: "89994445555",
    address: "Avenida Central, 400, Canto da Várzea, Picos – PI",
    category: "Calçados",
    hours: "Segunda a sexta, 8h às 18h",
  });

  assert.equal(result.isNew, true);
  assert.ok(result.store.id > 5);
  assert.equal(result.store.owner, "lojista-2");
  assert.equal(result.store.name, "Picos Calçados");
  assert.equal(result.store.status, "pendente"); // Nova loja inicia pendente
  assert.equal(result.store.whatsapp, "89994445555");
  assert.equal(result.store.address, "Avenida Central, 400, Canto da Várzea, Picos – PI");
  assert.equal(result.store.initials, "pc");

  // Agora getMerchantStore localiza a nova loja
  const found = getMerchantStore(data, newMerchant);
  assert.ok(found);
  assert.equal(found.id, result.store.id);
});

test("saveMerchantStore valida campos obrigatórios (nome, WhatsApp e localização)", () => {
  const data = fresh();
  const merchantUser = data.users.find((u) => u.id === "merchant");

  // Nome inválido
  assert.throws(
    () =>
      saveMerchantStore(data, merchantUser, {
        name: " ",
        whatsapp: "89999999999",
        address: "Rua Centro",
      }),
    /nome da loja/,
  );

  // WhatsApp inválido
  assert.throws(
    () =>
      saveMerchantStore(data, merchantUser, {
        name: "Loja Teste",
        whatsapp: "123",
        address: "Rua Centro",
      }),
    /WhatsApp/,
  );

  // Localização / Endereço inválido
  assert.throws(
    () =>
      saveMerchantStore(data, merchantUser, {
        name: "Loja Teste",
        whatsapp: "89999999999",
        address: " ",
      }),
    /localização ou endereço/,
  );

  // Perfil não lojista
  const consumerUser = data.users.find((u) => u.id === "consumer");
  assert.throws(
    () =>
      saveMerchantStore(data, consumerUser, {
        name: "Loja Teste",
        whatsapp: "89999999999",
        address: "Rua Centro",
      }),
    /lojistas/,
  );
});

test("getStoreProducts lista somente os produtos ativos da loja do lojista", () => {
  const data = fresh();
  // Loja 1 possui produtos cadastrados no seed
  const store1Products = getStoreProducts(data, 1);
  assert.ok(store1Products.length > 0);
  assert.ok(store1Products.every((p) => p.store === 1 && !p.deleted));

  // Produtos de outra loja não aparecem
  const store2Products = getStoreProducts(data, 2);
  assert.ok(store2Products.every((p) => p.store === 2));

  // Produto marcado como excluído não deve constar
  data.products.find((p) => p.store === 1).deleted = true;
  const afterDelete = getStoreProducts(data, 1);
  assert.equal(afterDelete.length, store1Products.length - 1);
});

test("deleteStoreProduct marca o produto como excluído e o remove da listagem", () => {
  const data = fresh();
  const merchantUser = data.users.find((u) => u.id === "merchant");
  const storeProductsBefore = getStoreProducts(data, 1);
  const targetProduct = storeProductsBefore[0];

  deleteStoreProduct(data, merchantUser, targetProduct.id);

  assert.equal(targetProduct.deleted, true);
  const storeProductsAfter = getStoreProducts(data, 1);
  assert.equal(storeProductsAfter.length, storeProductsBefore.length - 1);
  assert.ok(!storeProductsAfter.some((p) => p.id === targetProduct.id));

  // Tentar excluir produto inexistente deve falhar
  assert.throws(
    () => deleteStoreProduct(data, merchantUser, 9999),
    /não encontrado/,
  );
});

test("updateStoreProduct edita com sucesso as informações do produto e valida regras", () => {
  const data = fresh();
  const merchantUser = data.users.find((u) => u.id === "merchant");
  const productToEdit = getStoreProducts(data, 1)[0];

  const result = updateStoreProduct(data, merchantUser, productToEdit.id, {
    name: "Camisa de Linho Atualizada",
    description: "Nova descrição do linho.",
    price: 199.9,
    sale: 149.9,
    category: "Vestuário",
    variations: "P, M, G, XG",
  });

  assert.equal(result.product.name, "Camisa de Linho Atualizada");
  assert.equal(result.product.price, 199.9);
  assert.equal(result.product.sale, 149.9);
  assert.deepEqual(result.product.variations, ["P", "M", "G", "XG"]);

  // Validação: nome vazio
  assert.throws(
    () =>
      updateStoreProduct(data, merchantUser, productToEdit.id, {
        name: "",
        price: 100,
      }),
    /nome do produto/,
  );

  // Validação: preço inválido
  assert.throws(
    () =>
      updateStoreProduct(data, merchantUser, productToEdit.id, {
        name: "Produto Válido",
        price: -10,
      }),
    /preço válido/,
  );

  // Validação: preço promocional maior ou igual ao preço de venda
  assert.throws(
    () =>
      updateStoreProduct(data, merchantUser, productToEdit.id, {
        name: "Produto Válido",
        price: 100,
        sale: 120,
      }),
    /menor que o preço original/,
  );
});

test("createStoreProduct adiciona um novo produto ao catálogo da loja", () => {
  const data = fresh();
  const merchantUser = data.users.find((u) => u.id === "merchant");
  const initialCount = getStoreProducts(data, 1).length;

  const result = createStoreProduct(data, merchantUser, {
    name: "Vestido Floral de Verão",
    description: "Vestido leve e estampado.",
    price: 180,
    sale: 150,
    category: "Vestuário",
    variations: "P, M",
    image: "/images/shirt.jpg",
  });

  assert.ok(result.product.id > 0);
  assert.equal(result.product.store, 1);
  assert.equal(result.product.name, "Vestido Floral de Verão");
  assert.equal(result.product.price, 180);
  assert.equal(result.product.sale, 150);
  assert.deepEqual(result.product.variations, ["P", "M"]);

  const updatedProducts = getStoreProducts(data, 1);
  assert.equal(updatedProducts.length, initialCount + 1);
  assert.ok(updatedProducts.some((p) => p.id === result.product.id));
});


