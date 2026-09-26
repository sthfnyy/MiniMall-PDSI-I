export const money = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const price = (p) => p.sale || p.price;
export const normalize = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export const seed = {
  users: [
    {
      id: "consumer",
      name: "Caio",
      email: "caio@exemplo.com",
      role: "consumidor",
      status: "Ativo",
    },
    {
      id: "merchant",
      name: "Dona Flor",
      email: "lojista@exemplo.com",
      role: "lojista",
      status: "Ativo",
    },
    {
      id: "admin",
      name: "Administrador",
      email: "admin@exemplo.com",
      role: "administrador",
      status: "Ativo",
    },
    {
      id: "sample1",
      name: "Mariana S.",
      email: "mariana@exemplo.com",
      role: "consumidor",
      status: "Ativo",
    },
    {
      id: "sample2",
      name: "Pedro L.",
      email: "pedro@exemplo.com",
      role: "consumidor",
      status: "Ativo",
    },
    {
      id: "sample3",
      name: "Luiza M.",
      email: "luiza@exemplo.com",
      role: "consumidor",
      status: "Ativo",
    },
  ],
  categories: [
    "Vestuário",
    "Calçados",
    "Perfumaria",
    "Acessórios",
    "Casa e decoração",
  ],
  stores: [
    {
      id: 1,
      name: "Dona Flor",
      category: "Vestuário",
      initials: "df",
      color: "#ede4d7",
      description: "Roupas e acessórios.",
      address: "Rua Coronel Francisco Santos, Centro, Picos – PI",
      hours: "Segunda a sexta, 9h às 18h · Sábado, 9h às 13h",
      whatsapp: import.meta.env?.VITE_DEMO_WHATSAPP || "",
      instagram: import.meta.env?.VITE_DEMO_INSTAGRAM || "",
      status: "aprovada",
    },
    {
      id: 2,
      name: "Passo Leve",
      category: "Calçados",
      initials: "pl",
      color: "#dce8ed",
      description: "Calçados casuais.",
      address: "Avenida Getúlio Vargas, Centro, Picos – PI",
      hours: "Segunda a sábado, 8h às 18h",
      whatsapp: import.meta.env?.VITE_DEMO_WHATSAPP || "",
      instagram: import.meta.env?.VITE_DEMO_INSTAGRAM || "",
      status: "aprovada",
    },
    {
      id: 3,
      name: "Essência",
      category: "Perfumaria",
      initials: "es",
      color: "#f2e2e9",
      description: "Perfumes e cosméticos.",
      address: "Rua São José, Centro, Picos – PI",
      hours: "Segunda a sábado, 9h às 18h",
      whatsapp: import.meta.env?.VITE_DEMO_WHATSAPP || "",
      instagram: import.meta.env?.VITE_DEMO_INSTAGRAM || "",
      status: "aprovada",
    },
    {
      id: 4,
      name: "Casa Nativa",
      category: "Casa e decoração",
      initials: "cn",
      color: "#e2e8d9",
      description: "Utensílios e decoração.",
      address: "Avenida Nossa Senhora de Fátima, Picos – PI",
      hours: "Segunda a sexta, 8h às 18h",
      whatsapp: import.meta.env?.VITE_DEMO_WHATSAPP || "",
      instagram: import.meta.env?.VITE_DEMO_INSTAGRAM || "",
      status: "aprovada",
    },
    {
      id: 5,
      name: "Ateliê Aurora",
      category: "Acessórios",
      initials: "aa",
      color: "#ede0f6",
      description: "Acessórios feitos à mão em Picos.",
      address: "Centro, Picos – PI",
      hours: "Segunda a sexta, 9h às 17h",
      whatsapp: import.meta.env?.VITE_DEMO_WHATSAPP || "",
      instagram: import.meta.env?.VITE_DEMO_INSTAGRAM || "",
      status: "pendente",
    },
  ],
  products: [
    {
      id: 1,
      store: 1,
      name: "Camisa de linho natural",
      description:
        "Modelagem leve e confortável, com toque macio e acabamento cuidadoso. Uma peça versátil para o dia a dia.",
      price: 159.9,
      sale: 129.9,
      category: "Vestuário",
      variations: ["P", "M", "G", "GG"],
      image: "/images/shirt.jpg",
    },
    {
      id: 2,
      store: 2,
      name: "Tênis casual branco",
      description:
        "O clássico que combina com tudo. Solado confortável e acabamento em material sintético.",
      price: 189.9,
      sale: 0,
      category: "Calçados",
      variations: ["36", "37", "38", "39", "40", "41"],
      image: "/images/sneakers.jpg",
    },
    {
      id: 3,
      store: 3,
      name: "Eau de parfum floral",
      description:
        "Uma fragrância floral delicada, com notas frescas e fundo amadeirado. Frasco de 50 ml.",
      price: 219.9,
      sale: 179.9,
      category: "Perfumaria",
      variations: ["50 ml"],
      image: "/images/perfume.jpg",
    },
    {
      id: 4,
      store: 1,
      name: "Bolsa tiracolo caramelo",
      description:
        "Sua companhia para todos os dias. Alça ajustável, compartimento interno e fechamento seguro.",
      price: 149.9,
      sale: 0,
      category: "Acessórios",
      variations: ["Caramelo"],
      image: "/images/bag.jpg",
    },
    {
      id: 5,
      store: 1,
      name: "Óculos de sol essencial",
      description:
        "Armação leve e formato atemporal para completar o seu visual.",
      price: 89.9,
      sale: 69.9,
      category: "Acessórios",
      variations: ["Preto", "Tartaruga"],
      image: "/images/sunglasses.jpg",
    },
    {
      id: 6,
      store: 4,
      name: "Caneca de cerâmica",
      description:
        "Uma pausa mais bonita. Caneca de cerâmica de 300 ml, perfeita para o café de cada manhã.",
      price: 49.9,
      sale: 0,
      category: "Casa e decoração",
      variations: ["Branco"],
      image: "/images/mug.jpg",
    },
  ],
  reviews: [
    {
      id: 101,
      store: 1,
      user: "sample1",
      name: "Mariana S.",
      rating: 5,
      comment:
        "Atendimento superatencioso e peças lindas. Adorei conhecer a loja!",
      photo: "/images/shirt.jpg",
      date: "2026-09-20",
    },
    {
      id: 102,
      store: 2,
      user: "sample2",
      name: "Pedro L.",
      rating: 5,
      comment:
        "O tênis é muito confortável. Fui buscar na loja e deu tudo certo.",
      photo: "",
      date: "2026-09-21",
    },
    {
      id: 103,
      store: 3,
      user: "sample3",
      name: "Luiza M.",
      rating: 4,
      comment: "Gostei da variedade de fragrâncias e do atendimento.",
      photo: "",
      date: "2026-09-22",
    },
  ],
  audit: [],
  views: 0,
};

export function rating(data, id) {
  const list = data.reviews.filter((r) => r.store === id);
  return list.length
    ? (list.reduce((sum, r) => sum + r.rating, 0) / list.length)
        .toFixed(1)
        .replace(".", ",")
    : "Sem avaliações";
}
