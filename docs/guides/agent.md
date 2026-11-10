# Modeling agent

Model by describing what you want, with your own language model key.

The **agent panel** (beta) on the right (open the first time; **AGENT** opens or closes it) is where you ask, in plain
words, for what you want to model; an LLM runs Cota for
you with the same commands you would type (as scripts), looks at what it built and answers. It needs **your own API
key** (Anthropic, OpenAI, Google Gemini, OpenRouter —for DeepSeek, Kimi, GLM and others— or any OpenAI-compatible
API); Cota has none. The key goes only from your browser to that provider. The first time, Cota asks whether to
remember it in this browser, explaining the risk, and keeps that choice.

- **Ask before running** (default) shows each batch of commands and runs it only when you press Run;
  **Run automatically** lets the agent work alone. Each batch is one undo step.
- Conversations are kept in the browser and listed at the top of the panel.
- Closed, it leaves a narrow **Agents** tab at the right edge to open it again; **Options ▸ User Preferences** hides
  the tab. Whether it is open, and the tab, are saved with your preferences (in your account when signed in).
- The bar shows how much of the model's context is used; **Compact** (or the **COMPACT** command) replaces the
  conversation with a summary to free it.
- **External agent:** an agent on your computer (OpenCode, Claude Code, Codex…) can work on the open drawing with
  its own model, through the Cota bridge (⚙ ▸ **External agent**). See [external agents](../external-agents.md).
- **With the optional server (Docker)** and signed in, the panel uses it: your key is saved on the server for your
  account (encrypted, it never comes back to the browser), the server calls the model with pydantic-ai, and the
  conversations are stored in its database. The commands still run in your browser, on the open drawing.

## Natural-language modeling with the server

`PROMPT` (alias `AI`) opens a box where you describe what you want ("a 100×60×10 plate with four Ø8 holes
at 10 from the corners") and Cota builds or edits the model. It needs the optional server and your own key for
a compatible LLM provider, configured in the same dialog. The key is stored encrypted on your server.

**See also:** [External agents](../external-agents.md) · [AGENT](../reference/tools.md#agent)
