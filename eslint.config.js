export default [
    { ignores: ["node_modules/**", "database/**", "auth_info/**", "backups/**"] },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                Buffer: "readonly", console: "readonly", process: "readonly", setTimeout: "readonly", setInterval: "readonly", clearTimeout: "readonly", clearInterval: "readonly",
                document: "readonly", window: "readonly", location: "readonly", history: "readonly", fetch: "readonly", alert: "readonly", confirm: "readonly",
                FormData: "readonly", FileReader: "readonly", URLSearchParams: "readonly", URL: "readonly", Notification: "readonly", Intl: "readonly",
                bootstrap: "readonly", Router: "readonly", clienteEditando: "writable",
                carregarDashboard: "readonly", carregarClientes: "readonly", inicializarClientes: "readonly", carregarTemplates: "readonly",
                inicializarTemplates: "readonly", carregarEnvio: "readonly", carregarHistorico: "readonly", inicializarHistorico: "readonly",
                inicializarMensagens: "readonly", inicializarCampanhas: "readonly", inicializarConfiguracoes: "readonly",
                carregarComissoesDashboard: "readonly", inicializarTecnicosComissao: "readonly", inicializarHistoricoComissoes: "readonly",
                inicializarSolicitacaoComissao: "readonly"
            }
        },
        rules: {
            "no-undef": "error",
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
            "no-constant-condition": "off"
        }
    },
    { files: ["src/public/js/**/*.js"], rules: { "no-unused-vars": "off" } }
];
