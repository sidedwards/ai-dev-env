# AI Development Environment Setup

This script helps you set up a development environment optimized for AI-assisted coding. It automates the installation of IDEs, extensions, and productivity tools.

## Features

- Automated installation of VS Code or Cursor IDE
- Pre-configured installation of essential extensions:
  - GitHub Copilot
  - GitHub Copilot Chat
  - GitHub Pull Requests
  - Mermaid Markdown Syntax Highlighting
  - Markdown Preview Mermaid Support
  - Cline
- Desktop apps created with Pake:
  - Grok (https://grok.com/)
  - Semantic Chat (https://chat.semantic.dev/)
- Optimized IDE settings for AI pair programming
- Cross-platform support (macOS, Windows, Linux)
- Debug logging for troubleshooting
- Non-interactive mode for automation and scripting

## Prerequisites

- Deno runtime (https://deno.land/#installation)
- Node.js and npm (for Pake installation)

## Usage

1. Clone this repository
2. Navigate to the repository folder
3. Run the setup script:

```bash
deno run --allow-read --allow-write --allow-run --allow-env --allow-net setup.ts
```

4. Follow the interactive prompts to select your IDE, extensions, and tools

### Command-line Options

- `--debug` or `-d`: Enable debug logging for detailed operation information
- `--non-interactive` or `-n`: Run in non-interactive mode (skips prompts, uses default selections)
- `--help` or `-h`: Show help information
- `--version` or `-V`: Show version information

Example with debug logging:

```bash
deno run --allow-read --allow-write --allow-run --allow-env --allow-net setup.ts --debug
```

Example in non-interactive mode:

```bash
deno run --allow-read --allow-write --allow-run --allow-env --allow-net setup.ts --non-interactive
```

## Configuration

The `tools.json` file contains all the configuration for available tools, extensions, and their installation commands. You can modify this file to add or remove tools as needed.

## Custom Settings

The script will apply optimized settings for your chosen IDE from the `config` directory. You can customize these settings by editing the appropriate file:

- VS Code: `config/vscode-settings.json`
- Cursor: `config/cursor-settings.json`

## How It Works

The script follows these steps:

1. Detect your operating system and show compatible options
2. Install your selected IDE and helpful extensions
3. Create desktop applications for web tools using Pake
4. Place the app in your system's applications folder

## Troubleshooting

If you encounter issues during installation:

1. Make sure you have the correct permissions
2. Check if your operating system is supported for the chosen tool
3. For manual installation, refer to the official websites of the tools
4. For Pake apps:
   - Ensure Node.js and npm are properly installed
   - If Pake installation fails, try running `npm install -g pake-cli` manually
   - Some websites might not work well with Pake if they require specific browser features

## License

MIT