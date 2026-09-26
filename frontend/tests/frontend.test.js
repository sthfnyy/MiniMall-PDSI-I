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
test("autenticação local valida senha, cadastro e perfil permitido", async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (k) => values.get(k) || null,
    setItem: (k, v) => values.set(k, v),
  };
  const { signIn, signUp } = await import("../services/auth.js");
  const users = fresh().users;
  assert.equal(
    (await signIn(users, "admin@exemplo.com", "Demo1234!")).role,
    "administrador",
  );
  await assert.rejects(
    signIn(users, "admin@exemplo.com", "invalida"),
    /inválidos/,
  );
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
  assert.equal((await signIn(users, user.email, "Teste123!")).id, user.id);
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
