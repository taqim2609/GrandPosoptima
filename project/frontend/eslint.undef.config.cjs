// Pemeriksa "variabel tidak terdefinisi" (no-undef) untuk src/.
//
// ESLint 8 yang dipakai proyek menerima konfigurasi legacy; format flat config
// dibaca sebagai YAML oleh perintah npm sebelumnya.
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["react-hooks"],
  rules: {
    "no-undef": "error",
  },
};
