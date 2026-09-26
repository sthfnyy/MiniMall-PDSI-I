// Local frontend adapter. Replace with API calls when the backend is available.
export const DEMO_PASSWORD = "Demo1234!";
const KEY = "minimall-delivery-credentials-v1";
async function digest(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function signIn(users, email, password) {
  const user = users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  );
  if (!user) throw new Error("E-mail ou senha inválidos.");
  const credentials = JSON.parse(localStorage.getItem(KEY) || "{}");
  const saved = credentials[user.id];
  const valid = saved
    ? (await digest(password, saved.salt)) === saved.hash
    : !user.id.startsWith("user-") && password === DEMO_PASSWORD;
  if (!valid) throw new Error("E-mail ou senha inválidos.");
  return user;
}
export async function signUp(users, values) {
  const email = values.email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === email))
    throw new Error("Este e-mail já está cadastrado.");
  if (!["consumidor", "lojista"].includes(values.role))
    throw new Error("Selecione um perfil válido.");
  if (values.password.length < 8)
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  const user = {
    id: "user-" + crypto.randomUUID(),
    name: values.name.trim(),
    email,
    role: values.role,
    status: "Ativo",
  };
  const salt = crypto.randomUUID();
  const credentials = JSON.parse(localStorage.getItem(KEY) || "{}");
  credentials[user.id] = { salt, hash: await digest(values.password, salt) };
  localStorage.setItem(KEY, JSON.stringify(credentials));
  return user;
}
