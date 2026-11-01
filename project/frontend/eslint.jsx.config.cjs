// Pemeriksa referensi tak terdefinisi TERMASUK komponen JSX.
//
// Latar: `eslint.undef.config.cjs` hanya mengaktifkan `no-undef`, yang TIDAK
// memeriksa identifier yang dipakai sebagai komponen JSX (mis. <AlertTriangle/>).
// Akibatnya komponen yang lupa di-import lolos dari check:undef DAN dari
// `craco build` (babel tidak me-resolve nama variabel), lalu meledak sebagai
// ReferenceError saat render. Berkas ini menambahkan `react/jsx-no-undef`.
//
// Jalankan: npx eslint --config eslint.jsx.config.cjs --ext .js,.jsx src
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
  plugins: ["react", "react-hooks"],
  settings: {
    react: { version: "detect" },
  },
  rules: {
    "no-undef": "error",
    "react/jsx-no-undef": "error",
    "react/jsx-uses-vars": "error",
    "react/jsx-uses-react": "off",
  },
};
