const diasEntre = (inicio, fim) => Math.max(0, Math.round((new Date(`${fim}T12:00:00`) - new Date(`${inicio}T12:00:00`)) / 86400000));

export function periodosEfetivos(metricas) {
    return metricas.filter((item, indice, todos) => !todos.some((outro, outroIndice) =>
        outroIndice !== indice && outro.period_start <= item.period_start && outro.period_end >= item.period_end &&
        (outro.period_start < item.period_start || outro.period_end > item.period_end)));
}

export function calcularPrioridade(cliente, totalA, totalB, metricas = []) {
    const variacao = totalA ? ((totalB - totalA) / totalA) * 100 : totalB ? 100 : null;
    let score = 20; const motivos = [];
    if (totalA > 0 && totalB === 0) { score += 60; motivos.push("comprou no período anterior e não comprou no atual"); }
    else if (variacao !== null && variacao <= -50) { score += 50; motivos.push(`queda de ${Math.abs(Math.round(variacao))}%`); }
    else if (variacao !== null && variacao <= -20) { score += 30; motivos.push(`queda de ${Math.abs(Math.round(variacao))}%`); }
    else if (variacao !== null && variacao >= 20) { score -= 10; motivos.push(`crescimento de ${Math.round(variacao)}%`); }
    if (totalA >= 5000) { score += 15; motivos.push("cliente de valor histórico relevante"); }
    if (["Entrar em contato", "Aguardando retorno", "Negociação"].includes(cliente.reactivation_status)) { score += 15; motivos.push(`status ${cliente.reactivation_status}`); }
    if (cliente.next_contact_at && cliente.next_contact_at <= new Date().toISOString().slice(0, 10)) { score += 15; motivos.push("contato programado está vencido"); }
    const periodos = [...metricas].filter(item => item.period_end).sort((a, b) => a.period_end.localeCompare(b.period_end));
    const ultimo = periodos.at(-1);
    if (ultimo) {
        const diasSemComprar = diasEntre(ultimo.period_end, new Date().toISOString().slice(0, 10));
        const intervalos = periodos.slice(1).map((item, index) => Math.max(1, diasEntre(periodos[index].period_end, item.period_end)));
        const frequencia = intervalos.length ? Math.round(intervalos.reduce((sum, value) => sum + value, 0) / intervalos.length) : null;
        if (frequencia && diasSemComprar > frequencia * 1.5) { score += 20; motivos.push(`há ${diasSemComprar} dias sem compra; frequência anterior era de cerca de ${frequencia} dias`); }
    }
    score = Math.max(0, Math.min(100, score));
    const automaticLevel = score >= 70 ? "Alta" : score >= 40 ? "Média" : "Baixa";
    if (["Alta", "Média", "Baixa"].includes(cliente.priority_override)) return {
        level: cliente.priority_override, score, automaticLevel, manual: true,
        reason: cliente.priority_notes || `prioridade definida manualmente; cálculo automático: ${automaticLevel}`
    };
    return { level: automaticLevel, score, automaticLevel, manual: false, reason: motivos.join("; ") || "sem alerta relevante" };
}

function chavePeriodo(item, view) {
    const ano = Number(String(item.period_end).slice(0, 4));
    const mes = Number(String(item.period_end).slice(5, 7));
    if (view === "annual") return { key: String(ano), label: String(ano), start: `${ano}-01-01`, end: `${ano}-12-31` };
    if (view === "quarterly") {
        const trimestre = Math.ceil(mes / 3);
        const inicio = (trimestre - 1) * 3 + 1;
        const ultimo = inicio + 2;
        return { key: `${ano}-T${trimestre}`, label: `${trimestre}º tri/${ano}`,
            start: `${ano}-${String(inicio).padStart(2, "0")}-01`, end: new Date(Date.UTC(ano, ultimo, 0)).toISOString().slice(0, 10) };
    }
    return { key: `${ano}-${String(mes).padStart(2, "0")}`, label: `${String(mes).padStart(2, "0")}/${ano}`,
        start: `${ano}-${String(mes).padStart(2, "0")}-01`, end: new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10) };
}

export function serieTemporal(metricas, view = "monthly") {
    const grupos = new Map();
    for (const item of periodosEfetivos(metricas)) {
        const periodo = chavePeriodo(item, view);
        const atual = grupos.get(periodo.key) || { ...periodo, value: 0, purchases: 0 };
        atual.value += Number(item.purchased_value) || 0;
        atual.purchases += Number(item.order_count) || 0;
        grupos.set(periodo.key, atual);
    }
    const serie = [...grupos.values()].sort((a, b) => a.key.localeCompare(b.key));
    return serie.map((item, index) => ({ ...item,
        variation: index && serie[index - 1].value ? ((item.value - serie[index - 1].value) / serie[index - 1].value) * 100 : null }));
}

export function resumoCliente(cliente, metricas) {
    const efetivas = periodosEfetivos(metricas);
    const anos = [...new Set(efetivas.map(item => Number(item.reference_year)))].sort((a, b) => b - a);
    const totalAno = ano => efetivas.filter(item => Number(item.reference_year) === ano).reduce((sum, item) => sum + Number(item.purchased_value || 0), 0);
    const faturamento = efetivas.reduce((sum, item) => sum + Number(item.purchased_value || 0), 0);
    const compras = efetivas.reduce((sum, item) => sum + Number(item.order_count || 0), 0);
    const datas = [...new Set(efetivas.map(item => item.period_end).filter(Boolean))].sort();
    const intervalos = datas.slice(1).map((data, index) => diasEntre(datas[index], data));
    const ultimoAno = anos[0]; const anoAnterior = anos[1];
    const atual = ultimoAno ? totalAno(ultimoAno) : 0; const anterior = anoAnterior ? totalAno(anoAnterior) : 0;
    const variacao = anterior ? ((atual - anterior) / anterior) * 100 : atual ? 100 : 0;
    const ultimaCompra = datas.at(-1) || cliente.last_movement_at || null;
    return {
        faturamento, compras, ticketMedio: compras ? faturamento / compras : 0,
        frequenciaMediaDias: intervalos.length ? Math.round(intervalos.reduce((sum, value) => sum + value, 0) / intervalos.length) : null,
        ultimaCompra, diasSemComprar: ultimaCompra ? diasEntre(ultimaCompra, new Date().toISOString().slice(0, 10)) : null,
        crescimento: variacao, totalAtual: atual, totalAnterior: anterior,
        prioridade: calcularPrioridade(cliente, anterior, atual, efetivas),
        series: { monthly: serieTemporal(efetivas, "monthly"), quarterly: serieTemporal(efetivas, "quarterly"), annual: serieTemporal(efetivas, "annual") }
    };
}

export function calcularScoreReativacao(cliente, metricas = [], contatos = []) {
    const resumo = resumoCliente(cliente, metricas);
    const fatores = [];
    const adicionar = (key, label, points, value) => fatores.push({ key, label, points, value });
    const dias = resumo.diasSemComprar;
    const frequencia = resumo.frequenciaMediaDias;
    if (dias !== null) adicionar("recencia", "Tempo sem comprar", Math.min(25, Math.floor(dias / 30) * 3), `${dias} dias`);
    if (dias !== null && frequencia) {
        const atraso = Math.max(0, dias - frequencia);
        adicionar("frequencia", "Diferença para a frequência normal", Math.min(20, Math.round((atraso / frequencia) * 10)), `${atraso} dias além da média de ${frequencia} dias`);
    }
    if (resumo.totalAnterior > 0 && resumo.crescimento < 0) adicionar("queda_faturamento", "Queda de faturamento", Math.min(20, Math.round(Math.abs(resumo.crescimento) / 5)), `${Math.abs(resumo.crescimento).toFixed(1)}%`);
    if (resumo.faturamento > 0) adicionar("faturamento_historico", "Faturamento histórico", Math.min(15, Math.floor(resumo.faturamento / 5000)), resumo.faturamento);
    if (resumo.ticketMedio > 0) adicionar("ticket_medio", "Ticket médio", Math.min(8, Math.floor(resumo.ticketMedio / 500)), resumo.ticketMedio);
    const datas = [...new Set(periodosEfetivos(metricas).map(item => item.period_end).filter(Boolean))].sort();
    const intervalos = datas.slice(1).map((data, index) => diasEntre(datas[index], data));
    if (intervalos.length >= 2) {
        const media = intervalos.reduce((sum, value) => sum + value, 0) / intervalos.length;
        const desvio = Math.sqrt(intervalos.reduce((sum, value) => sum + ((value - media) ** 2), 0) / intervalos.length);
        const regularidade = Math.max(0, 1 - (desvio / media));
        adicionar("regularidade", "Regularidade histórica", Math.round(regularidade * 7), `${Math.round(regularidade * 100)}%`);
    }
    const ultimoContato = [...contatos].filter(item => item.contacted_at).sort((a, b) => String(b.contacted_at).localeCompare(String(a.contacted_at)))[0];
    if (ultimoContato) {
        const diasContato = diasEntre(String(ultimoContato.contacted_at).slice(0, 10), new Date().toISOString().slice(0, 10));
        adicionar("contato_recente", "Contato comercial recente", diasContato <= 7 ? -10 : diasContato <= 30 ? -5 : 0, `${diasContato} dias atrás`);
    }
    const score = Math.max(0, Math.min(100, fatores.reduce((sum, fator) => sum + fator.points, 0)));
    return { score, factors: fatores.filter(fator => fator.points !== 0) };
}
