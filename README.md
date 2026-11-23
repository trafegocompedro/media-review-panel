# Media Review Panel

**Made by [Tráfego Com Pedro](https://www.instagram.com/trafegocompedro/)** · [LinkedIn](https://www.linkedin.com/in/soupedrosimoes/) · [Instagram](https://www.instagram.com/trafegocompedro/)

A side panel for Claude Code that shows exactly what Claude reads while it analyzes your paid media (Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads). It's a transparency and debugging tool: you can check the findings and catch mistakes early.

The panel is **read-only**. It never changes anything in an ad account. It makes no network requests. It keeps review data only for the current session, and the only thing it saves to disk is whether you muted the mascot.

## What the panel shows

1. **Accounts under review:** platform, account ID and account name.
2. **Review status:** each step (queued, fetching, analyzing, done, error) and overall progress.
3. **Data level:** account, campaign, ad group or ad set, ad, keyword, search term, audience or placement, with the current one highlighted.
4. **Time periods:** the date range, the comparison range, the timezone, the attribution setting and the currency.
5. **Data visuals:** line charts, bar charts and compact tables, built only from values retrieved in the session. A missing point stays blank. It's never filled in.
6. **Debug and validation:** every tool call with its inputs, fields, row count, time and errors. Also: empty responses, extra pages that weren't read, truncated output, calls that can change an account (flagged in red), and dates queried outside the reported period. Each chart is checked against the raw responses it came from.

Bip, the robot in the corner, posts short status messages in English or Brazilian Portuguese, matching your messages. Mute it with the **Mute** button or `/media-review mute`.

## How it works

- The mod watches tool calls. When one reads paid media data, it logs the call and opens the panel. This covers the Meta Ads connector, Adspirer, Supermetrics, and TikTok or LinkedIn tools, plus Google Ads scripts and GAQL queries run in the terminal.
- Claude fills in the rest (steps, level, periods, chart data) through a small tool the mod adds, `report`. Each chart names the logged calls its data came from. The mod then looks for every number in those raw responses and marks it as *found*, *not found* or *calculated* (for CPA, ROAS, CTR and the like). A spot check like this catches typos and invented values, but it doesn't prove a number is right.

## Commands

| Command | What it does |
| --- | --- |
| `/media-review` | Opens the panel |
| `/media-review demo` | Loads clearly labeled **sample data** so you can see every section |
| `/media-review clear` | Empties the panel |
| `/media-review mute` / `unmute` | Hides or shows the mascot |
| `/media-review en` / `pt` | Sets the panel language |

## Install

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

## Em português

Painel lateral para o Claude Code que mostra tudo o que o Claude lê quando analisa mídia paga: contas, etapas, nível dos dados, períodos, gráficos e o registro completo de chamadas, com a conferência dos números. É somente leitura e não envia nada para lugar nenhum. Para instalar, siga os passos acima. Depois digite `/media-review demo` para ver o painel com dados de exemplo.

## License

MIT. Keep the copyright notice (and the credit) when you share or adapt it.
