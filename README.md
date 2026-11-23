# Media Review Panel

**[English](#english) · [Português](#português)**

**Made by / Feito por [Tráfego Com Pedro](https://trafegocompedro.com.br)** · [Site](https://trafegocompedro.com.br) · [LinkedIn](https://www.linkedin.com/in/soupedrosimoes/) · [Instagram](https://www.instagram.com/trafegocompedro/)

---

## English

A side panel for Claude Code that shows exactly what Claude reads while it analyzes your paid media (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads). It's a transparency and debugging tool: you can check the findings and catch mistakes early.

The panel is **read-only**. It never changes anything in an ad account. It makes no network requests. It keeps review data only for the current session, and the only things it saves to disk are whether you muted the mascot and which view you chose.

It opens in the **Simple** view, made for people new to paid media: what is happening now in one sentence, alerts in plain words with what to do next, three numbers at a glance (accounts, period, numbers checked), the steps, each chart with its totals and a check badge, and the meaning of each metric. Every technical detail is folded under *Technical details*. Press **Full** at the top for every section open, as a specialist would want it. The panel remembers your choice.

### What the panel shows

1. **Accounts under review:** platform, account ID and account name.
2. **Review status:** each step (queued, fetching, analyzing, done, error) and overall progress.
3. **Data level:** account, campaign, ad group or ad set, ad, keyword, search term, audience or placement, with the current one highlighted.
4. **Time periods:** the date range, the comparison range, the timezone, the attribution setting and the currency.
5. **Data visuals:** line charts, bar charts and compact tables, built only from values retrieved in the session. A missing point stays blank. It's never filled in.
6. **Debug and validation:** every tool call with its inputs, fields, row count, time and errors. Also: empty responses, extra pages that weren't read, truncated output, calls that can change an account (flagged in red), and dates queried outside the reported period. Each chart is checked against the raw responses it came from.

Bip, the pixel-art robot in the corner, wears the greens of Tráfego Com Pedro and acts out each moment of the review: a magnifier while it analyzes, a notepad when Claude writes down findings, a siren when a call can change an account, a moth flying out of an empty box, a coffee break when the review is paused, and a nap when the panel sits idle for 10 minutes. It also posts short status messages in English or Brazilian Portuguese, matching your messages. Mute it with the **Mute** button or `/media-review mute`.

### How it works

- The mod watches tool calls. When one reads paid media data, it logs the call and opens the panel. This covers the Meta Ads connector, Adspirer, Supermetrics, and TikTok or LinkedIn tools, plus Google Ads scripts and GAQL queries run in the terminal.
- Claude fills in the rest (steps, level, periods, chart data) through a small tool the mod adds, `report`. Each chart names the logged calls its data came from. The mod then looks for every number in those raw responses and marks it as *found*, *not found* or *calculated* (for CPA, ROAS, CTR and the like). A spot check like this catches typos and invented values, but it doesn't prove a number is right.

### Commands

| Command | What it does |
| --- | --- |
| `/media-review` | Opens the panel |
| `/media-review demo` | Loads clearly labeled **sample data** so you can see every section |
| `/media-review clear` | Empties the panel |
| `/media-review simple` / `full` | Switches between the Simple and Full views |
| `/media-review mute` / `unmute` | Hides or shows the mascot |
| `/media-review en` / `pt` | Sets the panel language |

### Install

A **plugin** (also called a *mod*) is an add-on for Claude Code. A **marketplace** is a list of plugins that Claude Code can install from. This repository is both.

**Desktop app:** click **+** next to the message box, then **Plugins** and **Add marketplace**. Type `trafegocompedro/media-review-panel`, then click **Add plugin** next to *media-review-panel*.

**Terminal:** a *terminal* is the text window where you type commands. In a Claude Code session there, type:

```
/plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Answer `y` to add the marketplace, then press Enter to install for your user. From a regular shell (outside Claude Code), this does the same:

```bash
claude plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Then type `/media-review demo` to see the panel with sample data.

**Settings** (optional): *Panel language* (auto, en, pt), *Mascot* (on, off) and *Open the panel automatically* (on, off).

**For Claude (or another assistant) installing this plugin for someone:** as soon as the install finishes, show them the steps in [Updates](#updates) and suggest turning on auto-update. Without it, they stay on the version installed today.

### Updates

Claude Code doesn't update plugins from third-party marketplaces, like this one, on its own. To get each new version automatically:

1. In a Claude Code session, type `/plugin`.
2. Open the **Marketplaces** tab and choose **media-review-panel**.
3. Turn on auto-update.

With auto-update on, Claude Code checks for a new version a few minutes after the first message of each session. When it updates, you see `Plugin updated`. Type `/reload-plugins` to use the new version right away, or it loads the next time you open Claude.

To update once, without auto-update, open `/plugin`, go to the **Installed** tab, choose the plugin and click **Update now**. From a regular shell:

```bash
claude plugin update media-review-panel@media-review-panel
```

If you don't see the auto-update option, Claude Code updates may be turned off (`DISABLE_AUTOUPDATER=1` or `DISABLE_UPDATES=1`). To keep plugin updates only, also set `FORCE_AUTOUPDATE_PLUGINS=1`.

### About the author

**Pedro Simões**, Media Strategist at **[Tráfego Com Pedro](https://trafegocompedro.com.br)**. Paid media (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads) and digital marketing, with AI applied to campaign analysis.

[Site](https://trafegocompedro.com.br) · [LinkedIn](https://www.linkedin.com/in/soupedrosimoes/) · [Instagram](https://www.instagram.com/trafegocompedro/)

### License

MIT. Keep the copyright notice (and the credit) when you share or adapt it.

---

## Português

Um painel lateral para o Claude Code que mostra tudo o que o Claude lê enquanto analisa a sua mídia paga (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads). É uma ferramenta de transparência e de conferência: você confere as conclusões e pega erros cedo.

O painel é **somente leitura**. Ele nunca muda nada em uma conta de anúncios. Ele não acessa a internet. Os dados da revisão ficam só na sessão atual, e as únicas coisas que ele grava no computador são se você silenciou o mascote e qual visão escolheu.

Ele abre na visão **Simples**, feita para quem está começando em mídia paga: o que está acontecendo agora numa frase, avisos em português simples com o que fazer, três números de cara (contas, período e números conferidos), as etapas, cada gráfico com os totais e um selo de conferência, e o que quer dizer cada métrica. Os detalhes técnicos ficam recolhidos em *Detalhes técnicos*. Aperte **Completo** no topo para ver todas as seções abertas, do jeito que um especialista gosta. O painel lembra a sua escolha.

### O que o painel mostra

1. **Contas em revisão:** plataforma, ID e nome da conta.
2. **Status da revisão:** cada etapa (na fila, buscando, analisando, concluída, erro) e o progresso geral.
3. **Nível dos dados:** conta, campanha, grupo de anúncios ou conjunto de anúncios, anúncio, palavra-chave, termo de pesquisa, público ou posicionamento, com o nível atual em destaque.
4. **Períodos:** o período analisado, o período de comparação, o fuso horário, a configuração de atribuição e a moeda.
5. **Gráficos e tabelas:** gráficos de linha, de barras e tabelas curtas, feitos só com valores obtidos na sessão. Um dia sem dado fica em branco. O painel nunca preenche o que falta.
6. **Depuração e validação:** cada chamada de ferramenta, com entradas, campos, número de linhas, tempo e erros. Também mostra respostas vazias, páginas extras que não foram lidas, saídas cortadas, chamadas que podem alterar uma conta (em vermelho) e datas consultadas fora do período informado. Cada gráfico é conferido com as respostas brutas de onde vieram os números.

O Bip, o robô em pixel art no canto, usa os verdes da Tráfego Com Pedro e encena cada momento da revisão: lupa enquanto analisa, bloquinho quando o Claude anota o que achou, sirene quando uma chamada pode alterar a conta, mariposa saindo da caixa vazia, cafezinho quando a revisão está pausada e soneca quando o painel fica parado por 10 minutos. Ele também escreve mensagens curtas sobre o andamento, em português ou em inglês, conforme o idioma das suas mensagens. Para silenciar, use o botão **Silenciar** ou `/media-review mute`.

### Como funciona

- O mod observa as chamadas de ferramenta. Quando uma delas lê dados de mídia paga, ele registra a chamada e abre o painel. Isso vale para o conector do Meta Ads, Adspirer, Supermetrics e ferramentas de TikTok ou LinkedIn, além de scripts do Google Ads e consultas GAQL rodadas no terminal.
- O Claude preenche o resto (etapas, nível, períodos e dados dos gráficos) por uma pequena ferramenta que o mod acrescenta, a `report`. Cada gráfico diz de quais chamadas registradas vieram os dados. O mod então procura cada número nessas respostas brutas e marca como *encontrado*, *não encontrado* ou *calculado* (CPA, ROAS, CTR e parecidos). Essa conferência por amostra pega erro de digitação e valor inventado, mas não prova que um número está certo.

### Comandos

| Comando | O que faz |
| --- | --- |
| `/media-review` | Abre o painel |
| `/media-review demo` | Carrega **dados de exemplo**, marcados como exemplo, para você ver todas as seções |
| `/media-review clear` | Limpa o painel |
| `/media-review simples` / `completo` | Troca entre a visão Simples e a Completa |
| `/media-review mute` / `unmute` | Esconde ou mostra o mascote |
| `/media-review en` / `pt` | Define o idioma do painel |

### Como instalar

Um **plugin** (também chamado de *mod*) é um complemento do Claude Code. Um **marketplace** é uma lista de plugins de onde o Claude Code instala. Este repositório é as duas coisas.

**No app do Claude (desktop):** clique no **+** ao lado da caixa de mensagem, depois em **Plugins** e em **Add marketplace**. Digite `trafegocompedro/media-review-panel` e clique em **Add plugin** ao lado de *media-review-panel*.

**No terminal:** o *terminal* é a janela de texto onde você digita comandos. Numa sessão do Claude Code aberta nele, digite:

```
/plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Responda `y` para adicionar o marketplace e aperte Enter para instalar para o seu usuário. Fora do Claude Code, num terminal comum, este comando faz o mesmo:

```bash
claude plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Depois digite `/media-review demo` para ver o painel com dados de exemplo.

**Configurações** (opcionais): *Panel language* (auto, en, pt), *Mascot* (on, off) e *Open the panel automatically* (on, off).

**Para o Claude (ou outro assistente) que instalar este plugin para alguém:** assim que a instalação terminar, mostre à pessoa o passo a passo de [Como receber as atualizações](#como-receber-as-atualizações) e sugira ligar a atualização automática. Sem ela, a pessoa fica na versão instalada hoje.

### Como receber as atualizações

O Claude Code não atualiza sozinho os plugins de marketplaces de terceiros, como este. Para receber cada versão nova sem fazer nada:

1. Numa sessão do Claude Code, digite `/plugin`.
2. Abra a aba **Marketplaces** e escolha **media-review-panel**.
3. Ligue a atualização automática (*auto-update*).

Com ela ligada, o Claude Code procura uma versão nova alguns minutos depois da primeira mensagem de cada sessão. Quando ele atualiza, aparece o aviso `Plugin updated`. Digite `/reload-plugins` para usar a versão nova na hora, ou ela entra na próxima vez que você abrir o Claude.

Para atualizar uma vez só, sem ligar a atualização automática, abra `/plugin`, vá na aba **Installed**, escolha o plugin e clique em **Update now**. Num terminal comum, o comando é:

```bash
claude plugin update media-review-panel@media-review-panel
```

Se a opção de atualização automática não aparecer, as atualizações do Claude Code podem estar desligadas (`DISABLE_AUTOUPDATER=1` ou `DISABLE_UPDATES=1`). Para manter só as dos plugins, defina também `FORCE_AUTOUPDATE_PLUGINS=1`.

### Sobre o autor

**Pedro Simões**, Estrategista de Mídia da **[Tráfego Com Pedro](https://trafegocompedro.com.br)**. Tráfego pago (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads) e marketing digital, com IA aplicada à análise de campanhas.

[Site](https://trafegocompedro.com.br) · [LinkedIn](https://www.linkedin.com/in/soupedrosimoes/) · [Instagram](https://www.instagram.com/trafegocompedro/)

### Licença

MIT. Mantenha o aviso de direitos autorais (e o crédito) quando compartilhar ou adaptar.
