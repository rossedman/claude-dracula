# Pixelstack

A Claude mod that redraws the conversation in a chunky pixel style with an earthy blocky-world palette: grass, dirt, wood, stone and sky.

## Install

At the prompt of a terminal session:

```
/plugin install pixelstack --marketplace rossedman/pixelstack
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```sh
claude plugin install pixelstack --marketplace rossedman/pixelstack
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `rossedman/pixelstack`, then Add plugin.

## What it changes

| Site | Drawing | Surfaces |
| --- | --- | --- |
| Your prompt | Grass-green bubble, right-aligned, bold outline | terminal, desktop, vscode |
| Claude's reply | Pixel spark avatar + wood-framed card around the reply | terminal, desktop, vscode |
| Tool calls | Status block (running / done / error / stopped), tool name, first argument | terminal, desktop, vscode |
| Working line | 8-block bar that fills as the turn moves along | terminal, desktop, vscode |
| Turn footer | Block + duration | terminal |
| Above the prompt | Accent swatch + "Pixelstack" | terminal, desktop |

Expanded views (ctrl+o) always show the full default rows. The Claude mobile app runs the mod's commands but does not currently show its restyled rows.

## Commands

- `/pixelstack on` / `/pixelstack off`
- `/pixelstack accent <leaf|gold|sky|ember|#hex>`
- `/pixelstack status`

Settings persist across sessions.

## Palette

| Token | Hex |
| --- | --- |
| soil (outlines) | `#1E1A14` |
| stone | `#3C3F44` |
| dark wood | `#3B2A1E` |
| grass (your messages) | `#4F7232` |
| leaf (default accent) | `#79B33D` |
| wood (reply frame) | `#6B5038` |
| sky | `#6FB7E8` |
| gold | `#E8B83A` |
| ember | `#D9553B` |
| bone (text) | `#F1EDE3` |

## Develop

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

`.claude-plugin/types/` is written by Claude Code when it loads the mod and is git-ignored.

## License

MIT
