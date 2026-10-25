// Site Uma Só Fé — Cloudflare Worker (ficheiro único, sem pastas).
// Encaminha /api/* para as funções abaixo, esconde os ficheiros internos
// e serve o resto do site a partir desta mesma pasta.

// ===== auth =====
const auth = (() => {
  // Início do login do backoffice: envia o utilizador para o GitHub.
  // Requer as variáveis GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET no projeto Cloudflare Pages.
  async function onRequestGet({ request, env }) {
    if (!env.GITHUB_CLIENT_ID) {
      return new Response('Falta configurar GITHUB_CLIENT_ID no Cloudflare (ver GUIA.md, passo 6).', { status: 500 });
    }
    const url = new URL(request.url);
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${url.origin}/api/callback`,
      scope: 'repo,user',
      state,
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://github.com/login/oauth/authorize?${params}`,
        'Set-Cookie': `decap_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return { onRequestGet };
})();

// ===== callback =====
const callback = (() => {
  // Regresso do GitHub: troca o código pelo token e entrega-o ao backoffice (Decap CMS).
  async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookie = request.headers.get('Cookie') || '';
    const saved = (cookie.match(/(?:^|;\s*)decap_state=([^;]+)/) || [])[1];

    let status = 'error';
    let content = { message: 'Pedido inválido ou expirado. Tente entrar novamente.' };

    if (code && state && saved && state === saved) {
      try {
        const resp = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'paroquias-backoffice' },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/api/callback`,
          }),
        });
        const result = await resp.json();
        if (result.access_token) {
          status = 'success';
          content = { token: result.access_token, provider: 'github' };
        } else {
          content = { message: result.error_description || result.error || 'Não foi possível entrar.' };
        }
      } catch (e) {
        content = { message: 'Erro de ligação ao GitHub.' };
      }
    }

    const message = `authorization:github:${status}:${JSON.stringify(content)}`;
    const origin = url.origin;
    const html = `<!doctype html><html lang="pt-PT"><meta charset="utf-8"><title>A entrar…</title>
  <body><p>A concluir a entrada no backoffice…</p>
  <script>
  (function () {
    var msg = ${JSON.stringify(message).replace(/</g, '\\u003c')};
    var origin = ${JSON.stringify(origin)};
    function receber(e) {
      if (e.origin !== origin) return;
      window.opener.postMessage(msg, origin);
      window.removeEventListener('message', receber, false);
      setTimeout(function () { window.close(); }, 300);
    }
    window.addEventListener('message', receber, false);
    if (window.opener) window.opener.postMessage('authorizing:github', origin);
  })();
  </script></body></html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': 'decap_state=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
      },
    });
  }
  return { onRequestGet };
})();

// ===== liturgia =====
const liturgia = (() => {
  // Celebração litúrgica do dia, a partir do feed público "Agenda Litúrgica" do liturgia.pt.
  // Mostra apenas o título da celebração e a ligação; os textos das leituras ficam no liturgia.pt.
  const FEED = 'https://www.liturgia.pt/rss/agenda.php';
  const SITE = 'https://www.liturgia.pt/';

  function limpar(s) {
    return String(s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\s+/g, ' ').trim();
  }

  function campo(item, nome) {
    const m = item.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i'));
    return m ? limpar(m[1]) : '';
  }

  function hojeLisboa() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }); // AAAA-MM-DD
  }

  async function onRequestGet({ request }) {
    const hoje = hojeLisboa();
    const cache = caches.default;
    const chave = new Request(new URL(`/api/liturgia?d=${hoje}`, request.url).toString());
    const guardado = await cache.match(chave);
    if (guardado) return guardado;

    let dados = { data: hoje, titulo: '', ligacao: SITE };
    try {
      const r = await fetch(FEED, { headers: { 'User-Agent': 'site-paroquias (agenda liturgica)' }, cf: { cacheTtl: 3600 } });
      const xml = await r.text();
      const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
      const lista = itens.map((i) => {
        const pub = campo(i, 'pubDate');
        const d = pub ? new Date(pub) : null;
        return {
          titulo: campo(i, 'title'),
          ligacao: campo(i, 'link'),
          data: d && !isNaN(d) ? d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }) : '',
        };
      }).filter((i) => i.titulo);
      const escolhido = lista.find((i) => i.data === hoje) || lista[0];
      if (escolhido) {
        dados.titulo = escolhido.titulo.slice(0, 160);
        if (/^https?:\/\/(www\.)?liturgia\.pt\//i.test(escolhido.ligacao)) dados.ligacao = escolhido.ligacao;
      }
    } catch (e) {
      // Sem ligação ao liturgia.pt: o site mostra apenas o botão para lá.
    }

    const resposta = new Response(JSON.stringify(dados), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
    if (dados.titulo) await cache.put(chave, resposta.clone());
    return resposta;
  }
  return { onRequestGet };
})();

// ===== noticias =====
const noticias = (() => {
  // Notícias da Igreja: junta os feeds RSS/Atom indicados no backoffice (content/noticias.json).
  // Devolve apenas título, data, fonte e ligação — o texto fica no site original.

  function limpar(s) {
    return String(s || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/\s+/g, ' ').trim();
  }

  function campo(bloco, nome) {
    const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'));
    return m ? limpar(m[1]) : '';
  }

  function ligacaoAtom(bloco) {
    const alt = bloco.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
      || bloco.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i)
      || bloco.match(/<link[^>]*href=["']([^"']+)["']/i);
    return alt ? limpar(alt[1]) : '';
  }

  function lerFeed(xml, fonte) {
    const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    return itens.map((b) => {
      const atom = /^<entry/i.test(b);
      const data = campo(b, 'pubDate') || campo(b, 'published') || campo(b, 'updated') || campo(b, 'dc:date');
      const d = data ? new Date(data) : null;
      return {
        titulo: campo(b, 'title').slice(0, 200),
        ligacao: atom ? ligacaoAtom(b) : (campo(b, 'link') || campo(b, 'guid')),
        data: d && !isNaN(d) ? d.toISOString() : '',
        fonte,
      };
    }).filter((i) => i.titulo && /^https?:\/\//i.test(i.ligacao));
  }

  async function onRequestGet({ request, env }) {
    const cache = caches.default;
    const chave = new Request(new URL('/api/noticias', request.url).toString());
    const guardado = await cache.match(chave);
    if (guardado) return guardado;

    let config = {};
    try {
      // Lê a configuração por dentro (um Worker não pode pedir ficheiros a si próprio pela internet)
      const pedido = new Request(new URL('/noticias.json', request.url).toString());
      const r = env && env.ASSETS ? await env.ASSETS.fetch(pedido) : await fetch(pedido);
      if (r.ok) config = await r.json();
    } catch (e) { /* sem configuração: lista vazia */ }

    const fontes = (config.fontes || []).filter((f) => f && f.nome && /^https?:\/\//i.test(f.feed || '')).slice(0, 6);
    const quantidade = Math.min(20, Math.max(3, Number(config.quantidade) || 6));

    const resultados = await Promise.all(fontes.map(async (f) => {
      try {
        const r = await fetch(f.feed, {
          headers: { 'User-Agent': 'site-paroquias (leitor de noticias)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
          cf: { cacheTtl: 1800 },
        });
        if (!r.ok) return { nome: f.nome, itens: [], ok: false };
        return { nome: f.nome, itens: lerFeed(await r.text(), f.nome), ok: true };
      } catch (e) {
        return { nome: f.nome, itens: [], ok: false };
      }
    }));

    // Remove repetidos (a mesma notícia em duas fontes) e ordena da mais recente para a mais antiga.
    const vistos = new Set();
    const todas = resultados.flatMap((r) => r.itens).filter((i) => {
      const k = i.ligacao.replace(/[?#].*$/, '');
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    }).sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const corpo = {
      atualizado: new Date().toISOString(),
      fontes: resultados.map((r) => ({ nome: r.nome, ok: r.ok, itens: r.itens.length })),
      noticias: todas.slice(0, quantidade),
    };

    const resposta = new Response(JSON.stringify(corpo), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
    });
    if (corpo.noticias.length) await cache.put(chave, resposta.clone());
    return resposta;
  }
  return { onRequestGet };
})();

const ROTAS = {
  '/api/auth': auth,
  '/api/callback': callback,
  '/api/liturgia': liturgia,
  '/api/noticias': noticias,
};

// Ficheiros do repositório que não devem ser publicados
const PRIVADOS = /^\/(worker\.js|wrangler\.jsonc?|GUIA\.md|README\.md|LEIA-ME\.txt|auth\.js|callback\.js|liturgia\.js|noticias\.js|download.*|index%20\(\d+\)\.html|index \(\d+\)\.html|\..*|functions\/.*)$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const caminho = url.pathname.replace(/\/$/, '') || '/';
    const rota = ROTAS[caminho];
    if (rota) {
      if (request.method !== 'GET') return new Response('Método não permitido', { status: 405 });
      return rota.onRequestGet({ request, env, ctx });
    }
    if (PRIVADOS.test(url.pathname)) return new Response('Não encontrado', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
