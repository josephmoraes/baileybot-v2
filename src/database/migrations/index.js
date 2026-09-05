import db from "../database.js";

const adicionarColuna = (tabela, coluna, definicao) => {
    const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
    if (!colunas.some(item => item.name === coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
};

const migrations = [
    {
        id: "001_compatibilidade_v2",
        up() {
            adicionarColuna("users", "customer_code", "TEXT");
            adicionarColuna("campaigns", "validation_status", "TEXT NOT NULL DEFAULT 'nao_validada'");
            adicionarColuna("campaigns", "validated_at", "DATETIME");
            adicionarColuna("campaigns", "cancel_requested", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaigns", "progress_total", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaigns", "progress_processed", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaigns", "current_recipient", "TEXT");
            adicionarColuna("campaigns", "next_send_at", "DATETIME");
            adicionarColuna("campaigns", "cooldown_ms", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("campaign_recipients", "validation_status", "TEXT NOT NULL DEFAULT 'nao_validado'");
            adicionarColuna("campaign_recipients", "validation_error", "TEXT");
            adicionarColuna("campaign_recipients", "validated_jid", "TEXT");
            adicionarColuna("campaign_recipients", "validated_at", "DATETIME");
            adicionarColuna("campaign_recipients", "active", "INTEGER NOT NULL DEFAULT 1");
            adicionarColuna("messages", "campaign_id", "INTEGER");
            adicionarColuna("messages", "campaign_nome", "TEXT");
            db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_code ON users(customer_code) WHERE customer_code IS NOT NULL AND customer_code <> ''");
        }
    },
    {
        id: "002_vendas_comissionadas_por_documento",
        up() {
            adicionarColuna("commission_imports", "commissioned_rows", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("commission_imports", "duplicate_rows", "INTEGER NOT NULL DEFAULT 0");
            adicionarColuna("commissions", "document_number", "TEXT");
            adicionarColuna("commissions", "commissioned_code", "TEXT");
            adicionarColuna("commissions", "commissioned_name", "TEXT");
            adicionarColuna("commissions", "customer_name", "TEXT");
            adicionarColuna("commissions", "report_seller", "TEXT");
            adicionarColuna("commissions", "source_filename", "TEXT");
            adicionarColuna("commissions", "imported_at", "DATETIME");
            db.exec(`UPDATE commissions SET
                document_number=COALESCE(document_number,movement),
                commissioned_code=COALESCE(commissioned_code,(SELECT og1_code FROM technicians WHERE technicians.id=commissions.technician_id)),
                commissioned_name=COALESCE(commissioned_name,(SELECT name FROM technicians WHERE technicians.id=commissions.technician_id)),
                source_filename=COALESCE(source_filename,(SELECT filename FROM commission_imports WHERE commission_imports.id=commissions.import_id)),
                imported_at=COALESCE(imported_at,(SELECT created_at FROM commission_imports WHERE commission_imports.id=commissions.import_id),created_at)`);
            db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_document_number ON commissions(document_number) WHERE document_number IS NOT NULL AND document_number <> ''");
        }
    },
    {
        id: "003_notificacoes_creditos_manuais",
        up() {
            db.exec(`CREATE TABLE IF NOT EXISTS commission_notification_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                import_id INTEGER,
                kind TEXT NOT NULL CHECK(kind IN ('novos_creditos','consulta_saldo')),
                status TEXT NOT NULL DEFAULT 'pendente',
                initiated_by TEXT NOT NULL,
                cancel_requested INTEGER NOT NULL DEFAULT 0,
                total INTEGER NOT NULL DEFAULT 0,
                processed INTEGER NOT NULL DEFAULT 0,
                sent INTEGER NOT NULL DEFAULT 0,
                failed INTEGER NOT NULL DEFAULT 0,
                current_technician TEXT,
                next_send_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                finished_at DATETIME,
                FOREIGN KEY (import_id) REFERENCES commission_imports(id) ON DELETE SET NULL
            );
            CREATE TABLE IF NOT EXISTS commission_notification_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                import_id INTEGER,
                technician_id INTEGER NOT NULL,
                technician_name TEXT NOT NULL,
                phone TEXT,
                kind TEXT NOT NULL CHECK(kind IN ('novos_creditos','consulta_saldo')),
                message TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pendente',
                error TEXT,
                sent_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES commission_notification_jobs(id) ON DELETE CASCADE,
                FOREIGN KEY (import_id) REFERENCES commission_imports(id) ON DELETE SET NULL,
                FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE RESTRICT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notification_once
                ON commission_notification_recipients(import_id, technician_id, kind)
                WHERE import_id IS NOT NULL AND kind='novos_creditos' AND status='enviado';
            CREATE INDEX IF NOT EXISTS idx_commission_notification_history
                ON commission_notification_recipients(created_at DESC, status);`);
        }
    },
    {
        id: "004_modulo_reativacao",
        up() {
            adicionarColuna("users", "seller", "TEXT");
            adicionarColuna("users", "last_movement_at", "TEXT");
            adicionarColuna("users", "last_movement_value", "REAL NOT NULL DEFAULT 0");
            adicionarColuna("users", "accumulated_value", "REAL NOT NULL DEFAULT 0");
            adicionarColuna("users", "reactivation_status", "TEXT NOT NULL DEFAULT 'Sem Contato'");
            adicionarColuna("users", "reactivation_notes", "TEXT");
            adicionarColuna("users", "next_contact_at", "TEXT");
            db.exec(`CREATE TABLE IF NOT EXISTS reactivation_contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                kind TEXT NOT NULL DEFAULT 'ligacao',
                notes TEXT,
                contacted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                next_contact_at TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS reactivation_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                color TEXT NOT NULL DEFAULT '#198754',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reactivation_user_tags (
                user_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (user_id, tag_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES reactivation_tags(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_users_reactivation_seller ON users(seller);
            CREATE INDEX IF NOT EXISTS idx_users_reactivation_status ON users(reactivation_status);
            CREATE INDEX IF NOT EXISTS idx_reactivation_contacts_user_date ON reactivation_contacts(user_id, contacted_at DESC);`);
            const inserir = db.prepare("INSERT OR IGNORE INTO reactivation_tags(name,color) VALUES(?,?)");
            [["VIP", "#ffc107"], ["Grande potencial", "#0dcaf0"], ["Refrigerista", "#6f42c1"], ["Empresa", "#198754"]]
                .forEach(tag => inserir.run(...tag));
        }
    },
    {
        id: "005_clientes_sem_whatsapp",
        transaction: false,
        up() {
            db.pragma("foreign_keys = OFF");
            db.pragma("legacy_alter_table = ON");
            db.transaction(() => db.exec(`ALTER TABLE users RENAME TO users_before_optional_jid;
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT,
                name TEXT,
                jid TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                customer_code TEXT,
                seller TEXT,
                last_movement_at TEXT,
                last_movement_value REAL NOT NULL DEFAULT 0,
                accumulated_value REAL NOT NULL DEFAULT 0,
                reactivation_status TEXT NOT NULL DEFAULT 'Sem Contato',
                reactivation_notes TEXT,
                next_contact_at TEXT
            );
            INSERT INTO users(id,company_name,name,jid,created_at,customer_code,seller,last_movement_at,last_movement_value,
                accumulated_value,reactivation_status,reactivation_notes,next_contact_at)
            SELECT id,company_name,name,jid,created_at,customer_code,seller,last_movement_at,last_movement_value,
                accumulated_value,reactivation_status,reactivation_notes,next_contact_at FROM users_before_optional_jid;
            DROP TABLE users_before_optional_jid;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_code ON users(customer_code) WHERE customer_code IS NOT NULL AND customer_code <> '';
            CREATE INDEX IF NOT EXISTS idx_users_reactivation_seller ON users(seller);
            CREATE INDEX IF NOT EXISTS idx_users_reactivation_status ON users(reactivation_status);`))();
            db.pragma("legacy_alter_table = OFF");
            db.pragma("foreign_keys = ON");
        }
    },
    {
        id: "006_ordenacao_clientes_recentes",
        up() {
            adicionarColuna("users", "reactivation_updated_at", "DATETIME");
            adicionarColuna("users", "reactivation_sequence", "INTEGER");
            db.exec("CREATE INDEX IF NOT EXISTS idx_users_reactivation_updated ON users(reactivation_updated_at DESC)");
            db.exec("CREATE INDEX IF NOT EXISTS idx_users_reactivation_sequence ON users(reactivation_sequence DESC)");
        }
    },
    {
        id: "007_campanha_fixa_clientes_aguardando",
        up() {
            adicionarColuna("campaigns", "fixed_key", "TEXT");
            adicionarColuna("campaign_recipients", "customer_code", "TEXT");
            db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_fixed_key
                ON campaigns(fixed_key) WHERE fixed_key IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_campaign_recipient_customer_code
                ON campaign_recipients(campaign_id,customer_code);`);
            db.exec(`UPDATE campaign_recipients SET customer_code=(
                SELECT customer_code FROM users WHERE users.id=campaign_recipients.cliente_id
            ) WHERE customer_code IS NULL`);
        }
    },
    {
        id: "008_caixa_entrada_relatorios_reativacao",
        up() {
            db.exec(`CREATE TABLE IF NOT EXISTS reactivation_report_imports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                total_rows INTEGER NOT NULL DEFAULT 0,
                pending_rows INTEGER NOT NULL DEFAULT 0,
                approved_rows INTEGER NOT NULL DEFAULT 0,
                excluded_rows INTEGER NOT NULL DEFAULT 0,
                total_value REAL NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reactivation_report_rows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_id INTEGER NOT NULL,
                company_name TEXT NOT NULL,
                purchased_value REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovado','excluido')),
                approved_user_id INTEGER,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (report_id) REFERENCES reactivation_report_imports(id) ON DELETE CASCADE,
                FOREIGN KEY (approved_user_id) REFERENCES users(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reactivation_report_rows_report_status
                ON reactivation_report_rows(report_id,status);`);
        }
    },
    {
        id: "009_filtro_data_cadastro_campanha_reativacao",
        up() {
            adicionarColuna("campaigns", "registration_date_from", "TEXT");
            adicionarColuna("campaigns", "registration_date_to", "TEXT");
            db.exec("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)");
        }
    },
    {
        id: "010_campanhas_e_ajustes_comissao",
        up() {
            adicionarColuna("campaigns", "message_mode", "TEXT NOT NULL DEFAULT 'template'");
            adicionarColuna("campaigns", "custom_message", "TEXT");
            adicionarColuna("commissions", "original_rate", "REAL");
            adicionarColuna("commissions", "adjustment_reason", "TEXT");
            adicionarColuna("commissions", "adjusted_at", "DATETIME");
            adicionarColuna("commissions", "adjusted_by", "TEXT");
            db.exec(`CREATE TABLE IF NOT EXISTS commission_rate_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commission_id INTEGER NOT NULL,
                previous_rate REAL NOT NULL,
                new_rate REAL NOT NULL,
                previous_value REAL NOT NULL,
                new_value REAL NOT NULL,
                reason TEXT NOT NULL,
                adjusted_by TEXT NOT NULL DEFAULT 'Administrador local',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_commission_adjustments_commission
                ON commission_rate_adjustments(commission_id,created_at DESC);`);
        }
    },
    {
        id: "011_acompanhamento_individual_campanhas",
        up() {
            adicionarColuna("campaign_recipients", "contact_status", "TEXT NOT NULL DEFAULT 'nao_contatado'");
            adicionarColuna("campaign_recipients", "contact_result", "TEXT");
            adicionarColuna("campaign_recipients", "contact_notes", "TEXT");
            adicionarColuna("campaign_recipients", "last_contact_at", "TEXT");
            adicionarColuna("campaign_recipients", "next_contact_at", "TEXT");
            adicionarColuna("campaign_recipients", "contact_updated_at", "DATETIME");
            adicionarColuna("campaign_recipients", "contact_updated_by", "TEXT");
            db.exec("CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact_status ON campaign_recipients(campaign_id,contact_status,active)");
        }
    },
    {
        id: "012_data_inclusao_participante_campanha",
        up() {
            adicionarColuna("campaign_recipients", "added_at", "DATETIME");
            db.exec(`UPDATE campaign_recipients SET added_at=COALESCE(added_at,CURRENT_TIMESTAMP),
                last_contact_at=COALESCE(last_contact_at,date('now','localtime'))`);
        }
    },
    {
        id: "013_participante_campanha_sem_whatsapp",
        transaction: false,
        up() {
            db.pragma("foreign_keys = OFF");
            db.pragma("legacy_alter_table = ON");
            db.transaction(() => db.exec(`ALTER TABLE campaign_recipients RENAME TO campaign_recipients_before_optional_jid;
            CREATE TABLE campaign_recipients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL,
                cliente_id INTEGER,
                cliente_nome TEXT NOT NULL,
                cliente_jid TEXT,
                customer_code TEXT,
                status TEXT NOT NULL DEFAULT 'pendente',
                erro TEXT,
                enviado_em DATETIME,
                validation_status TEXT NOT NULL DEFAULT 'nao_validado',
                validation_error TEXT,
                validated_jid TEXT,
                validated_at DATETIME,
                active INTEGER NOT NULL DEFAULT 1,
                contact_status TEXT NOT NULL DEFAULT 'nao_contatado',
                contact_result TEXT,
                contact_notes TEXT,
                last_contact_at TEXT,
                next_contact_at TEXT,
                added_at DATETIME,
                contact_updated_at DATETIME,
                contact_updated_by TEXT,
                FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
                FOREIGN KEY (cliente_id) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE (campaign_id,cliente_jid)
            );
            INSERT INTO campaign_recipients(id,campaign_id,cliente_id,cliente_nome,cliente_jid,customer_code,status,erro,enviado_em,
                validation_status,validation_error,validated_jid,validated_at,active,contact_status,contact_result,contact_notes,
                last_contact_at,next_contact_at,added_at,contact_updated_at,contact_updated_by)
            SELECT id,campaign_id,cliente_id,cliente_nome,cliente_jid,customer_code,status,erro,enviado_em,
                validation_status,validation_error,validated_jid,validated_at,active,contact_status,contact_result,contact_notes,
                last_contact_at,next_contact_at,added_at,contact_updated_at,contact_updated_by
            FROM campaign_recipients_before_optional_jid;
            DROP TABLE campaign_recipients_before_optional_jid;
            CREATE INDEX idx_campaign_recipients_campaign_status ON campaign_recipients(campaign_id,status);
            CREATE INDEX idx_campaign_recipient_customer_code ON campaign_recipients(campaign_id,customer_code);
            CREATE INDEX idx_campaign_recipients_contact_status ON campaign_recipients(campaign_id,contact_status,active);`))();
            db.pragma("legacy_alter_table = OFF");
            db.pragma("foreign_keys = ON");
        }
    },
    {
        id: "014_perfil_tecnico_testes",
        up() {
            adicionarColuna("technicians", "is_test", "INTEGER NOT NULL DEFAULT 0");
            const taxa = Number(db.prepare("SELECT value FROM app_settings WHERE key='default_commission_rate'").get()?.value ?? 3);
            db.prepare(`INSERT INTO technicians(name,og1_code,commission_rate,is_test,active)
                VALUES('Testes','TESTES',?,1,1)
                ON CONFLICT(og1_code) DO UPDATE SET name='Testes',is_test=1,active=1`).run(taxa);
        }
    },
    {
        id: "015_metricas_clientes_og1",
        up() {
            adicionarColuna("users", "main_products", "TEXT");
            adicionarColuna("users", "latest_products", "TEXT");
            db.exec(`CREATE TABLE IF NOT EXISTS customer_metric_imports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                reference_year INTEGER NOT NULL,
                reference_month INTEGER NOT NULL CHECK(reference_month BETWEEN 1 AND 12),
                total_rows INTEGER NOT NULL DEFAULT 0,
                inserted_customers INTEGER NOT NULL DEFAULT 0,
                updated_customers INTEGER NOT NULL DEFAULT 0,
                total_value REAL NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(reference_year,reference_month)
            );
            CREATE TABLE IF NOT EXISTS customer_monthly_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                import_id INTEGER NOT NULL,
                reference_year INTEGER NOT NULL,
                reference_month INTEGER NOT NULL CHECK(reference_month BETWEEN 1 AND 12),
                seller TEXT NOT NULL DEFAULT 'Outros',
                report_seller TEXT,
                purchased_value REAL NOT NULL DEFAULT 0,
                order_count REAL NOT NULL DEFAULT 0,
                average_order_value REAL NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (import_id) REFERENCES customer_metric_imports(id) ON DELETE CASCADE,
                UNIQUE(user_id,reference_year,reference_month)
            );
            CREATE INDEX IF NOT EXISTS idx_customer_metrics_period ON customer_monthly_metrics(reference_year,reference_month);
            CREATE INDEX IF NOT EXISTS idx_customer_metrics_seller ON customer_monthly_metrics(seller,reference_year,reference_month);
            CREATE INDEX IF NOT EXISTS idx_customer_metrics_user ON customer_monthly_metrics(user_id,reference_year,reference_month);`);
        }
    },
    {
        id: "016_metricas_periodos_status_notas",
        up() {
            adicionarColuna("customer_metric_imports", "period_start", "TEXT");
            adicionarColuna("customer_metric_imports", "period_end", "TEXT");
            adicionarColuna("customer_monthly_metrics", "period_start", "TEXT");
            adicionarColuna("customer_monthly_metrics", "period_end", "TEXT");
            adicionarColuna("users", "metric_status", "TEXT NOT NULL DEFAULT 'Pendente de contato'");
            adicionarColuna("users", "metric_notes", "TEXT");
            db.exec(`UPDATE customer_metric_imports SET
                period_start=printf('%04d-%02d-01',reference_year,reference_month),
                period_end=date(printf('%04d-%02d-01',reference_year,reference_month),'+1 month','-1 day')
                WHERE period_start IS NULL OR period_end IS NULL;
            UPDATE customer_monthly_metrics SET
                period_start=printf('%04d-%02d-01',reference_year,reference_month),
                period_end=date(printf('%04d-%02d-01',reference_year,reference_month),'+1 month','-1 day')
                WHERE period_start IS NULL OR period_end IS NULL;
            CREATE TABLE IF NOT EXISTS customer_status_options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scope TEXT NOT NULL CHECK(scope IN ('metrics','reactivation')),
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#6c757d',
                active INTEGER NOT NULL DEFAULT 1,
                position INTEGER NOT NULL DEFAULT 0,
                UNIQUE(scope,name)
            );
            CREATE INDEX IF NOT EXISTS idx_metric_import_range ON customer_metric_imports(period_start,period_end);
            CREATE INDEX IF NOT EXISTS idx_metric_range ON customer_monthly_metrics(period_start,period_end);
            CREATE INDEX IF NOT EXISTS idx_users_metric_status ON users(metric_status);
            CREATE INDEX IF NOT EXISTS idx_users_customer_search ON users(customer_code,company_name,name);`);
            const inserir = db.prepare("INSERT OR IGNORE INTO customer_status_options(scope,name,color,position) VALUES(?,?,?,?)");
            [
                ["metrics", "Pendente de contato", "#dc3545"], ["metrics", "Contato realizado", "#0d6efd"],
                ["metrics", "Em negociação", "#ffc107"], ["metrics", "Trabalho realizado", "#198754"],
                ["metrics", "Empresa ativa", "#20c997"], ["metrics", "Não abordar", "#6c757d"],
                ["metrics", "Acompanhar depois", "#6f42c1"], ["metrics", "Sem oportunidade", "#343a40"],
                ...["Último Contato", "Entrar em contato", "Contatado", "Avulso", "Recente", "Aguardando", "Sem Contato", "Não ligar", "-"]
                    .map(name => ["reactivation", name, "#6c757d"])
            ].forEach(([scope, name, color], position) => inserir.run(scope, name, color, position));
        }
    },
    {
        id: "017_consultas_comissao_tecnicos",
        up() {
            db.exec(`CREATE TABLE IF NOT EXISTS commission_technician_inquiries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                technician_id INTEGER NOT NULL,
                inquiry_date TEXT NOT NULL,
                notes TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_commission_inquiries_date ON commission_technician_inquiries(inquiry_date DESC,id DESC);
            CREATE INDEX IF NOT EXISTS idx_commission_inquiries_technician ON commission_technician_inquiries(technician_id);`);
        }
    }
];

export function executarMigrations() {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const aplicada = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?");
    const registrar = db.prepare("INSERT INTO schema_migrations(id) VALUES(?)");
    for (const migration of migrations) {
        if (aplicada.get(migration.id)) continue;
        const executar = () => {
            migration.up();
            registrar.run(migration.id);
        };
        if (migration.transaction === false) executar();
        else db.transaction(executar)();
    }
}
