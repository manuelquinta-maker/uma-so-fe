/* Site das Paróquias — lê o conteúdo editado no backoffice (pasta /content) e monta a página. */
(function () {
  'use strict';

  function carregar(nome) {
    return fetch('/' + nome + '.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; });
  }

  // Só aceita ligações seguras: páginas web, email, telefone ou caminhos do próprio site.
  function ligacao(url) {
    if (!url) return null;
    var u = String(url).trim();
    if (/^(https?:|mailto:|tel:)/i.test(u) || u.charAt(0) === '/' || u.charAt(0) === '#') return u;
    return null;
  }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null && texto !== '') e.textContent = texto;
    return e;
  }

  function texto(id, valor) {
    var e = document.getElementById(id);
    if (e) e.textContent = valor || '';
  }

  function dataPT(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /* ---------- Slideshow ---------- */
  function slideshow(dados) {
    var lista = (dados.slides || []).filter(function (s) { return s.titulo || s.imagem; });
    var faixa = document.getElementById('slides');
    var pontos = document.getElementById('pontos');
    var caixa = faixa.parentNode;
    if (!lista.length) { caixa.hidden = true; return; }

    var atual = 0, temporizador = null;
    var segundos = Math.max(3, Number(dados.segundos) || 6);
    var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    lista.forEach(function (s, i) {
      var slide = el('div', 'slide' + (i === 0 ? ' ativo' : ''));
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'destaque');
      slide.setAttribute('aria-label', (i + 1) + ' de ' + lista.length);
      if (s.imagem) {
        var img = el('img', 'slide__imagem');
        img.src = s.imagem; img.alt = s.imagem_descricao || '';
        if (i > 0) img.loading = 'lazy';
        slide.appendChild(img);
      } else {
        slide.appendChild(el('div', 'slide__imagem'));
      }
      if (s.titulo) {
        var t = el('div', 'slide__texto');
        if (s.antetitulo) t.appendChild(el('p', 'slide__kicker', s.antetitulo));
        t.appendChild(el('h2', 'slide__titulo', s.titulo));
        if (s.texto) t.appendChild(el('p', 'slide__desc', s.texto));
        var href = ligacao(s.botao_ligacao);
        if (s.botao_texto && href) {
          var a = el('a', 'botao', s.botao_texto);
          a.href = href;
          t.appendChild(a);
        }
        slide.appendChild(t);
      }
      faixa.appendChild(slide);

      var p = el('button', 'ponto');
      p.type = 'button';
      p.setAttribute('aria-label', 'Ir para o destaque ' + (i + 1) + (s.titulo ? ': ' + s.titulo : ''));
      p.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      p.appendChild(el('span'));
      p.addEventListener('click', function () { ir(i); reiniciar(); });
      pontos.appendChild(p);
    });

    var slides = faixa.children, botoes = pontos.children;
    function ir(n) {
      slides[atual].classList.remove('ativo');
      botoes[atual].setAttribute('aria-current', 'false');
      atual = (n + lista.length) % lista.length;
      slides[atual].classList.add('ativo');
      botoes[atual].setAttribute('aria-current', 'true');
    }
    function parar() { clearInterval(temporizador); temporizador = null; }
    function iniciar() {
      if (reduzido || lista.length < 2 || dados.automatico === false) return;
      parar();
      temporizador = setInterval(function () { ir(atual + 1); }, segundos * 1000);
    }
    function reiniciar() { if (temporizador) iniciar(); }

    caixa.querySelector('.slideshow__seta--ant').addEventListener('click', function () { ir(atual - 1); reiniciar(); });
    caixa.querySelector('.slideshow__seta--seg').addEventListener('click', function () { ir(atual + 1); reiniciar(); });
    caixa.addEventListener('mouseenter', parar);
    caixa.addEventListener('mouseleave', iniciar);
    caixa.addEventListener('focusin', parar);
    caixa.addEventListener('focusout', iniciar);
    if (lista.length < 2) { pontos.hidden = true; caixa.querySelectorAll('.slideshow__seta').forEach(function (b) { b.hidden = true; }); }
    iniciar();
  }

  /* ---------- Avisos ---------- */
  function avisos(dados) {
    var lista = (dados.avisos || []).slice().sort(function (a, b) { return String(b.data || '').localeCompare(String(a.data || '')); });
    var destaque = lista.filter(function (a) { return a.destaque; })[0];
    if (destaque) {
      texto('destaque-texto', destaque.titulo + (destaque.resumo ? ' — ' + destaque.resumo : ''));
      document.getElementById('destaque').hidden = false;
    }
    var caixa = document.getElementById('lista-avisos');
    if (!lista.length) { caixa.appendChild(el('p', 'vazio', 'Sem avisos de momento.')); return; }
    lista.forEach(function (a) {
      var art = el('article', 'aviso');
      if (a.imagem) { var img = el('img', 'aviso__foto'); img.src = a.imagem; img.alt = ''; img.loading = 'lazy'; art.appendChild(img); }
      var c = el('div', 'aviso__corpo');
      if (a.data) c.appendChild(el('span', 'aviso__data', dataPT(a.data)));
      c.appendChild(el('h3', null, a.titulo));
      if (a.resumo) c.appendChild(el('p', null, a.resumo));
      if (a.texto) {
        var d = el('details');
        d.appendChild(el('summary', null, 'Ler mais'));
        d.appendChild(el('p', 'texto-longo', a.texto));
        c.appendChild(d);
      }
      art.appendChild(c);
      caixa.appendChild(art);
    });
  }

  /* ---------- Horário: lê o PDF "para expor" da app Missas ---------- */
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var MESES = { jan: 0, janeiro: 0, fev: 1, fevereiro: 1, mar: 2, 'março': 2, marco: 2, abr: 3, abril: 3, mai: 4, maio: 4, jun: 5, junho: 5,
    jul: 6, julho: 6, ago: 7, agosto: 7, set: 8, setembro: 8, out: 9, outubro: 9, nov: 10, novembro: 10, dez: 11, dezembro: 11 };
  var RE_DIA_SEMANA = /\b(segunda|ter[çc]a|quarta|quinta|sexta)(-feira)?\b|\bs[áa]bado\b|\bdomingo\b/gi;
  var RE_DATA_NUM = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/;
  var RE_DATA_EXT = /\b(\d{1,2})\s*(?:de\s+)?(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?(?:\s*(?:de\s+)?(\d{4}))?/i;
  var RE_HORA = /\b(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:h|horas)?\b/i;
  var RE_MC = /\s*\bm\.\s?c\.?\s*/i;
  var RE_TIPO = /^(7\s*[ºo°]\s*dia|30\s*[ºo°]\s*dia|aniv\.?\s*nasc\.?|aniv\.?)\s*[-–:·]?\s*/i;

  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = erro;
      document.head.appendChild(sc);
    });
  }

  // Extrai o texto do PDF, linha a linha, pela posição vertical de cada pedaço de texto.
  function linhasDoPdf(url) {
    return carregarScript(PDFJS + 'pdf.min.js').then(function () {
      var pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      return pdfjs.getDocument(url).promise;
    }).then(function (doc) {
      var paginas = [];
      for (var i = 1; i <= doc.numPages; i++) paginas.push(doc.getPage(i).then(function (pg) { return pg.getTextContent(); }));
      return Promise.all(paginas);
    }).then(function (conteudos) {
      var linhas = [];
      conteudos.forEach(function (c) {
        var grupos = [];
        c.items.forEach(function (it) {
          if (!it.str || !it.str.trim()) return;
          var y = it.transform[5], x = it.transform[4];
          var g = grupos.find(function (gg) { return Math.abs(gg.y - y) < 3; });
          if (!g) { g = { y: y, partes: [] }; grupos.push(g); }
          g.partes.push({ x: x, w: it.width || 0, t: it.str });
        });
        grupos.sort(function (a, b) { return b.y - a.y; }).forEach(function (g) {
          g.partes.sort(function (a, b) { return a.x - b.x; });
          var txt = '', fim = null;
          g.partes.forEach(function (p) {
            if (fim !== null && p.x - fim > 2 && !/\s$/.test(txt)) txt += ' ';
            txt += p.t; fim = p.x + p.w;
          });
          linhas.push(txt.replace(/\s+/g, ' ').trim());
        });
      });
      return linhas;
    });
  }

  function lerData(linha) {
    var hoje = new Date(), d = null, m;
    if ((m = linha.match(RE_DATA_EXT))) {
      var mes = MESES[m[2].toLowerCase()];
      if (mes === undefined) mes = MESES[m[2].toLowerCase().slice(0, 3)];
      var ano = m[3] ? Number(m[3]) : hoje.getFullYear();
      if (!m[3] && mes < hoje.getMonth() - 6) ano++;
      d = new Date(ano, mes, Number(m[1]));
    } else if ((m = linha.match(RE_DATA_NUM))) {
      var a = m[3] ? Number(m[3]) : hoje.getFullYear(); if (a < 100) a += 2000;
      d = new Date(a, Number(m[2]) - 1, Number(m[1]));
    }
    return d && !isNaN(d) ? { data: d, texto: m[0] } : null;
  }

  function interpretar(linhas) {
    var missas = [], atual = null;
    linhas.forEach(function (l) {
      if (!l) return;
      var temMc = RE_MC.test(l);
      // Títulos do PDF (ex.: "Horário das Missas — 26 de outubro a 8 de novembro") não são missas
      var titulo = /hor[áa]rio|missas\b|p[áa]gina\s+\d/i.test(l) || (l.match(new RegExp(RE_DATA_EXT.source, 'gi')) || []).length > 1;
      var dt = temMc || titulo ? null : lerData(l);
      if (dt) {
        var hora = '', h = l.replace(dt.texto, ' ').match(RE_HORA);
        if (h) hora = h[1] + 'h' + (h[2] || '00');
        var local = l.replace(dt.texto, ' ').replace(RE_DIA_SEMANA, ' ');
        if (h) local = local.replace(h[0], ' ');
        local = local.replace(/[|·•,;–—-]+/g, ' ').replace(/\s+/g, ' ').trim();
        atual = { data: dt.data, local: local, hora: hora, intencoes: [] };
        missas.push(atual);
        return;
      }
      if (!atual) return; // cabeçalhos e títulos antes da primeira missa
      if (/^\(.*\)?$/.test(l)) { var alvo = atual.intencoes[atual.intencoes.length - 1]; if (alvo) alvo.nota = l; else atual.nota = l; return; }
      var partes = l.split(RE_MC);
      var intencao = partes[0].trim(), tipo = '';
      var t = intencao.match(RE_TIPO);
      if (t) { tipo = t[1].replace(/\s+/g, ' ').replace(/\s*[ºo°]\s*/i, 'º ').replace(/ +/g, ' '); intencao = intencao.slice(t[0].length).trim(); }
      if (intencao) atual.intencoes.push({ tipo: tipo, intencao: intencao, mc: (partes[1] || '').trim() });
    });
    return missas;
  }

  var DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var MESES_CURTOS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  function formatarDia(d) { return DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MESES_CURTOS[d.getMonth()]; }

  function desenharMissas(missas, dados) {
    var caixa = document.getElementById('missas');
    var filtro = document.getElementById('filtro-locais');
    caixa.textContent = '';
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var lista = missas.filter(function (m) { return !m.data || m.data >= hoje; })
      .sort(function (a, b) { return (a.data || 0) - (b.data || 0); });
    if (!lista.length) { caixa.appendChild(el('p', 'missa vazio', 'Consulte o horário em PDF.')); return; }
    var mostrarInt = dados.mostrar_intencoes !== false, mostrarMc = dados.mostrar_mc === true;

    lista.forEach(function (m, i) {
      var item = el('div', 'missa-item');
      item.setAttribute('data-local', m.local || '');
      var linha = el(m.intencoes && m.intencoes.length && mostrarInt ? 'button' : 'div', 'missa');
      linha.appendChild(el('strong', null, m.data ? formatarDia(m.data) : m.dia));
      linha.appendChild(el('span', null, m.local));
      linha.appendChild(el('span', 'missa__hora', m.hora));
      item.appendChild(linha);
      if (linha.tagName === 'BUTTON') {
        linha.type = 'button';
        linha.setAttribute('aria-expanded', 'false');
        var id = 'int-' + i; linha.setAttribute('aria-controls', id);
        var seta = el('span', 'missa__seta'); seta.setAttribute('aria-hidden', 'true'); linha.appendChild(seta);
        var ul = el('ul', 'intencoes'); ul.id = id; ul.hidden = true;
        m.intencoes.forEach(function (x) {
          var li = el('li');
          if (x.tipo) li.appendChild(el('span', 'tipo', x.tipo));
          li.appendChild(document.createTextNode(x.intencao));
          if (mostrarMc && x.mc) li.appendChild(el('span', 'mc', ' m.c. ' + x.mc));
          if (x.nota) li.appendChild(el('span', 'nota', ' ' + x.nota));
          ul.appendChild(li);
        });
        if (m.nota) ul.appendChild(el('li', 'nota', m.nota));
        item.appendChild(ul);
        linha.addEventListener('click', function () {
          var aberto = linha.getAttribute('aria-expanded') === 'true';
          linha.setAttribute('aria-expanded', aberto ? 'false' : 'true');
          ul.hidden = aberto;
        });
      }
      caixa.appendChild(item);
    });

    // Filtro por lugar de culto, quando o PDF tem vários
    var locais = [];
    lista.forEach(function (m) { if (m.local && locais.indexOf(m.local) < 0) locais.push(m.local); });
    filtro.textContent = '';
    if (locais.length < 2) { filtro.hidden = true; return; }
    function escolher(local, botao) {
      filtro.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b === botao ? 'true' : 'false'); });
      caixa.querySelectorAll('.missa-item').forEach(function (it) { it.hidden = !!local && it.getAttribute('data-local') !== local; });
    }
    ['Todos'].concat(locais).forEach(function (nome, k) {
      var b = el('button', 'chip', nome); b.type = 'button';
      b.setAttribute('aria-pressed', k === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { escolher(k === 0 ? '' : nome, b); });
      filtro.appendChild(b);
    });
    filtro.hidden = false;
  }

  function horario(dados) {
    if (dados.nota) texto('horario-nota', dados.nota);
    var pdf = ligacao(dados.pdf);
    if (pdf) { var a = document.getElementById('horario-pdf'); a.href = pdf; a.hidden = false; }
    var manuais = (dados.missas || []).map(function (m) { return { dia: m.dia, local: m.local, hora: m.hora, intencoes: [] }; });
    if (pdf && dados.ler_pdf !== false) {
      linhasDoPdf(pdf).then(interpretar).then(function (missas) {
        desenharMissas(missas.length ? missas : manuais, dados);
      }).catch(function () { desenharMissas(manuais, dados); });
    } else {
      desenharMissas(manuais, dados);
    }
  }

  /* ---------- Paróquias ---------- */
  function paroquias(dados) {
    var caixa = document.getElementById('lista-paroquias');
    (dados.paroquias || []).forEach(function (p) {
      var art = el('article', 'paroquia');
      if (p.foto) { var img = el('img', 'paroquia__foto'); img.src = p.foto; img.alt = 'Igreja de ' + p.nome; img.loading = 'lazy'; art.appendChild(img); }
      else art.appendChild(el('div', 'paroquia__foto'));
      var c = el('div', 'paroquia__corpo');
      c.appendChild(el('h3', 'paroquia__nome', p.nome));
      c.appendChild(el('span', 'paroquia__sub', [p.padroeiro, p.festa ? 'festa: ' + p.festa : ''].filter(Boolean).join(' · ')));
      if (p.lugares || p.historia) {
        var d = el('details');
        d.appendChild(el('summary', null, 'Saber mais'));
        if (p.lugares) d.appendChild(el('p', null, 'Lugares de culto: ' + p.lugares));
        if (p.historia) d.appendChild(el('p', 'texto-longo', p.historia));
        c.appendChild(d);
      }
      art.appendChild(c);
      caixa.appendChild(art);
    });
  }

  /* ---------- Catequese e contactos ---------- */
  function catequese(dados) {
    texto('catequese-texto', dados.texto);
    texto('catequese-horarios', dados.horarios);
    var b = document.getElementById('catequese-botao');
    var href = ligacao(dados.ligacao_inscricao);

    // Data de hoje em Portugal, no formato AAAA-MM-DD, para comparar com as datas do backoffice.
    var hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });
    var aberta = dados.inscricoes_abertas === true
      && (!dados.abertura || String(dados.abertura).slice(0, 10) <= hoje)
      && (!dados.fecho || String(dados.fecho).slice(0, 10) >= hoje);

    if (aberta && href) {
      b.href = href;
      if (/^https?:/i.test(href)) { b.target = '_blank'; b.rel = 'noopener'; }
      if (dados.texto_botao) b.textContent = dados.texto_botao;
      if (dados.fecho) {
        var aviso = el('p', 'pequeno', 'Inscrições até ' + dataPT(String(dados.fecho).slice(0, 10)) + '.');
        b.parentNode.insertBefore(aviso, b);
      }
    } else {
      b.hidden = true;
      if (dados.mensagem_fechadas) {
        b.parentNode.insertBefore(el('p', 'pequeno', dados.mensagem_fechadas), b);
      }
    }
  }

  function contactos(dados) {
    texto('c-paroco', dados.paroco);
    texto('c-cartorio', dados.cartorio);
    texto('c-morada', dados.morada);
    var tel = document.getElementById('c-telefone');
    if (dados.telefone) { tel.textContent = dados.telefone; tel.href = 'tel:' + String(dados.telefone).replace(/[^\d+]/g, ''); } else tel.hidden = true;
    var mail = document.getElementById('c-email');
    if (dados.email) { mail.textContent = dados.email; mail.href = 'mailto:' + dados.email; } else mail.hidden = true;
    var mapa = ligacao(dados.mapa);
    if (mapa) { var m = document.getElementById('c-mapa'); m.href = mapa; m.hidden = false; m.target = '_blank'; m.rel = 'noopener'; }
    var imp = document.getElementById('impresso');
    var impHref = ligacao(dados.impresso_missa);
    if (impHref) imp.href = impHref; else imp.hidden = true;
  }

  /* ---------- Donativos ---------- */
  function copiar(valor, botao) {
    function feito() {
      var original = botao.textContent;
      botao.textContent = 'Copiado ✓';
      setTimeout(function () { botao.textContent = original; }, 2000);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(valor).then(feito, function () { window.prompt('Copie o IBAN:', valor); });
    } else {
      window.prompt('Copie o IBAN:', valor);
    }
  }

  function donativos(dados) {
    var secao = document.getElementById('donativos');
    var contas = dados.contas || [];
    if (!contas.length) { secao.hidden = true; return; }
    texto('donativos-texto', dados.texto);
    texto('donativos-descritivo', dados.descritivo);
    texto('donativos-recibo', dados.recibo);
    var caixa = document.getElementById('lista-contas');
    contas.forEach(function (c) {
      var art = el('article', 'conta');
      art.appendChild(el('h3', 'conta__nome', c.paroquia));
      if (c.titular) art.appendChild(el('span', 'conta__titular', c.titular));
      var iban = String(c.iban || '').replace(/\s+/g, '').toUpperCase();
      if (iban) {
        art.appendChild(el('span', 'conta__rotulo', 'IBAN'));
        art.appendChild(el('code', 'conta__iban', iban.replace(/(.{4})/g, '$1 ').trim()));
        var b = el('button', 'botao botao--pequeno', 'Copiar IBAN');
        b.type = 'button';
        b.setAttribute('aria-label', 'Copiar IBAN da paróquia de ' + c.paroquia);
        b.addEventListener('click', function () { copiar(iban, b); });
        art.appendChild(b);
      } else {
        art.appendChild(el('span', 'conta__vazio', 'IBAN a indicar brevemente.'));
      }
      if (c.mbway) art.appendChild(el('span', 'conta__mbway', 'MB WAY: ' + c.mbway));
      caixa.appendChild(art);
    });
  }

  /* ---------- Liturgia do dia (liturgia.pt) ---------- */
  function liturgia(extras) {
    if (extras.liturgia === false) return;
    var secao = document.getElementById('liturgia');
    var hoje = new Date();
    texto('liturgia-data', hoje.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' }));
    texto('liturgia-celebracao', 'Leituras e orações do dia no site do Secretariado Nacional de Liturgia.');
    secao.hidden = false;
    fetch('/api/liturgia', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        if (d.titulo) texto('liturgia-celebracao', d.titulo);
        var href = ligacao(d.ligacao);
        if (href && /^https:\/\/(www\.)?liturgia\.pt\//i.test(href)) document.getElementById('liturgia-ligacao').href = href;
      })
      .catch(function () {});
  }

  /* ---------- Publicações do Papa (X) — só carrega depois do clique ---------- */
  function papa(extras) {
    if (extras.papa === false) return;
    var conta = String(extras.papa_conta || 'Pontifex_pt').replace(/[^A-Za-z0-9_]/g, '');
    var secao = document.getElementById('papa');
    var perfil = 'https://x.com/' + conta;
    document.getElementById('papa-ligacao').href = perfil;
    document.getElementById('papa-ligacao').textContent = 'Abrir @' + conta + ' no X';
    secao.hidden = false;
    document.getElementById('papa-mostrar').addEventListener('click', function () {
      var caixa = document.getElementById('papa-conteudo');
      caixa.textContent = '';
      var a = el('a', 'twitter-timeline', 'Publicações de @' + conta);
      a.href = perfil;
      a.setAttribute('data-lang', 'pt');
      a.setAttribute('data-height', '520');
      a.setAttribute('data-chrome', 'noheader nofooter transparent');
      a.setAttribute('data-dnt', 'true');
      caixa.appendChild(a);
      var s = document.createElement('script');
      s.src = 'https://platform.twitter.com/widgets.js';
      s.async = true;
      caixa.appendChild(s);
    });
  }

  /* ---------- Notícias da Igreja (feeds da Ecclesia, Braga…) ---------- */
  function noticias(cfg) {
    if (cfg.mostrar === false || !(cfg.fontes || []).length) return;
    var secao = document.getElementById('noticias');
    var lista = document.getElementById('lista-noticias');
    texto('noticias-fontes', cfg.fontes.map(function (f) { return f.nome; }).join(' e '));
    secao.hidden = false;
    var cores = {};
    cfg.fontes.forEach(function (f, i) { cores[f.nome] = 'fonte--' + (i % 3); });
    fetch('/api/noticias', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        var itens = d.noticias || [];
        lista.textContent = '';
        lista.removeAttribute('aria-busy');
        if (!itens.length) { secao.hidden = true; return; }
        itens.forEach(function (n) {
          var href = ligacao(n.ligacao);
          if (!href || !/^https?:/i.test(href)) return;
          var li = el('li', 'noticia');
          var topo = el('div', 'noticia__topo');
          topo.appendChild(el('span', 'fonte ' + (cores[n.fonte] || 'fonte--0'), n.fonte));
          if (n.data) topo.appendChild(el('time', 'noticia__data', new Date(n.data).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })));
          li.appendChild(topo);
          var a = el('a', 'noticia__titulo', n.titulo);
          a.href = href; a.target = '_blank'; a.rel = 'noopener';
          li.appendChild(a);
          lista.appendChild(li);
        });
      })
      .catch(function () { secao.hidden = true; });
  }

  /* ---------- Menu no telemóvel ---------- */
  var botaoMenu = document.querySelector('.menu-botao');
  var menu = document.getElementById('menu');
  botaoMenu.addEventListener('click', function () {
    var aberto = menu.classList.toggle('aberto');
    botaoMenu.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  });
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') { menu.classList.remove('aberto'); botaoMenu.setAttribute('aria-expanded', 'false'); }
  });

  Promise.all(['slides', 'avisos', 'horario', 'paroquias', 'catequese', 'contactos', 'donativos', 'extras', 'noticias'].map(carregar))
    .then(function (r) {
      slideshow(r[0]); avisos(r[1]); horario(r[2]); paroquias(r[3]); catequese(r[4]); contactos(r[5]); donativos(r[6]);
      liturgia(r[7]); papa(r[7]); noticias(r[8]);
    });
})();
