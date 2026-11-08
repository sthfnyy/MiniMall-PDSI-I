import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProductFromApi,
  fetchMerchantCategories,
  fetchMerchantProducts,
  fetchMerchantProduct,
  createMerchantProduct,
  updateMerchantProduct,
  deleteMerchantProduct,
  uploadMerchantProductPhoto,
} from "../services/merchant.js";

test("normalizeProductFromApi mapeia campos do backend para o formato do frontend", () => {
  const apiProd = {
    id: "prod-uuid-1",
    loja_id: "loja-uuid-1",
    categoria_id: "cat-uuid-1",
    categoria_nome: "Vestuário",
    titulo: "Camiseta Silk",
    descricao: "Camiseta 100% algodão",
    preco_base: "89.90",
    preco_promocional: "69.90",
    foto_principal_url: "https://example.com/foto.jpg",
    ativo: true,
    variacoes: [
      { id: "v1", tamanho: "P", ativo: true },
      { id: "v2", tamanho: "M", ativo: true },
    ],
  };

  const normalized = normalizeProductFromApi(apiProd);

  assert.equal(normalized.id, "prod-uuid-1");
  assert.equal(normalized.store, "loja-uuid-1");
  assert.equal(normalized.categoryId, "cat-uuid-1");
  assert.equal(normalized.category, "Vestuário");
  assert.equal(normalized.name, "Camiseta Silk");
  assert.equal(normalized.description, "Camiseta 100% algodão");
  assert.equal(normalized.price, 89.9);
  assert.equal(normalized.sale, 69.9);
  assert.equal(normalized.image, "https://example.com/foto.jpg");
  assert.equal(normalized.active, true);
  assert.deepEqual(normalized.variations, ["P", "M"]);
});

test("normalizeProductFromApi trata produto sem promoção e sem variações", () => {
  const apiProd = {
    id: "prod-uuid-2",
    loja_id: "loja-uuid-1",
    categoria_id: "cat-uuid-2",
    categoria_nome: null,
    titulo: "Calça Jeans",
    descricao: null,
    preco_base: "150.00",
    preco_promocional: null,
    foto_principal_url: null,
    ativo: false,
    variacoes: [],
  };

  const normalized = normalizeProductFromApi(apiProd);

  assert.equal(normalized.name, "Calça Jeans");
  assert.equal(normalized.sale, 0);
  assert.equal(normalized.preco_promocional, null);
  assert.equal(normalized.image, "");
  assert.equal(normalized.active, false);
  assert.deepEqual(normalized.variations, []);
});

test("fetchMerchantCategories consulta GET /lojista/produtos/categorias e normaliza", async () => {
  const calls = [];
  const request = async (url) => {
    calls.push(url);
    return [
      { id: "c1", nome: "Vestuário" },
      { id: "c2", nome: "Calçados" },
    ];
  };

  const categories = await fetchMerchantCategories(request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0], "/lojista/produtos/categorias");
  assert.equal(categories.length, 2);
  assert.equal(categories[0].name, "Vestuário");
  assert.equal(categories[1].name, "Calçados");
});

test("fetchMerchantProducts consulta GET /lojista/produtos com filtros", async () => {
  const calls = [];
  const request = async (url) => {
    calls.push(url);
    return [
      {
        id: "p1",
        loja_id: "loja-1",
        categoria_id: "cat-1",
        titulo: "Bolsa Couro",
        preco_base: "200.00",
        preco_promocional: null,
        ativo: true,
      },
    ];
  };

  const prods = await fetchMerchantProducts(
    { busca: "couro", categoria_id: "cat-1", ativo: true },
    request,
  );

  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("/lojista/produtos?"));
  assert.ok(calls[0].includes("busca=couro"));
  assert.ok(calls[0].includes("categoria_id=cat-1"));
  assert.ok(calls[0].includes("ativo=true"));
  assert.equal(prods.length, 1);
  assert.equal(prods[0].name, "Bolsa Couro");
});

test("fetchMerchantProduct consulta GET /lojista/produtos/{id}", async () => {
  const calls = [];
  const request = async (url) => {
    calls.push(url);
    return {
      id: "prod-123",
      loja_id: "loja-1",
      categoria_id: "cat-1",
      titulo: "Item Detalhado",
      preco_base: "50.00",
      ativo: true,
    };
  };

  const prod = await fetchMerchantProduct("prod-123", request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0], "/lojista/produtos/prod-123");
  assert.equal(prod.id, "prod-123");
  assert.equal(prod.name, "Item Detalhado");
});

test("createMerchantProduct envia POST /lojista/produtos com payload validado", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return {
      id: "prod-new",
      loja_id: "loja-1",
      categoria_id: "cat-uuid-1",
      titulo: "Vestido Floral",
      descricao: "Tecido leve",
      preco_base: "120.00",
      preco_promocional: "99.90",
      foto_principal_url: "https://example.com/vestido.jpg",
      ativo: true,
      variacoes: [{ id: "v1", tamanho: "P" }],
    };
  };

  const created = await createMerchantProduct(
    {
      name: "Vestido Floral",
      description: "Tecido leve",
      price: "120.00",
      hasPromotion: true,
      sale: "99.90",
      categoryId: "cat-uuid-1",
      image: "https://example.com/vestido.jpg",
      variations: ["P"],
    },
    request,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/produtos");
  assert.equal(calls[0].options.method, "POST");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.titulo, "Vestido Floral");
  assert.equal(body.preco_base, 120);
  assert.equal(body.preco_promocional, 99.9);
  assert.equal(body.categoria_id, "cat-uuid-1");
  assert.equal(body.foto_principal_url, "https://example.com/vestido.jpg");
  assert.equal(body.ativo, true);
  assert.deepEqual(body.variacoes, [{ tamanho: "P", ativo: true }]);

  assert.equal(created.id, "prod-new");
});

test("createMerchantProduct rejeita dados inválidos antes de chamar API", async () => {
  await assert.rejects(
    async () => createMerchantProduct({ name: "A", price: 10, categoryId: "c1" }),
    /Informe o nome do produto/
  );

  await assert.rejects(
    async () => createMerchantProduct({ name: "Produto Válido", price: 0, categoryId: "c1" }),
    /Informe um preço de venda válido/
  );

  await assert.rejects(
    async () =>
      createMerchantProduct({
        name: "Produto Válido",
        price: 50,
        hasPromotion: true,
        sale: 60,
        categoryId: "c1",
      }),
    /preço promocional deve ser menor que o preço original/
  );

  await assert.rejects(
    async () => createMerchantProduct({ name: "Produto Válido", price: 50, categoryId: "" }),
    /Selecione uma categoria/
  );
});

test("updateMerchantProduct envia PATCH /lojista/produtos/{id}", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return {
      id: "prod-1",
      loja_id: "loja-1",
      categoria_id: "cat-2",
      titulo: "Vestido Floral Atualizado",
      descricao: "Nova descrição",
      preco_base: "130.00",
      preco_promocional: null,
      ativo: false,
    };
  };

  const updated = await updateMerchantProduct(
    "prod-1",
    {
      name: "Vestido Floral Atualizado",
      description: "Nova descrição",
      price: 130,
      hasPromotion: false,
      active: false,
    },
    request,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/produtos/prod-1");
  assert.equal(calls[0].options.method, "PATCH");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.titulo, "Vestido Floral Atualizado");
  assert.equal(body.preco_base, 130);
  assert.equal(body.preco_promocional, null);
  assert.equal(body.ativo, false);

  assert.equal(updated.name, "Vestido Floral Atualizado");
});

test("deleteMerchantProduct envia DELETE /lojista/produtos/{id}", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return { message: "Produto excluído com sucesso", id: "prod-1" };
  };

  const res = await deleteMerchantProduct("prod-1", request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/produtos/prod-1");
  assert.equal(calls[0].options.method, "DELETE");
  assert.equal(res.id, "prod-1");
});

test("uploadMerchantProductPhoto envia multipart/form-data para /lojista/produtos/upload-foto", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return { url: "https://storage.supabase.co/foto.png" };
  };

  const fakeFile = new Blob(["conteudo"], { type: "image/png" });
  fakeFile.name = "foto.png";

  const res = await uploadMerchantProductPhoto(fakeFile, request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/produtos/upload-foto");
  assert.equal(calls[0].options.method, "POST");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(res.url, "https://storage.supabase.co/foto.png");
});
