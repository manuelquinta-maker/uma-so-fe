# Uma Só Fé — guia de publicação (versão sem pastas)

Todos os ficheiros estão ao mesmo nível: não há pastas para perder no carregamento.

- Repositório: `manuelquinta-maker/uma-so-fe`
- Projeto Cloudflare: `uma-so-fe`
- Endereço do site: `https://uma-so-fe.manuel-quinta.workers.dev`
- Backoffice: `https://uma-so-fe.manuel-quinta.workers.dev/admin`

## 1. Carregar os ficheiros no GitHub

1. Abrir `github.com/manuelquinta-maker/uma-so-fe` → **Add file** → **Upload files**.
2. Descompactar o `.zip`, abrir a pasta `uma-so-fe-plano`, selecionar **todos os ficheiros** (Ctrl+A / Cmd+A) e arrastar.
3. Esperar até a lista parar de carregar → **Commit changes**.

Os ficheiros com o mesmo nome são substituídos. Os restos antigos (`auth.js`, `index (1).html`, `download`…) podem ficar: o site esconde-os.

## 2. Cloudflare

O Cloudflare publica sozinho depois do *Commit*. Se não o fizer: projeto `uma-so-fe` → **Deployments** → **Retry build**.

O build tem de terminar em **Success**. O site abre no endereço acima.

## 3. Chave de login do backoffice

1. GitHub → foto → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**:
   - Application name: `Backoffice Uma Só Fé`
   - Homepage URL: `https://uma-so-fe.manuel-quinta.workers.dev`
   - Authorization callback URL: `https://uma-so-fe.manuel-quinta.workers.dev/api/callback`
2. **Register application** → copiar o **Client ID** → **Generate a new client secret** → copiar o segredo.
3. Cloudflare → projeto `uma-so-fe` → **Settings** → **Variables and Secrets** → **Add**:
   - `GITHUB_CLIENT_ID` = Client ID (*Text*)
   - `GITHUB_CLIENT_SECRET` = segredo (*Secret*)
4. **Deploy**.

## 4. Entrar

Abrir `/admin` → **Entrar com GitHub**. Cada alteração fica no site em 1–2 minutos.

## Ficheiros

| Ficheiro | Para que serve |
| --- | --- |
| `index.html`, `estilo.css`, `site.js`, imagens | O site |
| `*.json` | Conteúdo editado no backoffice |
| `admin.html`, `config.yml` | Backoffice |
| `worker.js`, `wrangler.jsonc` | Funcionamento no Cloudflare (não mexer) |
| `_headers`, `robots.txt` | Segurança e motores de busca |
