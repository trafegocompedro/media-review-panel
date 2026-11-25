# Media Review Panel (Revisão de Mídia)

**[English](#english) · [Português](#português)**

**Made by / Feito por [Tráfego Com Pedro](https://trafegocompedro.com.br)** · [Site](https://trafegocompedro.com.br) · [LinkedIn](https://www.linkedin.com/in/soupedrosimoes/) · [Instagram](https://www.instagram.com/trafegocompedro/)

---

## English

A side panel for Claude Code that shows what Claude reads while it analyzes your paid media (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads): each query the panel recognizes, what came back incomplete, whether the numbers in the panel's charts and in Claude's final answer are in the account data Claude received, and, when Claude builds or changes ads, what each call is about to create, before you approve it. It's a transparency and debugging tool: you can check the findings and catch mistakes early.

The panel is **read-only**. It never changes anything in an ad account, and it doesn't approve or block what Claude does: it shows it. It makes no network requests. It keeps review data only for the current session, and the only things it saves to disk are whether you muted the mascot and which view you chose. To check the answer, it also keeps in memory, for the session only, what other tools returned and what you wrote; none of it is saved or sent.

It opens in the **Simple** view, the default: what is happening now in one sentence, alerts in plain words with what to do next, three numbers at a glance (accounts, period, numbers checked), the steps, each chart with its totals and a check badge, and the meaning of each metric. A long table is read for you: a table over days becomes the period's totals in big numbers, one bar per day (a green dot on the days with conversions) and one line per campaign; a long list becomes its top five, full names, and one line for the rest. The table itself stays one press away. Every technical detail is folded under *Technical details*. Press **Full** at the top for every section open, as a specialist would want it. The panel remembers your choice.

### What the panel shows

1. **Accounts under review:** platform, account ID and account name.
2. **Review status:** each step (queued, fetching, analyzing, done, error) and overall progress.
3. **Data level:** account, campaign, ad group or ad set, ad, keyword, search term, audience or placement, with the current one highlighted.
4. **Time periods:** the date range, the comparison range, the timezone, the attribution setting and the currency.
5. **Data visuals:** line charts, bar charts and compact tables, drawn from the values Claude sends through `report`, which asks for retrieved values only. The panel checks the numbers (see [How it works](#how-it-works)). A missing point stays blank in the chart.
6. **Claude's last answer:** after each turn that read ad data, every number Claude wrote in its answer is looked up in the account data of the review. The panel shows how many it found, which ones are Claude's own calculations, which came from another file or from your message, and lists the ones that are in none of them, with the sentence around each.
7. **Building ads (Meta):** when Claude creates a campaign, an ad set, a creative or an ad, changes one, or puts one live, the panel shows an assembly line (campaign › ad set › creative › ad › live) and a card for the piece at hand, in plain words: the budget in money (and the cents the platform receives), dates, objective, where, ages, audience, link and button. The card is there while Claude Code asks for your approval. Before something goes live, the card lists what goes live with it, including the changes staged as drafts (a new budget, a new end date) that the publish carries. It flags a budget that seems to be missing its cents, a total budget with no end date, a link with no UTM, another site or another account than the rest, a budget that jumps 3 times or more, and anything that can't be undone. A receipt lists every piece with its ID, its state and a link to Ads Manager, plus what is still missing (a campaign with no ad set, an ad set with no ad).
8. **Debug and validation:** every call it logged, with its inputs, fields, row count, time and errors. Also: empty responses, extra pages that weren't read, truncated output, calls that can change an account (flagged in red; the panel warns but doesn't block them), and dates queried outside the reported period. Each chart is checked against the raw responses it came from.

Bip, the pixel-art robot in the corner, wears the greens of Tráfego Com Pedro and acts out each moment of the review: a magnifier while it analyzes, a notepad when Claude writes down findings, a siren when a call can change an account, a moth flying out of an empty box, a hammer while the pieces of a launch stack up, a rocket when something goes live, a coffee break when the review is paused, and a nap when the panel sits idle for 10 minutes. It also posts short status messages in English or Brazilian Portuguese, matching your messages. Mute it with the **Mute** button or `/media-review mute`.

### How it works

- The mod watches tool calls. When one reads paid media data, it logs the call and opens the panel. This covers tools with Adspirer, Supermetrics, Google Ads, Meta Ads, TikTok or LinkedIn Ads in their name (and the official Meta Ads connector), plus terminal commands that call an ad platform's API, run a script named for one (or listed in *Your own data scripts*), or print data that looks like Google Ads or Meta Ads data. During a review, it also logs the data files (.json, .csv) Claude reads. A call the mod doesn't recognize doesn't show up in the panel.
- After each logged call, unless it was denied or the tool reported an error, the mod adds a short note to what Claude receives: the call number and, once per review if Claude hasn't used `report` yet, a request to fill in the panel with it. Besides the `report` tool and the replies to `/media-review` (which you also see), that is all it adds for Claude.
- Claude fills in the rest (steps, level, periods, chart data) through a small tool the mod adds, `report`. Each chart names the logged calls its data came from. The mod then looks for every number in those raw responses and marks it as *found*, *not found* or *calculated* (for CPA, ROAS, CTR and the like). A total Claude added up (several campaigns or days) comes with its parts: the mod finds each part and checks the addition. When a response was too large and was saved to a file, the mod reads that file. A spot check like this catches typos and invented values, but it doesn't prove a number is right.
- A small number proves nothing by being found: a count of 3 conversions shows up in almost any answer that lists days or campaigns. So the panel also looks for the numbers right next to each one (one rounding step away, six on each side). When two or more of them show up too, the number is marked *too common to check*, neither found nor missing. A cost with cents is almost never common; most counts under 100 are.
- When Claude calls a tool that changes an ad account, the mod reads what the call sends before it runs, so its card is in the panel while Claude Code asks for your approval. The platform's answer then adds the new ID and its state (draft, paused, live) or why it was refused. The official Meta Ads connector sends everything the card shows. Another tool that changes an account (a script, another connector) shows up as a piece with no details. Changes made by your own Google Ads scripts are logged, but not read in detail.
- When a turn that read ad data ends, the mod reads Claude's final answer and looks up each number in it. Dates, account IDs, code, links, list numbers, IDs and versions, error codes and measures (px, days) are left out. A whole number under 100 with no currency mark (3 conversions) is marked *too small to check*, like any number whose neighbours also show up. A total Claude added up from the rows it read (all the days of a campaign, all the campaigns) is *checked by sum*: the panel adds those rows itself, as it does a column of the answer's own table. In a table, a number in a metric column (cost, clicks, conversions) must be in the row of the data with the same name: a cost of another campaign written in this one's row is flagged *in another row*. A number not in the account data goes to *calculated* when it is written as a rate, an average, a cost per, a comparison ("from R$ 312 to R$ 440"), a plan, a projection or what is left; to *in another file, your message or an earlier answer* when it is there; and otherwise it is one of two things. A precise number (with cents, or a count of four digits or more) rarely matches by chance, so when it is in none of these it is listed as *not in the account data* and raises the alert: ask Claude where it came from. A round one (R$ 5.500, 869, 12 mil) most likely comes from a source the panel did not see, or was rounded, so it is listed quietly under *not checked*, with no alert. Measured on real sessions, this keeps the alert to about one review in ten.

### Commands

| Command | What it does |
| --- | --- |
| `/media-review` | Opens the panel |
| `/media-review demo` | Loads clearly labeled **sample data** so you can see every section |
| `/media-review demo launch` | Loads a **sample launch**: four pieces built and paused, the go-live waiting for your OK |
| `/media-review clear` | Empties the panel |
| `/media-review simple` / `full` | Switches between the Simple and Full views |
| `/media-review mute` / `unmute` | Hides or shows the mascot |
| `/media-review en` / `pt` | Sets the panel language |

### Install

A **plugin** (also called a *mod*) is an add-on for Claude Code. A **marketplace** is a list of plugins that Claude Code can install from. This repository is both.

**Desktop app:** click **+** next to the message box, open **Plugins** and manage your plugins. Add a marketplace from a repository, type `trafegocompedro/media-review-panel`, sync, and add *Media review panel* to this computer and confirm. Step-by-step guide with screenshots, tested in the app in Portuguese: [trafegocompedro.com.br/ferramentas/revisao-de-midia](https://trafegocompedro.com.br/ferramentas/revisao-de-midia).

**Terminal:** a *terminal* is the text window where you type commands. In a Claude Code session there, type:

```
/plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Answer `y` to add the marketplace, then press Enter to install for your user. From a regular shell (outside Claude Code), this does the same:

```bash
claude plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Then type `/media-review demo` to see the panel with sample data.

**Settings** (optional): *Panel language* (auto, en, pt), *Panel theme* (auto follows the app's light or dark theme; light or dark force one), *Mascot* (on, off), *Open the panel automatically* (on, off), *Your own data scripts* (names of your scripts that read ad data, so the panel recognizes them), *Daily budget alert* (a daily budget above this amount, in the account currency, turns red) and *Campaign name pattern* (a regular expression every new campaign name should match). The last three are kept in your local Claude Code settings.

**After installing:** turn on auto-update (see [Updates](#updates)). Without it, you stay on the version installed today.

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

O **Revisão de Mídia** (Media Review Panel) é um painel lateral para o Claude Code que mostra o que o Claude lê enquanto analisa a sua mídia paga (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads): cada consulta que o painel reconhece, o que veio incompleto se os números dos gráficos do painel e da resposta final do Claude estão nos dados da conta que o Claude recebeu e, quando o Claude monta ou muda anúncios, o que cada chamada vai criar, antes de você aprovar. É uma ferramenta de transparência e de conferência: você confere as conclusões e pega erros cedo.

O painel é **somente leitura**. Ele nunca muda nada em uma conta de anúncios e não aprova nem bloqueia o que o Claude faz: ele mostra. Ele não acessa a internet. Os dados da revisão ficam só na sessão atual, e as únicas coisas que ele grava no computador são se você silenciou o mascote e qual visão escolheu. Para conferir a resposta, ele também guarda na memória, só durante a sessão, o que as outras ferramentas devolveram e o que você escreveu; nada disso é gravado nem enviado.

Ele abre na visão **Simples**, a padrão: o que está acontecendo agora numa frase, avisos em linguagem simples com o que fazer, três números de cara (contas, período e números conferidos), as etapas, cada gráfico com os totais e um selo de conferência, e o que quer dizer cada métrica. Uma tabela longa já vem lida: uma tabela por dia vira os totais do período em números grandes, uma barra por dia (ponto verde nos dias com conversão) e uma linha por campanha; uma lista longa vira os cinco maiores, com o nome inteiro, e uma linha para o resto. A tabela continua a um toque. Os detalhes técnicos ficam recolhidos em *Detalhes técnicos*. Aperte **Completo** no topo para ver todas as seções abertas, do jeito que um especialista gosta. O painel lembra a sua escolha.

### O que o painel mostra

1. **Contas em revisão:** plataforma, ID e nome da conta.
2. **Status da revisão:** cada etapa (na fila, buscando, analisando, concluída, erro) e o progresso geral.
3. **Nível dos dados:** conta, campanha, grupo de anúncios ou conjunto de anúncios, anúncio, palavra-chave, termo de pesquisa, público ou posicionamento, com o nível atual em destaque.
4. **Períodos:** o período analisado, o período de comparação, o fuso horário, a configuração de atribuição e a moeda.
5. **Gráficos e tabelas:** gráficos de linha, de barras e tabelas curtas, com os valores que o Claude manda pela `report`, que pede só valores obtidos na sessão. O painel confere os números (veja [Como funciona](#como-funciona)). Um dia sem dado fica em branco no gráfico.
6. **Última resposta do Claude:** depois de cada turno que leu dados de anúncios, cada número que o Claude escreveu na resposta é procurado nos dados da conta da revisão. O painel mostra quantos encontrou, quais são contas do próprio Claude, quais vieram de outro arquivo ou da sua mensagem, e lista os que não estão em nenhum deles, com a frase em volta de cada um.
7. **Subida de anúncios (Meta):** quando o Claude cria uma campanha, um conjunto, um criativo ou um anúncio, muda algum deles ou põe no ar, o painel mostra uma linha de montagem (campanha › conjunto › criativo › anúncio › no ar) e a ficha da peça da vez, em linguagem simples: a verba em reais (e os centavos que a plataforma recebe), período, objetivo, onde, idade, público, link e botão. A ficha aparece enquanto o Claude Code pede a sua aprovação. Antes de algo ir ao ar, a ficha lista o que vai ao ar junto, inclusive as mudanças em rascunho (verba nova, data de fim nova) que a publicação leva. Ela avisa quando a verba parece estar sem os centavos, quando a verba total não tem data de fim, quando o link não tem UTM, quando o site ou a conta são diferentes das outras peças, quando a verba sobe 3 vezes ou mais e quando algo não tem volta. Um comprovante lista cada peça com o ID, o estado e o link para o Gerenciador de Anúncios, e o que ainda falta (campanha sem conjunto, conjunto sem anúncio).
8. **Depuração e validação:** cada chamada registrada, com entradas, campos, número de linhas, tempo e erros. Também mostra respostas vazias, páginas extras que não foram lidas, saídas cortadas, chamadas que podem alterar uma conta (em vermelho; o painel avisa, mas não bloqueia) e datas consultadas fora do período informado. Cada gráfico é conferido com as respostas brutas de onde vieram os números.

O Bip, o robô em pixel art no canto, usa os verdes da Tráfego Com Pedro e encena cada momento da revisão: lupa enquanto analisa, bloquinho quando o Claude anota o que achou, sirene quando uma chamada pode alterar a conta, mariposa saindo da caixa vazia, martelo enquanto as peças de uma subida se empilham, foguete quando algo vai ao ar, cafezinho quando a revisão está pausada e soneca quando o painel fica parado por 10 minutos. Ele também escreve mensagens curtas sobre o andamento, em português ou em inglês, conforme o idioma das suas mensagens. Para silenciar, use o botão **Silenciar** ou `/media-review mute`.

### Como funciona

- O mod observa as chamadas de ferramenta. Quando uma delas lê dados de mídia paga, ele registra a chamada e abre o painel. Isso vale para ferramentas com Adspirer, Supermetrics, Google Ads, Meta Ads, TikTok ou LinkedIn Ads no nome (e o conector oficial do Meta Ads), além de comandos no terminal que chamam a API de uma plataforma de anúncios, rodam um script com o nome dela (ou listado em *Your own data scripts*) ou mostram dados com cara de Google Ads ou Meta Ads. Durante uma revisão, ele também registra os arquivos de dados (.json, .csv) que o Claude lê. Uma chamada que o mod não reconhece não aparece no painel.
- Depois de cada chamada registrada, a não ser que ela tenha sido negada ou que a ferramenta tenha acusado erro, o mod acrescenta uma nota curta ao que o Claude recebe: o número da chamada e, uma vez por revisão, se o Claude ainda não usou a `report`, o pedido para preencher o painel com ela. Além da ferramenta `report` e das respostas do `/media-review` (que você também vê), é só isso que ele acrescenta para o Claude.
- O Claude preenche o resto (etapas, nível, períodos e dados dos gráficos) por uma pequena ferramenta que o mod acrescenta, a `report`. Cada gráfico diz de quais chamadas registradas vieram os dados. O mod então procura cada número nessas respostas brutas e marca como *encontrado*, *não encontrado* ou *calculado* (CPA, ROAS, CTR e parecidos). Um total somado pelo Claude (várias campanhas ou dias) vem com as partes: o mod procura cada parte e confere a soma. Quando uma resposta era grande demais e foi salva num arquivo, o mod lê esse arquivo. Essa conferência por amostra pega erro de digitação e valor inventado, mas não prova que um número está certo.
- Um número pequeno não prova nada por ter sido encontrado: 3 conversões aparecem em quase qualquer resposta que lista dias ou campanhas. Por isso o painel também procura os números vizinhos de cada um (um passo de arredondamento para cima e para baixo, seis de cada lado). Quando dois ou mais deles também aparecem, o número fica como *comum demais para conferir*: nem encontrado, nem faltando. Um custo com centavos quase nunca é comum; a maioria das contagens abaixo de 100 é.
- Quando o Claude chama uma ferramenta que muda uma conta de anúncios, o mod lê o que a chamada envia antes de ela rodar, então a ficha já está no painel enquanto o Claude Code pede a sua aprovação. A resposta da plataforma acrescenta o ID novo e o estado (rascunho, pausado, no ar) ou o motivo da recusa. O conector oficial do Meta Ads envia tudo o que a ficha mostra. Outra ferramenta que muda uma conta (um script, outro conector) aparece como uma peça sem detalhes. Mudanças feitas pelos seus próprios scripts de Google Ads são registradas, mas não lidas em detalhe.
- Quando termina um turno que leu dados de anúncios, o mod lê a resposta final do Claude e procura cada número dela. Datas, IDs de conta, código, links, números de lista, IDs e versões, códigos de erro e medidas (px, dias) ficam de fora. Um número inteiro abaixo de 100 sem R$ (3 conversões) fica como *pequeno demais para conferir*, assim como qualquer número cujos vizinhos também aparecem. Um total que o Claude somou com as linhas que leu (todos os dias de uma campanha, todas as campanhas) fica *conferido pela soma*: o painel soma essas linhas ele mesmo, como faz com uma coluna da tabela da própria resposta. Numa tabela, um número numa coluna de métrica (custo, cliques, conversões) precisa estar na linha dos dados com o mesmo nome: o custo de outra campanha escrito na linha desta é apontado como *em outra linha*. Um número que não está nos dados da conta vira *calculado* quando está escrito como taxa, média, custo por, comparação ("de R$ 312 para R$ 440"), plano, projeção ou o que resta; *em outro arquivo, na sua mensagem ou numa resposta anterior* quando está lá; e, nos outros casos, vira uma de duas coisas. Um número preciso (com centavos, ou uma contagem de quatro dígitos ou mais) quase nunca bate por acaso, então, quando não está em nenhum desses lugares, entra na lista dos que *não estão nos dados da conta* e acende o alerta: pergunte ao Claude de onde ele veio. Um número redondo (R$ 5.500, 869, 12 mil) provavelmente vem de uma fonte que o painel não viu, ou foi arredondado, então fica numa lista discreta de *sem conferência*, sem alerta. Medido em conversas reais, isso deixa o alerta em cerca de uma análise a cada dez.

### Comandos

| Comando | O que faz |
| --- | --- |
| `/media-review` | Abre o painel |
| `/media-review demo` | Carrega **dados de exemplo**, marcados como exemplo, para você ver todas as seções |
| `/media-review demo subida` | Carrega uma **subida de exemplo**: quatro peças montadas e pausadas, e o pôr no ar esperando a sua aprovação |
| `/media-review clear` | Limpa o painel |
| `/media-review simples` / `completo` | Troca entre a visão Simples e a Completa |
| `/media-review mute` / `unmute` | Esconde ou mostra o mascote |
| `/media-review en` / `pt` | Define o idioma do painel |

### Como instalar

Um **plugin** (também chamado de *mod*) é um complemento do Claude Code. Um **marketplace** é uma lista de plugins de onde o Claude Code instala. Este repositório é as duas coisas.

**No app do Claude (desktop):** clique no **+** ao lado da caixa de mensagem, passe o mouse em **Plugins** e clique em **Gerenciar plugins**. Clique em **Adicionar**, depois em **Adicionar marketplace** e em **Adicionar de um repositório**. Digite `trafegocompedro/media-review-panel`, clique em **Usar** e em **Sincronizar**. No *Media review panel*, clique em **Adicionar a este computador** e confirme em **Continuar**. Guia passo a passo, com as telas: [trafegocompedro.com.br/ferramentas/revisao-de-midia](https://trafegocompedro.com.br/ferramentas/revisao-de-midia).

**No terminal:** o *terminal* é a janela de texto onde você digita comandos. Numa sessão do Claude Code aberta nele, digite:

```
/plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Responda `y` para adicionar o marketplace e aperte Enter para instalar para o seu usuário. Fora do Claude Code, num terminal comum, este comando faz o mesmo:

```bash
claude plugin install media-review-panel --marketplace trafegocompedro/media-review-panel
```

Depois digite `/media-review demo` para ver o painel com dados de exemplo.

**Configurações** (opcionais): *Panel language* (auto, en, pt), *Panel theme* (auto segue o tema claro ou escuro do app; light ou dark fixam um), *Mascot* (on, off), *Open the panel automatically* (on, off), *Your own data scripts* (nomes dos seus scripts que leem dados de anúncios, para o painel reconhecer), *Daily budget alert* (verba por dia acima deste valor, na moeda da conta, fica em vermelho) e *Campaign name pattern* (expressão regular que todo nome de campanha nova deve seguir). As três últimas ficam nas configurações locais do Claude Code.

**Depois de instalar:** ligue a atualização automática (veja [Como receber as atualizações](#como-receber-as-atualizações)). Sem ela, você fica na versão instalada hoje.

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
