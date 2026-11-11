/* =========================================================
   IPEC Service Desk — lógica do protótipo
   Vanilla JS, sem dependências. A base de outubro/2026 é
   imutável; a sessão de demonstração vive no localStorage.
   ========================================================= */
(function () {
  'use strict';

  const BASE = Array.isArray(window.IPEC_BASE) ? window.IPEC_BASE : [];
  const BASE_META = window.IPEC_BASE_META || {};
  const STORAGE_KEY = 'ipec-service-desk-v1';
  const RELOGIO_DEMO = new Date('2026-11-10T09:00:00');
  const POR_PAGINA = 15;

  const CATEGORIAS = ['Hardware', 'Rede/Internet', 'Sistemas/Software', 'Impressão', 'Acesso/Contas'];
  const CANAIS = ['WhatsApp', 'Telefone', 'E-mail', 'Presencial', 'Planilha'];
  const PRIORIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'];
  const STATUS = ['Aberto', 'Em Atendimento', 'Escalonado', 'Resolvido', 'Encerrado'];
  const SLA = { 'Crítica': 4, 'Alta': 8, 'Média': 24, 'Baixa': 48 };
  const NIVEIS = { N1: ['TS1', 'TS2'], N2: ['AI1', 'AI2'], N3: ['AS'] };
  const ROTULO_STATUS = {
    'Aberto': 'Aberto',
    'Em Atendimento': 'Em atendimento',
    'Escalonado': 'Escalonado',
    'Resolvido': 'Resolvido',
    'Encerrado': 'Encerrado'
  };

  const METAS = {
    tmr: 24,
    sla: 80,
    fcr: 50,
    reincidencia: 10,
    satisfacao: 4.0,
    satisfeitos: 75,
    backlog: 20,
    registro: 95,
    disponibilidade: 99,
    sigma: 2.5
  };

  // Valores do diagnóstico que não estão no CSV (fontes: Partes 1 e 2).
  const CONTEXTO_BASE = {
    demandaEstimada: 646,
    taxaRegistro: 65,
    disponibilidade: 92.5,
    sigma: 1.4,
    respostasSatisfacao: 113
  };

  const ICONES = {
    sino: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    relogio: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    estrela: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9z"/></svg>',
    caixa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></svg>',
    raio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
    alvo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>',
    usuario: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 17H3z"/><path d="M12 9v5M12 17h.01"/></svg>',
    busca: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'
  };

  const state = {
    view: 'dashboard',
    sessao: [],
    notificacoes: [],
    demoOffsetMin: 0,
    proximoId: 1420,
    filtros: { busca: '', categoria: '', prioridade: '', status: '', nivel: '' },
    pagina: 1,
    porPagina: POR_PAGINA,
    detalheId: null,
    escalonando: false,
    resolvendo: false,
    notificacoesAbertas: false,
    ultimoFoco: null
  };

  /* ---------------- utilidades ---------------- */

  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtNum(valor, casas) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
    const n = Number(valor);
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: casas == null ? 1 : casas,
      maximumFractionDigits: casas == null ? 1 : casas
    });
  }

  function fmtInt(valor) {
    return fmtNum(valor, 0);
  }

  function fmtPct(valor, casas) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
    return fmtNum(valor, casas == null ? 1 : casas) + '%';
  }

  function fmtHoras(valor) {
    if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
    return fmtNum(valor, 1) + ' h';
  }

  function fmtDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function fmtData(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function agoraDemo() {
    return new Date(RELOGIO_DEMO.getTime() + state.demoOffsetMin * 60000);
  }

  function horasEntre(inicioIso, fimIso) {
    const inicio = new Date(inicioIso);
    const fim = new Date(fimIso);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
    return Math.max(0, (fim.getTime() - inicio.getTime()) / 3600000);
  }

  function media(valores) {
    if (!valores.length) return null;
    return valores.reduce(function (soma, n) { return soma + n; }, 0) / valores.length;
  }

  function mediana(valores) {
    if (!valores.length) return null;
    const ordenados = valores.slice().sort(function (a, b) { return a - b; });
    const meio = Math.floor(ordenados.length / 2);
    return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
  }

  function encerrado(t) {
    return t.status === 'Resolvido' || t.status === 'Encerrado';
  }

  function ativo(t) {
    return t.status === 'Aberto' || t.status === 'Em Atendimento' || t.status === 'Escalonado';
  }

  function tempoResolucao(t) {
    if (t.tempoResolucaoHoras !== null && t.tempoResolucaoHoras !== undefined) {
      return Number(t.tempoResolucaoHoras);
    }
    if (t.resolvidoEm && t.abertoEm) return horasEntre(t.abertoEm, t.resolvidoEm);
    return null;
  }

  function horasDecorridas(t) {
    if (encerrado(t)) return tempoResolucao(t);
    return horasEntre(t.abertoEm, agoraDemo().toISOString());
  }

  function classificarSla(t) {
    if (encerrado(t)) {
      const tempo = tempoResolucao(t);
      const ok = typeof t.dentroSla === 'boolean' ? t.dentroSla : (tempo !== null && tempo <= t.slaHoras);
      return {
        ok: ok,
        label: ok ? 'Cumprido' : 'Violado',
        tone: ok ? 'ok' : 'perigo',
        ratio: tempo === null ? 1 : Math.min(tempo / t.slaHoras, 1),
        restante: t.slaHoras - (tempo || 0),
        tempo: tempo
      };
    }
    const horas = horasDecorridas(t) || 0;
    const ratio = horas / t.slaHoras;
    let label = fmtPct(ratio * 100, 0) + ' do SLA';
    let tone = 'ok';
    if (ratio >= 1) { label = 'Violado'; tone = 'perigo'; }
    else if (ratio >= 0.75) { tone = 'alerta'; }
    return {
      ok: ratio < 1,
      label: label,
      tone: tone,
      ratio: Math.min(Math.max(ratio, 0), 1),
      ratioReal: ratio,
      restante: t.slaHoras - horas,
      tempo: horas
    };
  }

  /* ---------------- base, métricas e persistência ---------------- */

  function prepararBase() {
    return BASE.map(function (t) {
      const encerradoBase = t.status === 'Encerrado';
      const historico = [{
        em: t.abertoEm,
        titulo: 'Chamado aberto',
        texto: 'Registrado via ' + t.canal + '.',
        autor: t.solicitante
      }];
      if (encerradoBase) {
        historico.push({
          em: t.resolvidoEm || t.abertoEm,
          titulo: 'Chamado encerrado',
          texto: 'Tempo de resolução: ' + fmtHoras(t.tempoResolucaoHoras) + '. SLA ' + (t.dentroSla ? 'cumprido' : 'violado') + '.',
          autor: 'Equipe de TI'
        });
      } else {
        historico.push({
          em: t.abertoEm,
          titulo: 'Aguardando triagem',
          texto: 'Fila do Nível 1 (TS1/TS2).',
          autor: 'Sistema',
          tipo: 'alerta'
        });
      }
      return Object.assign({}, t, {
        nivel: encerradoBase ? '—' : 'N1',
        responsavel: encerradoBase ? 'Equipe de TI' : 'Fila N1',
        historico: historico,
        alerta75: false,
        alerta75Em: null
      });
    });
  }

  const base = prepararBase();

  function contarPor(linhas, campo) {
    const mapa = {};
    linhas.forEach(function (t) { mapa[t[campo]] = (mapa[t[campo]] || 0) + 1; });
    return mapa;
  }

  function calcularMetricas(linhas) {
    const concluidos = linhas.filter(encerrado);
    const emAberto = linhas.filter(ativo);
    const tempos = concluidos.map(tempoResolucao).filter(function (n) { return n !== null && !Number.isNaN(n); });
    const dentro = concluidos.filter(function (t) {
      if (typeof t.dentroSla === 'boolean') return t.dentroSla;
      const tempo = tempoResolucao(t);
      return tempo !== null && tempo <= t.slaHoras;
    });
    const respostas = linhas.filter(function (t) { return typeof t.satisfacao === 'number'; });
    const satisfeitos = respostas.filter(function (t) { return t.satisfacao >= 4; });
    const fcr = concluidos.filter(function (t) { return t.fcr === true; });
    const reinc = concluidos.filter(function (t) { return t.reincidencia === true; });
    const criticosAtivos = emAberto.filter(function (t) { return t.prioridade === 'Crítica'; });
    const emRisco = emAberto.filter(function (t) {
      const s = classificarSla(t);
      return s.ratioReal >= 0.75 && s.ratioReal < 1;
    });
    const violados = emAberto.filter(function (t) { return classificarSla(t).ratioReal >= 1; });

    const porPrioridade = PRIORIDADES.map(function (prioridade) {
      const doGrupo = linhas.filter(function (t) { return t.prioridade === prioridade; });
      const fechados = doGrupo.filter(encerrado);
      const noPrazo = fechados.filter(function (t) {
        if (typeof t.dentroSla === 'boolean') return t.dentroSla;
        const tempo = tempoResolucao(t);
        return tempo !== null && tempo <= t.slaHoras;
      });
      return {
        label: prioridade,
        total: doGrupo.length,
        encerrados: fechados.length,
        dentro: noPrazo.length,
        pct: fechados.length ? (noPrazo.length / fechados.length) * 100 : 0
      };
    });

    const satisfacaoDist = [1, 2, 3, 4, 5].map(function (nota) {
      return { nota: nota, total: respostas.filter(function (t) { return t.satisfacao === nota; }).length };
    });

    return {
      total: linhas.length,
      encerrados: concluidos.length,
      emAberto: emAberto.length,
      backlog: emAberto.length,
      tmr: media(tempos),
      mediana: mediana(tempos),
      slaPct: concluidos.length ? (dentro.length / concluidos.length) * 100 : null,
      dentroSla: dentro.length,
      fcrPct: concluidos.length ? (fcr.length / concluidos.length) * 100 : null,
      fcrQtd: fcr.length,
      reincPct: concluidos.length ? (reinc.length / concluidos.length) * 100 : null,
      reincQtd: reinc.length,
      satisfacaoMedia: media(respostas.map(function (t) { return t.satisfacao; })),
      respostas: respostas.length,
      satisfeitosPct: respostas.length ? (satisfeitos.length / respostas.length) * 100 : null,
      satisfeitosQtd: satisfeitos.length,
      porCategoria: contarPor(linhas, 'categoria'),
      porCanal: contarPor(linhas, 'canal'),
      porPrioridade: porPrioridade,
      satisfacaoDist: satisfacaoDist,
      criticosAtivos: criticosAtivos.length,
      emRisco: emRisco.length,
      violados: violados.length
    };
  }

  function carregarEstado() {
    try {
      const bruto = localStorage.getItem(STORAGE_KEY);
      if (!bruto) return;
      const dados = JSON.parse(bruto);
      if (Array.isArray(dados.chamados)) state.sessao = dados.chamados.filter(function (t) { return t && t.id; });
      if (Array.isArray(dados.notificacoes)) state.notificacoes = dados.notificacoes;
      if (Number.isFinite(dados.demoOffsetMin)) state.demoOffsetMin = dados.demoOffsetMin;
      if (Number.isFinite(dados.proximoId)) state.proximoId = dados.proximoId;
    } catch (erro) {
      console.warn('Não foi possível carregar a sessão local.', erro);
    }
    state.sessao.forEach(function (t) {
      t.sessao = true;
      if (!Array.isArray(t.historico)) t.historico = [];
      if (typeof t.alerta75 !== 'boolean') t.alerta75 = false;
      if (t.slaHoras == null) t.slaHoras = SLA[t.prioridade] || 24;
    });
    const maior = state.sessao.reduce(function (maiorId, t) {
      const numero = parseInt(String(t.id).split('-').pop(), 10) || 0;
      return Math.max(maiorId, numero);
    }, 1419);
    state.proximoId = Math.max(state.proximoId || 1420, maior + 1, 1420);
  }

  function salvarEstado() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        chamados: state.sessao,
        notificacoes: state.notificacoes,
        demoOffsetMin: state.demoOffsetMin,
        proximoId: state.proximoId
      }));
    } catch (erro) {
      console.warn('Não foi possível salvar a sessão local.', erro);
    }
  }

  function todosChamados() {
    return state.sessao.concat(base);
  }

  function buscarChamado(id) {
    return state.sessao.find(function (t) { return t.id === id; }) || base.find(function (t) { return t.id === id; });
  }

  function toast(mensagem, tipo) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (tipo || 'info');
    el.innerHTML = '<span>' + esc(mensagem) + '</span>';
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstElementChild);
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 5200);
  }

  function verificarAlertas() {
    const novos = [];
    state.sessao.forEach(function (t) {
      if (!ativo(t) || t.alerta75) return;
      const horas = horasDecorridas(t) || 0;
      const ratio = horas / t.slaHoras;
      if (ratio < 0.75 || ratio >= 1) return;
      const restante = Math.max(0, t.slaHoras - horas);
      const quando = agoraDemo().toISOString();
      t.alerta75 = true;
      t.alerta75Em = quando;
      t.historico.push({
        em: quando,
        titulo: 'Alerta de SLA (75%)',
        texto: 'Aviso enviado ao Coordenador (COO). Restam ' + fmtHoras(restante) + ' para o prazo de ' + t.slaHoras + ' h.',
        autor: 'Sistema',
        tipo: 'alerta'
      });
      state.notificacoes.unshift({
        id: 'NT-' + Date.now() + '-' + t.id,
        chamadoId: t.id,
        titulo: 'SLA em risco — 75%',
        mensagem: t.id + ' (' + t.prioridade + ') atingiu 75% do SLA. Restam ' + fmtHoras(restante) + '.',
        em: quando,
        lida: false
      });
      novos.push(t);
    });
    if (novos.length) {
      salvarEstado();
      toast(novos.length === 1 ? 'Alerta de SLA enviado ao COO.' : novos.length + ' alertas de SLA enviados ao COO.', 'alerta');
    }
    return novos;
  }

  /* ---------------- componentes reutilizáveis ---------------- */

  function badgePrioridade(prioridade) {
    const classe = {
      'Crítica': 'badge-critica',
      'Alta': 'badge-alta',
      'Média': 'badge-media',
      'Baixa': 'badge-baixa'
    }[prioridade] || 'badge-neutro';
    return '<span class="badge ' + classe + '">' + esc(prioridade) + '</span>';
  }

  function badgeStatus(status) {
    const classe = {
      'Aberto': 'badge-info',
      'Em Atendimento': 'badge-ok',
      'Escalonado': 'badge-escalonado',
      'Resolvido': 'badge-resolvido',
      'Encerrado': 'badge-neutro'
    }[status] || 'badge-neutro';
    return '<span class="badge ' + classe + '">' + esc(ROTULO_STATUS[status] || status) + '</span>';
  }

  function slaCellHTML(t) {
    const s = classificarSla(t);
    const pct = Math.round(Math.min(Math.max(s.ratio * 100, 0), 100));
    const classeBarra = s.tone === 'perigo' ? 'perigo' : s.tone === 'alerta' ? 'alerta' : '';
    if (encerrado(t)) {
      return '<div class="sla-cell"><div class="sla-texto"><strong>' + s.label + '</strong><span>' + fmtHoras(s.tempo) + '</span></div>' +
        '<div class="sla-barra"><span class="' + classeBarra + '" style="width:' + pct + '%"></span></div></div>';
    }
    const restante = s.restante >= 0 ? 'restam ' + fmtHoras(s.restante) : 'SLA excedido';
    return '<div class="sla-cell"><div class="sla-texto"><strong>' + s.label + '</strong><span>' + restante + '</span></div>' +
      '<div class="sla-barra"><span class="' + classeBarra + '" style="width:' + pct + '%"></span></div></div>';
  }

  function selectOptions(itens, selecionado, vazio) {
    let html = vazio == null ? '' : '<option value="">' + esc(vazio) + '</option>';
    itens.forEach(function (item) {
      html += '<option value="' + esc(item) + '"' + (item === selecionado ? ' selected' : '') + '>' + esc(item) + '</option>';
    });
    return html;
  }

  function pulseItem(rotulo, valor, nota, classe) {
    return '<div class="pulse-item">' +
      '<span class="pulse-rotulo">' + esc(rotulo) + '</span>' +
      '<span class="pulse-valor ' + (classe || '') + '">' + esc(valor) + '</span>' +
      '<span class="pulse-nota">' + esc(nota) + '</span>' +
      '</div>';
  }

  function kpiCard(opcoes) {
    const progresso = Math.min(100, Math.max(0, opcoes.progresso || 0));
    const tone = opcoes.tone || 'perigo';
    return '<article class="kpi-card" style="--cor-kpi:' + (tone === 'perigo' ? '#b91c1c' : tone === 'alerta' ? '#d97706' : '#0f766e') + '">' +
      '<div class="kpi-topo"><span class="kpi-rotulo">' + esc(opcoes.rotulo) + '</span><span class="kpi-icone">' + (ICONES[opcoes.icone] || ICONES.alvo) + '</span></div>' +
      '<div class="kpi-valor">' + opcoes.valor + (opcoes.unidade ? ' <small>' + esc(opcoes.unidade) + '</small>' : '') + '</div>' +
      '<div class="kpi-meta"><span>Meta <strong>' + esc(opcoes.meta) + '</strong></span><span>' + fmtInt(progresso) + '% da meta</span></div>' +
      '<div class="barra-meta"><span style="width:' + progresso + '%"></span></div>' +
      '<div class="kpi-meta"><span>' + esc(opcoes.nota) + '</span><span class="kpi-status ' + (tone === 'ok' ? 'ok' : tone === 'atencao' ? 'atencao' : '') + '">Fora da meta</span></div>' +
      '</article>';
  }

  function renderRelogio() {
    const el = document.getElementById('relogio-demo');
    if (!el) return;
    const extra = state.demoOffsetMin > 0 ? ' · +' + fmtNum(state.demoOffsetMin / 60, 0) + 'h' : '';
    el.innerHTML = 'Demo <strong>' + fmtDataHora(agoraDemo().toISOString()) + '</strong>' + extra;
  }

  /* ---------------- gráficos SVG ---------------- */

  function chartCategorias(dados) {
    const largura = 420, altura = 250, esquerda = 118, direita = 54, topo = 12, base = 24;
    const maximo = Math.max.apply(null, dados.map(function (d) { return d.valor; }).concat([1]));
    const plotW = largura - esquerda - direita;
    const rowH = (altura - topo - base) / dados.length;
    let barras = '';
    dados.forEach(function (d, i) {
      const y = topo + i * rowH + (rowH - 20) / 2;
      const w = Math.max(2, (d.valor / maximo) * plotW);
      barras += '<text x="' + (esquerda - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="9.5" fill="#475569">' + esc(d.label) + '</text>' +
        '<rect x="' + esquerda + '" y="' + y + '" width="' + w + '" height="20" rx="5" fill="#0f766e" opacity="' + (0.72 + (i % 3) * 0.1).toFixed(2) + '"></rect>' +
        '<text x="' + (esquerda + w + 6) + '" y="' + (y + 14) + '" font-size="9.5" font-weight="700" fill="#0f172a">' + fmtInt(d.valor) + '</text>';
    });
    return '<svg class="chart-svg" viewBox="0 0 ' + largura + ' ' + altura + '" role="img" aria-label="Volume de chamados por categoria">' + barras + '</svg>';
  }

  function chartSlaPrioridade(dados) {
    const largura = 420, altura = 250, esquerda = 38, direita = 18, topo = 26, base = 44;
    const plotW = largura - esquerda - direita;
    const plotH = altura - topo - base;
    const baseY = topo + plotH;
    let grade = '';
    [0, 25, 50, 75, 100].forEach(function (v) {
      const y = baseY - (v / 100) * plotH;
      grade += '<line x1="' + esquerda + '" y1="' + y + '" x2="' + (largura - direita) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1"></line>' +
        '<text x="' + (esquerda - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="#94a3b8">' + v + '%</text>';
    });
    const passo = plotW / dados.length;
    const barW = passo * 0.5;
    let barras = '';
    dados.forEach(function (d, i) {
      const x = esquerda + (i + 0.5) * passo - barW / 2;
      const h = Math.max(2, (d.pct / 100) * plotH);
      const y = baseY - h;
      const cor = d.pct >= 80 ? '#15803d' : d.pct >= 50 ? '#d97706' : '#b91c1c';
      barras += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="4" fill="' + cor + '"></rect>' +
        '<text x="' + (x + barW / 2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#0f172a">' + fmtPct(d.pct) + '</text>' +
        '<text x="' + (x + barW / 2) + '" y="' + (baseY + 14) + '" text-anchor="middle" font-size="8.5" fill="#475569">' + esc(d.label) + '</text>' +
        '<text x="' + (x + barW / 2) + '" y="' + (baseY + 26) + '" text-anchor="middle" font-size="7.5" fill="#94a3b8">' + d.dentro + '/' + d.encerrados + '</text>';
    });
    const targetY = baseY - 0.8 * plotH;
    const meta = '<line x1="' + esquerda + '" y1="' + targetY + '" x2="' + (largura - direita) + '" y2="' + targetY + '" stroke="#b91c1c" stroke-width="1.2" stroke-dasharray="4 4"></line>' +
      '<text x="' + (largura - direita) + '" y="' + (targetY - 4) + '" text-anchor="end" font-size="8" font-weight="700" fill="#b91c1c">meta 80%</text>';
    return '<svg class="chart-svg" viewBox="0 0 ' + largura + ' ' + altura + '" role="img" aria-label="Cumprimento do SLA por prioridade">' + grade + meta + barras + '</svg>';
  }

  function chartSatisfacao(dados) {
    const largura = 420, altura = 250, esquerda = 36, direita = 18, topo = 26, base = 44;
    const plotW = largura - esquerda - direita;
    const plotH = altura - topo - base;
    const baseY = topo + plotH;
    const maximo = Math.max.apply(null, dados.map(function (d) { return d.total; }).concat([1]));
    const passo = plotW / dados.length;
    const barW = passo * 0.5;
    let grade = '';
    [0, Math.ceil(maximo / 2), maximo].forEach(function (v) {
      const y = baseY - (v / maximo) * plotH;
      grade += '<line x1="' + esquerda + '" y1="' + y + '" x2="' + (largura - direita) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1"></line>' +
        '<text x="' + (esquerda - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="8" fill="#94a3b8">' + v + '</text>';
    });
    let barras = '';
    dados.forEach(function (d, i) {
      const x = esquerda + (i + 0.5) * passo - barW / 2;
      const h = Math.max(2, (d.total / maximo) * plotH);
      const y = baseY - h;
      const cor = d.nota <= 2 ? '#b91c1c' : d.nota === 3 ? '#94a3b8' : '#0f766e';
      barras += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="4" fill="' + cor + '"></rect>' +
        '<text x="' + (x + barW / 2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#0f172a">' + d.total + '</text>' +
        '<text x="' + (x + barW / 2) + '" y="' + (baseY + 14) + '" text-anchor="middle" font-size="8.5" fill="#475569">' + d.nota + '</text>' +
        '<text x="' + (x + barW / 2) + '" y="' + (baseY + 26) + '" text-anchor="middle" font-size="7.5" fill="#94a3b8">nota</text>';
    });
    return '<svg class="chart-svg" viewBox="0 0 ' + largura + ' ' + altura + '" role="img" aria-label="Distribuição das notas de satisfação">' + grade + barras + '</svg>';
  }

  /* ---------------- dashboard ---------------- */

  function renderDashboard() {
    const root = document.getElementById('view-dashboard');
    const m = calcularMetricas(base);
    const p = calcularMetricas(state.sessao);
    const naoLidas = state.notificacoes.filter(function (n) { return !n.lida; }).length;
    const progressoTmr = m.tmr ? (METAS.tmr / m.tmr) * 100 : 0;
    const progressoSla = m.slaPct ? (m.slaPct / METAS.sla) * 100 : 0;
    const progressoSat = m.satisfacaoMedia ? (m.satisfacaoMedia / METAS.satisfacao) * 100 : 0;
    const progressoBacklog = m.backlog ? (METAS.backlog / m.backlog) * 100 : 0;
    const progressoFcr = m.fcrPct ? (m.fcrPct / METAS.fcr) * 100 : 0;
    const progressoReinc = m.reincPct ? (METAS.reincidencia / m.reincPct) * 100 : 0;
    const progressoRegistro = (CONTEXTO_BASE.taxaRegistro / METAS.registro) * 100;
    const progressoDisp = (CONTEXTO_BASE.disponibilidade / METAS.disponibilidade) * 100;

    const cats = CATEGORIAS.map(function (c) { return { label: c, valor: m.porCategoria[c] || 0 }; });
    const recentes = state.sessao.slice(0, 4);

    const pulse = '<div class="pulse-card">' +
      '<div class="pulse-head"><div><h2>Pulso da operação <span class="badge-live">ao vivo</span></h2>' +
      '<p>Chamados criados nesta sessão. A linha de base de outubro/2026 permanece congelada para comparação.</p></div>' +
      '<div class="pulse-relogio">Relógio da demo <strong>' + fmtDataHora(agoraDemo().toISOString()) + '</strong>' + (state.demoOffsetMin > 0 ? ' · +' + fmtNum(state.demoOffsetMin / 60, 0) + 'h' : '') + '</div></div>' +
      '<div class="pulse-grid">' +
      pulseItem('Chamados na sessão', fmtInt(p.total), 'novos chamados da demo') +
      pulseItem('Abertos agora', fmtInt(p.emAberto), 'triagem ou atendimento') +
      pulseItem('SLA em risco', fmtInt(p.emRisco), '≥ 75% e < 100%', p.emRisco > 0 ? 'alerta' : '') +
      pulseItem('Alertas ao COO', fmtInt(state.notificacoes.length), naoLidas + ' não lido(s)', state.notificacoes.length > 0 ? 'alerta' : '') +
      '</div>' +
      (p.total === 0
        ? '<div class="pulse-vazio"><div><strong>Nenhum chamado de demonstração.</strong> Abra um chamado crítico para ver o pulso atualizar.</div><button class="btn btn-pequeno btn-primario" type="button" data-action="novo">Abrir chamado</button></div>'
        : '<div class="pulse-lista">' + recentes.map(function (t) {
            return '<span class="pulse-lista-item"><span class="ponto"></span>' + esc(t.id) + ' · ' + esc(ROTULO_STATUS[t.status] || t.status) + '</span>';
          }).join('') + '</div>') +
      '</div>';

    const kpis = '<div class="kpi-grid">' +
      kpiCard({ rotulo: 'TMR — tempo médio de resolução', valor: fmtNum(m.tmr), unidade: 'h', meta: '≤ 24 h', nota: 'mediana ' + fmtHoras(m.mediana), progresso: progressoTmr, tone: progressoTmr >= 80 ? 'atencao' : 'perigo', icone: 'relogio' }) +
      kpiCard({ rotulo: 'Cumprimento do SLA', valor: fmtNum(m.slaPct), unidade: '%', meta: '≥ 80%', nota: m.dentroSla + ' de ' + m.encerrados + ' encerrados', progresso: progressoSla, tone: progressoSla >= 80 ? 'atencao' : 'perigo', icone: 'escudo' }) +
      kpiCard({ rotulo: 'Satisfação do usuário', valor: fmtNum(m.satisfacaoMedia), unidade: '/ 5', meta: '≥ 4,0', nota: m.respostas + ' respostas · ' + fmtPct(m.satisfeitosPct) + ' com nota ≥ 4', progresso: progressoSat, tone: progressoSat >= 80 ? 'atencao' : 'perigo', icone: 'estrela' }) +
      kpiCard({ rotulo: 'Backlog — chamados abertos', valor: fmtInt(m.backlog), unidade: 'chamados', meta: '≤ 20', nota: fmtPct((m.backlog / m.total) * 100) + ' do volume do mês', progresso: progressoBacklog, tone: progressoBacklog >= 80 ? 'atencao' : 'perigo', icone: 'caixa' }) +
      '</div>';

    const kpisSecundarios = '<div class="kpi-grid secundario">' +
      kpiCard({ rotulo: 'FCR — resolução no 1º contato', valor: fmtNum(m.fcrPct), unidade: '%', meta: '≥ 50%', nota: m.fcrQtd + ' de ' + m.encerrados + ' encerrados', progresso: progressoFcr, tone: progressoFcr >= 80 ? 'atencao' : 'perigo', icone: 'raio' }) +
      kpiCard({ rotulo: 'Reincidência em 30 dias', valor: fmtNum(m.reincPct), unidade: '%', meta: '≤ 10%', nota: m.reincQtd + ' de ' + m.encerrados + ' encerrados', progresso: progressoReinc, tone: progressoReinc >= 80 ? 'atencao' : 'perigo', icone: 'raio' }) +
      kpiCard({ rotulo: 'Taxa de registro', valor: fmtNum(CONTEXTO_BASE.taxaRegistro), unidade: '%', meta: '≥ 95%', nota: '420 de ~' + CONTEXTO_BASE.demandaEstimada + ' solicitações', progresso: progressoRegistro, tone: 'perigo', icone: 'alvo' }) +
      kpiCard({ rotulo: 'Disponibilidade dos serviços', valor: fmtNum(CONTEXTO_BASE.disponibilidade), unidade: '%', meta: '≥ 99%', nota: 'monitoramento parcial', progresso: progressoDisp, tone: progressoDisp >= 80 ? 'atencao' : 'perigo', icone: 'escudo' }) +
      '</div>';

    const graficos = '<div class="charts-grid">' +
      '<div class="card"><div class="card-head"><div><h2>Volume por categoria</h2><p>' + m.total + ' chamados · out/2026</p></div></div><div class="card-body">' + chartCategorias(cats) + '<div class="chart-nota">Hardware e Rede/Internet concentram 54,8% dos chamados.</div></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Cumprimento do SLA por prioridade</h2><p>' + m.dentroSla + ' de ' + m.encerrados + ' encerrados dentro do prazo</p></div></div><div class="card-body">' + chartSlaPrioridade(m.porPrioridade) + '<div class="chart-nota">A prioridade Crítica tem o pior desempenho: 26,5%.</div></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Satisfação do usuário</h2><p>' + m.respostas + ' respostas · média ' + fmtNum(m.satisfacaoMedia, 2) + '</p></div></div><div class="card-body">' + chartSatisfacao(m.satisfacaoDist) + '<div class="chart-legenda"><span><i style="background:#b91c1c"></i>notas 1–2</span><span><i style="background:#94a3b8"></i>nota 3</span><span><i style="background:#0f766e"></i>notas 4–5</span></div></div></div>' +
      '</div>';

    const insights = '<div class="insights">' +
      '<div class="insight-card"><span class="insight-numero">01</span><p><strong>Crítica é o gargalo:</strong> apenas 26,5% dos 34 chamados críticos encerrados cumpriram as 4 h. O TMR médio do grupo é 12,0 h.</p></div>' +
      '<div class="insight-card"><span class="insight-numero">02</span><p><strong>90% da demanda</strong> entra por WhatsApp, telefone, e-mail e presencial. A planilha responde por 10% do registro manual.</p></div>' +
      '<div class="insight-card"><span class="insight-numero">03</span><p><strong>86 chamados abertos</strong> e 22,5% de reincidência mostram que o problema não é só volume: falta processo de ponta a ponta.</p></div>' +
      '</div>';

    const linhasTabela = [
      ['TMR — tempo médio de resolução', fmtHoras(m.tmr), '≤ 24 h', '-' + fmtHoras(Math.max(0, m.tmr - METAS.tmr)), 'fora'],
      ['Cumprimento do SLA', fmtPct(m.slaPct), '≥ 80%', '-' + fmtNum(METAS.sla - m.slaPct) + ' p.p.', 'fora'],
      ['FCR — resolução no 1º contato', fmtPct(m.fcrPct), '≥ 50%', '-' + fmtNum(METAS.fcr - m.fcrPct) + ' p.p.', 'fora'],
      ['Reincidência em 30 dias', fmtPct(m.reincPct), '≤ 10%', '+' + fmtNum(m.reincPct - METAS.reincidencia) + ' p.p.', 'fora'],
      ['Satisfação média', fmtNum(m.satisfacaoMedia, 2) + ' (' + fmtNum(m.satisfacaoMedia, 1) + ')', '≥ 4,0', '-' + fmtNum(METAS.satisfacao - m.satisfacaoMedia, 2), 'fora'],
      ['Usuários satisfeitos (nota ≥ 4)', fmtPct(m.satisfeitosPct), '≥ 75%', '-' + fmtNum(METAS.satisfeitos - m.satisfeitosPct) + ' p.p.', 'fora'],
      ['Backlog — chamados abertos', fmtInt(m.backlog), '≤ 20', '+' + fmtInt(m.backlog - METAS.backlog), 'fora'],
      ['Taxa de registro', fmtPct(CONTEXTO_BASE.taxaRegistro), '≥ 95%', '-' + fmtNum(METAS.registro - CONTEXTO_BASE.taxaRegistro) + ' p.p.', 'fora'],
      ['Disponibilidade média', fmtPct(CONTEXTO_BASE.disponibilidade), '≥ 99%', '-' + fmtNum(METAS.disponibilidade - CONTEXTO_BASE.disponibilidade) + ' p.p.', 'fora'],
      ['Nível sigma (SLA)', '≈ ' + fmtNum(CONTEXTO_BASE.sigma) + 'σ', '≥ 2,5σ*', '-' + fmtNum(METAS.sigma - CONTEXTO_BASE.sigma) + 'σ', 'fora']
    ];
    const tabela = '<div class="card tabela-card"><div class="tabela-topo"><div><h2>Linha de base × metas</h2><p>Outubro/2026 · 420 chamados simulados</p></div><span class="badge badge-neutro badge-sem-ponto">10 indicadores</span></div><div class="tabela-scroll"><table class="tabela"><thead><tr><th>Indicador</th><th class="col-num">Base out/2026</th><th class="col-num">Meta</th><th class="col-num">Distância</th><th>Situação</th></tr></thead><tbody>' +
      linhasTabela.map(function (l) {
        return '<tr><td class="forte">' + esc(l[0]) + '</td><td class="col-num">' + esc(l[1]) + '</td><td class="col-num">' + esc(l[2]) + '</td><td class="col-num muted">' + esc(l[3]) + '</td><td><span class="status-tabela ' + (l[4] === 'fora' ? 'fora' : 'ok') + '">' + (l[4] === 'fora' ? 'Fora da meta' : 'Na meta') + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div></div>';

    root.innerHTML = '<header class="page-head"><div><span class="eyebrow">Visão geral</span><h1 id="titulo-dashboard">Dashboard de indicadores</h1><p>Linha de base de outubro/2026 · ' + m.total + ' chamados simulados · metas de 90 dias</p></div><div class="page-actions"><button class="btn btn-primario" type="button" data-action="novo">+ Novo chamado</button></div></header>' +
      pulse + kpis + kpisSecundarios + graficos + insights + tabela +
      '<p class="fonte"><strong>Fonte:</strong> chamados_simulados.csv (420 registros, out/2026); disponibilidade e taxa de registro conforme diagnóstico da Parte 1. Dados simulados para fins acadêmicos. O pulso da sessão não altera a linha de base.</p>' +
      '<p class="nota">* A meta de 80% de SLA corresponde a aproximadamente 2,3σ (com deslocamento de 1,5). A referência de 2,5σ equivale a cerca de 84,1% de SLA e fica como meta de maturidade; o painel adota 80% como meta principal de 90 dias.</p>';
  }

  /* ---------------- chamados ---------------- */

  function filtrarChamados() {
    const termo = state.filtros.busca.trim().toLowerCase();
    return todosChamados().filter(function (t) {
      if (state.filtros.categoria && t.categoria !== state.filtros.categoria) return false;
      if (state.filtros.prioridade && t.prioridade !== state.filtros.prioridade) return false;
      if (state.filtros.status && t.status !== state.filtros.status) return false;
      if (state.filtros.nivel && (t.nivel || '—') !== state.filtros.nivel) return false;
      if (termo) {
        const blob = [t.id, t.solicitante, t.perfil, t.descricao, t.categoria, t.canal, t.status].join(' ').toLowerCase();
        if (!blob.includes(termo)) return false;
      }
      return true;
    }).sort(function (a, b) { return new Date(b.abertoEm) - new Date(a.abertoEm); });
  }

  function renderChamados() {
    const root = document.getElementById('view-chamados');
    const todos = todosChamados();
    const contagens = { '': todos.length };
    STATUS.forEach(function (s) { contagens[s] = todos.filter(function (t) { return t.status === s; }).length; });
    const chips = [['', 'Todos']].concat(STATUS.map(function (s) { return [s, ROTULO_STATUS[s]]; })).map(function (par) {
      return '<button class="chip ' + (state.filtros.status === par[0] ? 'ativo' : '') + '" type="button" data-action="status-chip" data-status="' + esc(par[0]) + '">' + esc(par[1]) + ' <span class="chip-contagem">' + contagens[par[0]] + '</span></button>';
    }).join('');

    root.innerHTML = '<header class="page-head"><div><span class="eyebrow">Operação</span><h1 id="titulo-chamados">Chamados</h1><p>' + todos.length + ' chamados na visão · base de out/2026 + sessão de demonstração</p></div><div class="page-actions"><button class="btn btn-primario" type="button" data-action="novo">+ Novo chamado</button></div></header>' +
      '<div class="ticket-toolbar" id="filtros-chamados">' +
      '<div class="campo-filtro busca"><label class="sr-only" for="busca">Buscar chamados</label>' + ICONES.busca + '<input id="busca" type="search" placeholder="Buscar por ID, solicitante ou descrição..." value="' + esc(state.filtros.busca) + '"></div>' +
      '<div class="campo-filtro"><label for="filtro-categoria">Categoria</label><select id="filtro-categoria">' + selectOptions(CATEGORIAS, state.filtros.categoria, 'Todas') + '</select></div>' +
      '<div class="campo-filtro"><label for="filtro-prioridade">Prioridade</label><select id="filtro-prioridade">' + selectOptions(PRIORIDADES, state.filtros.prioridade, 'Todas') + '</select></div>' +
      '<div class="campo-filtro"><label for="filtro-nivel">Nível</label><select id="filtro-nivel">' + selectOptions(['N1', 'N2', 'N3', '—'], state.filtros.nivel, 'Todos') + '</select></div>' +
      '<button class="btn btn-fantasma btn-pequeno" type="button" data-action="limpar-filtros">Limpar filtros</button>' +
      '</div>' +
      '<div class="status-chips" role="group" aria-label="Filtrar por status">' + chips + '</div>' +
      '<div id="lista-chamados-root"></div>';
    renderListaChamados();
  }

  function renderListaChamados() {
    const root = document.getElementById('lista-chamados-root');
    if (!root) return;
    const filtrados = filtrarChamados();
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / state.porPagina));
    if (state.pagina > totalPaginas) state.pagina = totalPaginas;
    if (state.pagina < 1) state.pagina = 1;
    const inicio = (state.pagina - 1) * state.porPagina;
    const pagina = filtrados.slice(inicio, inicio + state.porPagina);

    if (!filtrados.length) {
      root.innerHTML = '<div class="card vazio"><span class="vazio-icone">' + ICONES.busca + '</span><h3>Nenhum chamado encontrado</h3><p>Ajuste a busca ou limpe os filtros para ver a base completa.</p><button class="btn btn-secundario btn-pequeno" type="button" data-action="limpar-filtros">Limpar filtros</button></div>';
      return;
    }

    const linhas = pagina.map(function (t) {
      return '<tr class="linha-clicavel" data-action="detalhe" data-id="' + esc(t.id) + '" tabindex="0" aria-label="Abrir chamado ' + esc(t.id) + '">' +
        '<td><span class="ticket-id">' + esc(t.id) + '</span><span class="ticket-canal">via ' + esc(t.canal) + '</span></td>' +
        '<td><span class="solicitante">' + esc(t.solicitante) + '<small>' + esc(t.perfil || 'Usuário IPEC') + '</small></span></td>' +
        '<td>' + esc(t.categoria) + '</td>' +
        '<td>' + badgePrioridade(t.prioridade) + '</td>' +
        '<td>' + badgeStatus(t.status) + '</td>' +
        '<td>' + slaCellHTML(t) + '</td>' +
        '<td>' + fmtData(t.abertoEm) + '</td>' +
        '<td>' + esc(t.nivel || '—') + '</td>' +
        '</tr>';
    }).join('');

    root.innerHTML = '<div class="card tabela-card"><div class="tabela-topo"><div><h2>Lista de chamados</h2><p>Mostrando ' + (inicio + 1) + '–' + Math.min(inicio + state.porPagina, filtrados.length) + ' de ' + filtrados.length + ' resultados</p></div><span class="badge badge-neutro badge-sem-ponto">' + filtrados.length + ' resultado(s)</span></div>' +
      '<div class="tabela-scroll"><table class="tabela" aria-label="Lista de chamados"><thead><tr><th>Chamado</th><th>Solicitante</th><th>Categoria</th><th>Prioridade</th><th>Status</th><th>SLA</th><th>Abertura</th><th>Nível</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
      '<div class="paginacao"><span>Mostrando ' + (inicio + 1) + '–' + Math.min(inicio + state.porPagina, filtrados.length) + ' de ' + filtrados.length + '</span>' +
      '<div class="paginacao-botoes"><button type="button" data-action="pagina" data-pagina="' + (state.pagina - 1) + '"' + (state.pagina === 1 ? ' disabled' : '') + '>Anterior</button>' +
      '<span style="align-self:center;padding:0 2px">Página ' + state.pagina + ' de ' + totalPaginas + '</span>' +
      '<button type="button" data-action="pagina" data-pagina="' + (state.pagina + 1) + '"' + (state.pagina === totalPaginas ? ' disabled' : '') + '>Próxima</button></div></div></div>';
  }

  /* ---------------- novo chamado ---------------- */

  function prioridadeOpcao(prioridade, marcada) {
    return '<label class="prioridade-opcao ' + (prioridade === 'Crítica' ? 'tipo-critica' : '') + '">' +
      '<input type="radio" name="prioridade" value="' + esc(prioridade) + '"' + (marcada ? ' checked' : '') + '>' +
      '<span class="prio-nome">' + esc(prioridade) + '</span><span class="prio-sla">SLA ' + SLA[prioridade] + ' h</span></label>';
  }

  function renderNovo() {
    const root = document.getElementById('view-novo');
    root.innerHTML = '<header class="page-head"><div><span class="eyebrow">Abertura</span><h1 id="titulo-novo">Novo chamado</h1><p>Registre a solicitação com categoria, canal e prioridade. O SLA começa a contar na abertura.</p></div><div class="page-actions"><button class="btn btn-secundario" type="button" data-action="nav" data-view="chamados">Ver chamados</button></div></header>' +
      '<div class="form-layout"><div class="card form-card"><h2>Dados da solicitação</h2><p>Campos com <span class="obrig">*</span> são obrigatórios.</p>' +
      '<form id="form-chamado" novalidate>' +
      '<div class="campo"><label for="solicitante">Solicitante <span class="obrig">*</span></label><input id="solicitante" name="solicitante" type="text" autocomplete="name" placeholder="Ex.: Profa. Ana Beatriz — Laboratório 2" maxlength="80" required></div>' +
      '<div class="grid-2"><div class="campo"><label for="categoria">Categoria <span class="obrig">*</span></label><select id="categoria" name="categoria" required>' + selectOptions(CATEGORIAS, 'Rede/Internet') + '</select></div>' +
      '<div class="campo"><label for="canal">Canal de entrada <span class="obrig">*</span></label><select id="canal" name="canal" required>' + selectOptions(CANAIS, 'WhatsApp') + '</select></div></div>' +
      '<fieldset class="campo"><legend>Prioridade <span class="obrig">*</span></legend><div class="prioridade-grid">' +
      PRIORIDADES.map(function (p) { return prioridadeOpcao(p, p === 'Média'); }).join('') +
      '</div></fieldset>' +
      '<div class="sla-preview" id="sla-preview"><span class="ponto"></span><span>SLA de <strong>24 h</strong> para prioridade <strong>Média</strong>.</span></div>' +
      '<div class="campo"><label for="descricao">Descrição <span class="obrig">*</span></label><textarea id="descricao" name="descricao" maxlength="1000" placeholder="Descreva o problema, o local e quantas pessoas estão afetadas." required></textarea><div class="contador"><span id="contador">0</span>/1000</div></div>' +
      '<div id="erro-form" class="erro-form" hidden></div>' +
      '<div class="acoes-form"><button class="btn btn-fantasma" type="button" data-action="nav" data-view="chamados">Cancelar</button><button class="btn btn-primario" type="submit">Abrir chamado</button></div>' +
      '</form></div>' +
      '<aside class="card info-card"><h2>Prazos por prioridade</h2><p>O prazo é definido na abertura e não reinicia em um escalonamento.</p>' +
      '<table class="sla-tabela"><thead><tr><th>Prioridade</th><th>SLA</th></tr></thead><tbody>' +
      PRIORIDADES.map(function (p) { return '<tr><td>' + badgePrioridade(p) + '</td><td>' + SLA[p] + ' h</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<h2>O que acontece depois</h2><p>O fluxo segue o manual ITIL da Parte 3.</p>' +
      '<ol class="passos"><li>Triagem inicial no Nível 1 (TS1/TS2).</li><li>Classificação e priorização conforme impacto.</li><li>Escalonamento para N2 (AI1/AI2) ou N3 (AS), se necessário.</li><li>Alerta ao Coordenador (COO) quando o chamado atinge 75% do SLA.</li><li>Resolução, pesquisa de satisfação e encerramento.</li></ol>' +
      '<p class="nota">Neste protótipo, o relógio da demo está congelado em 10/11/2026 09:00. Use “Simular +3h” no detalhe de um chamado crítico para testar o alerta de 75%.</p>' +
      '</aside></div>';
    atualizarContador();
    atualizarSlaPreview();
  }

  function atualizarSlaPreview() {
    const el = document.getElementById('sla-preview');
    if (!el) return;
    const marcado = document.querySelector('input[name="prioridade"]:checked');
    const prioridade = marcado ? marcado.value : 'Média';
    el.innerHTML = '<span class="ponto"></span><span>SLA de <strong>' + SLA[prioridade] + ' h</strong> para prioridade <strong>' + esc(prioridade) + '</strong>.</span>';
  }

  function atualizarContador() {
    const campo = document.getElementById('descricao');
    const contador = document.getElementById('contador');
    if (campo && contador) contador.textContent = String(campo.value.length);
  }

  function mostrarErroForm(mensagem, campo) {
    const box = document.getElementById('erro-form');
    if (box) { box.hidden = false; box.textContent = mensagem; }
    if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }
  }

  function criarChamado(form) {
    const solicitante = form.elements.solicitante.value.trim();
    const categoria = form.elements.categoria.value;
    const canal = form.elements.canal.value;
    const prioridade = form.elements.prioridade.value;
    const descricao = form.elements.descricao.value.trim();

    if (solicitante.length < 3) return mostrarErroForm('Informe o nome do solicitante (mínimo de 3 caracteres).', form.elements.solicitante);
    if (!CATEGORIAS.includes(categoria)) return mostrarErroForm('Selecione uma categoria válida.', form.elements.categoria);
    if (!CANAIS.includes(canal)) return mostrarErroForm('Selecione um canal válido.', form.elements.canal);
    if (!SLA[prioridade]) return mostrarErroForm('Selecione uma prioridade.', null);
    if (descricao.length < 10) return mostrarErroForm('Descreva o problema com pelo menos 10 caracteres.', form.elements.descricao);

    const quando = agoraDemo().toISOString();
    const slaHoras = SLA[prioridade];
    const id = 'CH-2026-' + state.proximoId;
    const chamado = {
      id: id,
      abertoEm: quando,
      categoria: categoria,
      prioridade: prioridade,
      canal: canal,
      status: 'Aberto',
      slaHoras: slaHoras,
      tempoResolucaoHoras: null,
      dentroSla: null,
      fcr: null,
      reincidencia: null,
      satisfacao: null,
      solicitante: solicitante,
      perfil: 'Usuário IPEC',
      descricao: descricao,
      resolvidoEm: null,
      encerradoEm: null,
      sessao: true,
      nivel: 'N1',
      responsavel: 'Fila N1',
      alerta75: false,
      alerta75Em: null,
      historico: [
        { em: quando, titulo: 'Chamado aberto', texto: 'Registrado via ' + canal + '. SLA de ' + slaHoras + ' h iniciado.', autor: solicitante },
        { em: quando, titulo: 'Triagem', texto: 'Encaminhado para o Nível 1 (TS1/TS2).', autor: 'Sistema' }
      ]
    };

    state.sessao.unshift(chamado);
    state.proximoId += 1;
    state.filtros = { busca: '', categoria: '', prioridade: '', status: '', nivel: '' };
    state.pagina = 1;
    salvarEstado();
    state.view = 'chamados';
    state.notificacoesAbertas = false;
    render();
    abrirDetalhe(id);
    toast('Chamado ' + id + ' aberto com SLA de ' + slaHoras + ' h.', 'sucesso');
  }

  /* ---------------- notificações ---------------- */

  function renderNotificacoes() {
    const root = document.getElementById('notificacoes-root');
    if (!root) return;
    const naoLidas = state.notificacoes.filter(function (n) { return !n.lida; }).length;
    let dropdown = '';
    if (state.notificacoesAbertas) {
      const lista = state.notificacoes.length
        ? state.notificacoes.map(function (n) {
            return '<button class="notif-item ' + (n.lida ? '' : 'nao-lida') + '" type="button" data-action="notificacao" data-id="' + esc(n.chamadoId) + '">' +
              '<span class="notif-ponto" aria-hidden="true"></span><span class="notif-conteudo"><strong>' + esc(n.titulo) + '</strong><p>' + esc(n.mensagem) + '</p><span>' + fmtDataHora(n.em) + '</span></span></button>';
          }).join('')
        : '<div class="notif-vazio">Nenhuma notificação. O alerta de 75% do SLA aparecerá aqui.</div>';
      dropdown = '<div class="notif-dropdown"><div class="notif-cabecalho"><strong>Notificações</strong><button type="button" data-action="marcar-lidas">Marcar todas como lidas</button></div><div class="notif-lista">' + lista + '</div></div>';
    }
    root.innerHTML = '<button class="btn-icone btn-sino" type="button" data-action="notificacoes" aria-label="Notificações' + (naoLidas ? ', ' + naoLidas + ' não lidas' : '') + '" aria-expanded="' + state.notificacoesAbertas + '">' + ICONES.sino + (naoLidas ? '<span class="notif-badge">' + naoLidas + '</span>' : '') + '</button>' + dropdown;
  }

  /* ---------------- detalhe do chamado ---------------- */

  function opcaoEscalonamento(nivel, responsavel) {
    const cargos = { TS1: 'Técnico de Suporte', TS2: 'Técnico de Suporte', AI1: 'Analista de Infraestrutura', AI2: 'Analista de Infraestrutura', AS: 'Analista de Sistemas' };
    return '<label class="opcao-escalonamento"><input type="radio" name="escalonamento" value="' + nivel + '|' + responsavel + '"><span><strong>' + nivel + '</strong> · ' + responsavel + ' — ' + cargos[responsavel] + '</span></label>';
  }

  function painelEscalonamento(t) {
    let opcoes = '';
    if (t.nivel === 'N1') {
      opcoes = opcaoEscalonamento('N2', 'AI1') + opcaoEscalonamento('N2', 'AI2') + opcaoEscalonamento('N3', 'AS');
    } else if (t.nivel === 'N2') {
      opcoes = opcaoEscalonamento('N3', 'AS');
    } else {
      return '<div class="painel-acao"><h4>Escalonamento</h4><p class="nota">O chamado já está no Nível 3 (AS), o último nível interno.</p></div>';
    }
    return '<div class="painel-acao"><h4>Escalonar chamado</h4><div class="opcoes-escalonamento">' + opcoes + '</div>' +
      '<div class="campo"><label for="nota-escalonamento">Motivo (opcional)</label><textarea id="nota-escalonamento" maxlength="240" placeholder="Ex.: precisa de diagnóstico de infraestrutura no link."></textarea></div>' +
      '<div class="acoes-form"><button class="btn btn-fantasma btn-pequeno" type="button" data-action="cancelar-escalonamento">Cancelar</button><button class="btn btn-primario btn-pequeno" type="button" data-action="confirmar-escalonamento">Confirmar escalonamento</button></div></div>';
  }

  function painelResolucao(t) {
    return '<div class="painel-acao"><h4>Registrar resolução</h4><div class="campo"><label for="nota-resolucao">Nota de resolução (opcional)</label><textarea id="nota-resolucao" maxlength="300" placeholder="Ex.: link restabelecido e switch reiniciado."></textarea></div>' +
      '<div class="acoes-form"><button class="btn btn-fantasma btn-pequeno" type="button" data-action="cancelar-resolucao">Cancelar</button><button class="btn btn-primario btn-pequeno" type="button" data-action="confirmar-resolucao">Confirmar resolução</button></div></div>';
  }

  function painelSatisfacao(t) {
    if (t.status !== 'Resolvido' && t.status !== 'Encerrado') return '';
    if (typeof t.satisfacao === 'number') {
      return '<div class="avaliacao"><h4>Pesquisa de satisfação</h4><p>O solicitante avaliou o atendimento.</p><span class="avaliacao-registrada">Nota ' + t.satisfacao + ' / 5 registrada</span></div>';
    }
    if (t.status === 'Encerrado') {
      return '<div class="avaliacao"><h4>Pesquisa de satisfação</h4><p>Chamado encerrado sem avaliação registrada.</p></div>';
    }
    return '<div class="avaliacao"><h4>Pesquisa de satisfação</h4><p>Como o solicitante avalia o atendimento? (opcional)</p><div class="avaliacao-botoes">' +
      [1, 2, 3, 4, 5].map(function (nota) {
        return '<button class="avaliacao-btn" type="button" data-action="satisfacao" data-nota="' + nota + '" aria-label="Nota ' + nota + ' de 5">' + nota + '</button>';
      }).join('') + '</div></div>';
  }

  function acoesDetalhe(t) {
    if (!t.sessao) return '<div class="somente-leitura"><strong>Chamado da base histórica.</strong> Os 420 registros de outubro/2026 são somente leitura. Use “Novo chamado” para simular o fluxo completo.</div>';
    let botoes = '';
    if (t.status === 'Aberto') botoes += '<button class="btn btn-primario" type="button" data-action="iniciar">Iniciar atendimento</button>';
    if (t.status === 'Em Atendimento') botoes += '<button class="btn btn-secundario" type="button" data-action="escalonar">Escalonar</button><button class="btn btn-primario" type="button" data-action="resolver">Resolver</button>';
    if (t.status === 'Escalonado') botoes += '<button class="btn btn-primario" type="button" data-action="assumir">Assumir atendimento</button><button class="btn btn-secundario" type="button" data-action="resolver">Resolver</button>';
    if (t.status === 'Resolvido') botoes += '<button class="btn btn-primario" type="button" data-action="encerrar">Encerrar chamado</button>';
    if (!botoes) return '';
    return '<div class="acoes-detalhe">' + botoes + '</div>';
  }

  function renderDrawer() {
    const root = document.getElementById('drawer-root');
    if (!state.detalheId) {
      root.innerHTML = '';
      document.body.classList.remove('drawer-aberto');
      return;
    }
    const t = buscarChamado(state.detalheId);
    if (!t) {
      state.detalheId = null;
      root.innerHTML = '';
      document.body.classList.remove('drawer-aberto');
      return;
    }

    const s = classificarSla(t);
    const tempo = tempoResolucao(t);
    const decorrido = encerrado(t) ? tempo : horasDecorridas(t);
    const pct = Math.round(Math.min(Math.max(s.ratio * 100, 0), 100));
    const classeBarra = s.tone === 'perigo' ? 'perigo' : s.tone === 'alerta' ? 'alerta' : '';
    const slaPainel = '<div class="sla-painel"><div class="sla-painel-topo"><strong>' + (encerrado(t) ? 'SLA ' + s.label.toLowerCase() : 'SLA em andamento') + '</strong><span>' + fmtHoras(decorrido) + ' de ' + t.slaHoras + ' h</span></div>' +
      '<div class="barra-sla"><span class="' + classeBarra + '" style="width:' + pct + '%"></span></div>' +
      '<div class="sla-painel-rodape">' +
      (encerrado(t)
        ? '<span>Tempo de resolução</span><strong>' + fmtHoras(tempo) + '</strong>'
        : '<span>' + (s.restante >= 0 ? 'Tempo restante' : 'SLA excedido em') + '</span><strong>' + fmtHoras(Math.abs(s.restante)) + '</strong>') +
      '</div></div>';

    const notaDemo = t.sessao && ativo(t)
      ? '<div class="nota-demo"><strong>Controle da demonstração.</strong> O relógio está congelado em 10/11/2026 09:00. Avance 3 h para um chamado crítico de 4 h atingir 75% do SLA e disparar o alerta ao COO.<br><button class="btn btn-pequeno btn-secundario" type="button" data-action="simular-tempo">Simular +3h</button></div>'
      : '';

    const historico = (t.historico || []).map(function (item) {
      return '<li class="historico-item ' + esc(item.tipo || '') + '"><span class="historico-ponto" aria-hidden="true"></span><div class="historico-conteudo"><strong>' + esc(item.titulo) + '</strong><p>' + esc(item.texto) + '</p><span class="historico-data">' + fmtDataHora(item.em) + ' · ' + esc(item.autor || 'Sistema') + '</span></div></li>';
    }).join('');

    const paineis = (state.escalonando ? painelEscalonamento(t) : '') +
      (state.resolvendo ? painelResolucao(t) : '') +
      painelSatisfacao(t) +
      acoesDetalhe(t);

    root.innerHTML = '<div class="drawer-overlay" data-action="fechar-drawer"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-titulo">' +
      '<div class="drawer-cabecalho"><div><span class="drawer-eyebrow">Chamado</span><h2 id="drawer-titulo">' + esc(t.id) + '</h2><div class="drawer-badges">' + badgePrioridade(t.prioridade) + badgeStatus(t.status) + '<span class="badge ' + (t.sessao ? 'badge-info' : 'badge-neutro') + ' badge-sem-ponto">' + (t.sessao ? 'sessão' : 'base') + '</span></div></div>' +
      '<button class="drawer-fechar" id="drawer-fechar" type="button" data-action="fechar-drawer" aria-label="Fechar detalhe">' + ICONES.x + '</button></div>' +
      '<div class="drawer-corpo">' +
      '<div class="detalhe-meta">' +
      '<div class="meta-item"><span>Solicitante</span><strong>' + esc(t.solicitante) + '</strong></div>' +
      '<div class="meta-item"><span>Perfil</span><strong>' + esc(t.perfil || 'Usuário IPEC') + '</strong></div>' +
      '<div class="meta-item"><span>Categoria</span><strong>' + esc(t.categoria) + '</strong></div>' +
      '<div class="meta-item"><span>Canal</span><strong>' + esc(t.canal) + '</strong></div>' +
      '<div class="meta-item"><span>Abertura</span><strong>' + fmtDataHora(t.abertoEm) + '</strong></div>' +
      '<div class="meta-item"><span>Nível / responsável</span><strong>' + esc(t.nivel || '—') + ' · ' + esc(t.responsavel || '—') + '</strong></div>' +
      '</div>' + slaPainel + notaDemo +
      '<div class="secao-detalhe"><h3>Descrição</h3><p class="descricao-chamado">' + esc(t.descricao) + '</p></div>' +
      paineis +
      '<div class="secao-detalhe"><h3>Histórico</h3><ol class="historico">' + (historico || '<li class="historico-item"><div class="historico-conteudo"><strong>Sem histórico registrado</strong></div></li>') + '</ol></div>' +
      '</div></aside>';
    document.body.classList.add('drawer-aberto');
  }

  /* ---------------- ações do detalhe ---------------- */

  function abrirDetalhe(id) {
    const t = buscarChamado(id);
    if (!t) return;
    state.ultimoFoco = document.activeElement;
    state.detalheId = id;
    state.escalonando = false;
    state.resolvendo = false;
    state.notificacoesAbertas = false;
    renderDrawer();
    renderNotificacoes();
    const fechar = document.getElementById('drawer-fechar');
    if (fechar) fechar.focus();
  }

  function fecharDrawer() {
    state.detalheId = null;
    state.escalonando = false;
    state.resolvendo = false;
    renderDrawer();
    if (state.ultimoFoco && document.contains(state.ultimoFoco)) {
      try { state.ultimoFoco.focus(); } catch (erro) { /* elemento antigo */ }
    }
  }

  function adicionarHistorico(t, titulo, texto, autor, tipo) {
    t.historico = Array.isArray(t.historico) ? t.historico : [];
    t.historico.push({
      em: agoraDemo().toISOString(),
      titulo: titulo,
      texto: texto,
      autor: autor || 'Sistema',
      tipo: tipo || ''
    });
  }

  function iniciarAtendimento() {
    const t = buscarChamado(state.detalheId);
    if (!t || !t.sessao) return;
    if (t.status !== 'Aberto' && t.status !== 'Escalonado') return;
    t.status = 'Em Atendimento';
    const responsavel = { N1: 'TS1', N2: 'AI1', N3: 'AS' }[t.nivel] || 'TS1';
    t.responsavel = responsavel;
    adicionarHistorico(t, 'Atendimento iniciado', 'Chamado assumido por ' + responsavel + ' (' + t.nivel + ').', responsavel);
    salvarEstado();
    render();
    toast('Atendimento iniciado por ' + responsavel + '.', 'sucesso');
  }

  function confirmarEscalonamento() {
    const t = buscarChamado(state.detalheId);
    if (!t || !t.sessao) return;
    const marcado = document.querySelector('input[name="escalonamento"]:checked');
    if (!marcado) { toast('Selecione o nível de destino.', 'alerta'); return; }
    const partes = marcado.value.split('|');
    const nivel = partes[0];
    const responsavel = partes[1];
    const nota = (document.getElementById('nota-escalonamento') || {}).value || '';
    t.nivel = nivel;
    t.responsavel = responsavel;
    t.status = 'Escalonado';
    adicionarHistorico(t, 'Escalonado para ' + nivel, responsavel + ' assumirá o atendimento.' + (nota.trim() ? ' Motivo: ' + nota.trim() : '') + ' O SLA original foi mantido.', 'COO', 'alerta');
    state.escalonando = false;
    salvarEstado();
    render();
    toast('Chamado escalonado para ' + nivel + ' (' + responsavel + ').', 'alerta');
  }

  function confirmarResolucao() {
    const t = buscarChamado(state.detalheId);
    if (!t || !t.sessao) return;
    const nota = (document.getElementById('nota-resolucao') || {}).value || '';
    const quando = agoraDemo().toISOString();
    const tempo = horasEntre(t.abertoEm, quando);
    t.status = 'Resolvido';
    t.resolvidoEm = quando;
    t.tempoResolucaoHoras = Number((tempo || 0).toFixed(2));
    t.dentroSla = (tempo || 0) <= t.slaHoras;
    adicionarHistorico(t, 'Chamado resolvido', 'Tempo de resolução: ' + fmtHoras(tempo) + '. SLA ' + (t.dentroSla ? 'cumprido' : 'violado') + '.' + (nota.trim() ? ' Nota: ' + nota.trim() : ''), t.responsavel || 'Equipe de TI', t.dentroSla ? '' : 'perigo');
    state.resolvendo = false;
    salvarEstado();
    render();
    toast('Chamado resolvido. Avalie o atendimento antes de encerrar.', t.dentroSla ? 'sucesso' : 'alerta');
  }

  function avaliar(nota) {
    const t = buscarChamado(state.detalheId);
    if (!t || !t.sessao || (t.status !== 'Resolvido' && t.status !== 'Encerrado')) return;
    t.satisfacao = nota;
    adicionarHistorico(t, 'Pesquisa de satisfação', 'Nota ' + nota + '/5 registrada pelo solicitante.', t.solicitante);
    salvarEstado();
    render();
    toast('Avaliação registrada: ' + nota + '/5.', 'sucesso');
  }

  function encerrarChamado() {
    const t = buscarChamado(state.detalheId);
    if (!t || !t.sessao || t.status !== 'Resolvido') return;
    t.status = 'Encerrado';
    t.encerradoEm = agoraDemo().toISOString();
    adicionarHistorico(t, 'Chamado encerrado', 'Atendimento concluído.', 'COO');
    salvarEstado();
    render();
    toast('Chamado ' + t.id + ' encerrado.', 'sucesso');
  }

  function simularTempo() {
    state.demoOffsetMin += 180;
    salvarEstado();
    const novos = verificarAlertas();
    render();
    if (!novos.length) toast('Relógio da demo avançado em 3 h.', 'info');
  }

  function resetarDemo() {
    if (!window.confirm('Restaurar a demonstração? Os chamados criados e os alertas serão apagados. A base de outubro/2026 permanece.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (erro) { /* armazenamento indisponível */ }
    state.sessao = [];
    state.notificacoes = [];
    state.demoOffsetMin = 0;
    state.proximoId = 1420;
    state.filtros = { busca: '', categoria: '', prioridade: '', status: '', nivel: '' };
    state.pagina = 1;
    state.detalheId = null;
    state.escalonando = false;
    state.resolvendo = false;
    state.notificacoesAbertas = false;
    render();
    toast('Demonstração restaurada. A base de outubro/2026 foi mantida.', 'info');
  }

  function abrirNotificacao(id) {
    state.notificacoes.forEach(function (n) { if (n.chamadoId === id) n.lida = true; });
    salvarEstado();
    state.notificacoesAbertas = false;
    state.view = 'chamados';
    state.filtros = { busca: '', categoria: '', prioridade: '', status: '', nivel: '' };
    state.pagina = 1;
    render();
    if (buscarChamado(id)) abrirDetalhe(id);
  }

  function marcarLidas() {
    state.notificacoes.forEach(function (n) { n.lida = true; });
    salvarEstado();
    renderNotificacoes();
    toast('Notificações marcadas como lidas.', 'info');
  }

  /* ---------------- renderização geral ---------------- */

  function render() {
    const titulos = { dashboard: 'Dashboard', chamados: 'Chamados', novo: 'Novo chamado' };
    document.querySelectorAll('.nav-item').forEach(function (botao) {
      const ativoAgora = botao.dataset.view === state.view;
      botao.classList.toggle('ativo', ativoAgora);
      if (ativoAgora) botao.setAttribute('aria-current', 'page');
      else botao.removeAttribute('aria-current');
    });
    const topbar = document.getElementById('topbar-view');
    if (topbar) topbar.textContent = titulos[state.view] || '';
    ['dashboard', 'chamados', 'novo'].forEach(function (view) {
      const el = document.getElementById('view-' + view);
      if (el) el.hidden = state.view !== view;
    });
    renderRelogio();
    renderNotificacoes();
    if (state.view === 'dashboard') renderDashboard();
    else if (state.view === 'chamados') renderChamados();
    else if (state.view === 'novo') renderNovo();
    renderDrawer();
  }

  /* ---------------- eventos ---------------- */

  document.addEventListener('click', function (evento) {
    const alvo = evento.target.closest('[data-action]');
    if (!alvo) {
      if (state.notificacoesAbertas && !evento.target.closest('.notificacoes')) {
        state.notificacoesAbertas = false;
        renderNotificacoes();
      }
      return;
    }
    const acao = alvo.dataset.action;
    switch (acao) {
      case 'nav':
        state.view = alvo.dataset.view || 'dashboard';
        state.notificacoesAbertas = false;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'novo':
        state.view = 'novo';
        state.notificacoesAbertas = false;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;
      case 'resetar':
        resetarDemo();
        break;
      case 'detalhe':
        abrirDetalhe(alvo.dataset.id);
        break;
      case 'fechar-drawer':
        fecharDrawer();
        break;
      case 'iniciar':
      case 'assumir':
        iniciarAtendimento();
        break;
      case 'escalonar':
        state.escalonando = true;
        state.resolvendo = false;
        renderDrawer();
        break;
      case 'cancelar-escalonamento':
        state.escalonando = false;
        renderDrawer();
        break;
      case 'confirmar-escalonamento':
        confirmarEscalonamento();
        break;
      case 'resolver':
        state.resolvendo = true;
        state.escalonando = false;
        renderDrawer();
        break;
      case 'cancelar-resolucao':
        state.resolvendo = false;
        renderDrawer();
        break;
      case 'confirmar-resolucao':
        confirmarResolucao();
        break;
      case 'satisfacao':
        avaliar(Number(alvo.dataset.nota));
        break;
      case 'encerrar':
        encerrarChamado();
        break;
      case 'simular-tempo':
        simularTempo();
        break;
      case 'notificacoes':
        state.notificacoesAbertas = !state.notificacoesAbertas;
        renderNotificacoes();
        break;
      case 'marcar-lidas':
        marcarLidas();
        break;
      case 'notificacao':
        abrirNotificacao(alvo.dataset.id);
        break;
      case 'pagina':
        state.pagina = Number(alvo.dataset.pagina) || 1;
        renderListaChamados();
        break;
      case 'limpar-filtros':
        state.filtros = { busca: '', categoria: '', prioridade: '', status: '', nivel: '' };
        state.pagina = 1;
        renderChamados();
        break;
      case 'status-chip':
        state.filtros.status = alvo.dataset.status || '';
        state.pagina = 1;
        renderChamados();
        break;
      default:
        break;
    }
  });

  document.addEventListener('change', function (evento) {
    if (evento.target.closest('#filtros-chamados')) {
      const mapa = {
        'busca': 'busca',
        'filtro-categoria': 'categoria',
        'filtro-prioridade': 'prioridade',
        'filtro-nivel': 'nivel'
      };
      const chave = mapa[evento.target.id];
      if (chave) {
        state.filtros[chave] = evento.target.value;
        state.pagina = 1;
        renderListaChamados();
      }
    }
    if (evento.target.name === 'prioridade') atualizarSlaPreview();
    if (evento.target.closest('#form-chamado')) {
      evento.target.removeAttribute('aria-invalid');
      const box = document.getElementById('erro-form');
      if (box) box.hidden = true;
    }
  });

  document.addEventListener('input', function (evento) {
    if (evento.target.id === 'busca') {
      state.filtros.busca = evento.target.value;
      state.pagina = 1;
      renderListaChamados();
    }
    if (evento.target.id === 'descricao') atualizarContador();
    if (evento.target.closest('#form-chamado')) {
      evento.target.removeAttribute('aria-invalid');
      const box = document.getElementById('erro-form');
      if (box) box.hidden = true;
    }
  });

  document.addEventListener('submit', function (evento) {
    if (evento.target.id === 'form-chamado') {
      evento.preventDefault();
      criarChamado(evento.target);
    }
  });

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') {
      if (state.notificacoesAbertas) {
        state.notificacoesAbertas = false;
        renderNotificacoes();
        return;
      }
      if (state.detalheId) {
        fecharDrawer();
        return;
      }
    }
    if ((evento.key === 'Enter' || evento.key === ' ') && evento.target.matches('tr[data-action="detalhe"]')) {
      evento.preventDefault();
      abrirDetalhe(evento.target.dataset.id);
    }
  });

  /* ---------------- inicialização ---------------- */

  function init() {
    if (!BASE.length) {
      const root = document.getElementById('view-dashboard');
      if (root) {
        root.innerHTML = '<div class="card vazio"><span class="vazio-icone">' + ICONES.alerta + '</span><h3>Base de dados não carregada</h3><p>Verifique se o arquivo <strong>assets/dados.js</strong> existe e foi gerado a partir de <strong>chamados_simulados.csv</strong>.</p></div>';
      }
      return;
    }
    carregarEstado();
    verificarAlertas();
    render();
    console.info('IPEC Service Desk: ' + BASE.length + ' chamados na base; ' + state.sessao.length + ' na sessão de demonstração.');
  }

  // Exposto apenas para inspeção acadêmica e testes de fumaça.
  window.IPEC_APP = {
    state: state,
    base: base,
    meta: BASE_META,
    metricasBase: function () { return calcularMetricas(base); },
    agoraDemo: agoraDemo
  };

  init();
})();
