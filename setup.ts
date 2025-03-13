import { Select, Checkbox } from "https://deno.land/x/cliffy@v0.25.7/prompt/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v0.25.7/command/mod.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { dirname, join, parse } from "https://deno.land/std@0.224.0/path/mod.ts";

// Define interfaces for better type safety
interface IDE {
  name: string;
  command: string;
  install: Record<string, string>;
}

interface Extension {
  name: string;
  id: string;
}

interface App {
  name: string;
  displayName?: string;
  type: string;
  url: string;
  install: Record<string, string>;
}

interface Tools {
  ides: IDE[];
  extensions: Extension[];
  apps: App[];
}

// Handle broken pipe errors gracefully
Deno.addSignalListener("SIGPIPE", () => {
  // Just exit cleanly when pipe is broken
  Deno.exit(0);
});

// Register cleanup handler for interruptions
Deno.addSignalListener("SIGINT", () => {
  console.log("\nInterrupted. Cleaning up...");
  // Perform any necessary cleanup
  Deno.exit(1);
});

// Check if stdout is a TTY (terminal)
const isInteractive = Deno.isatty(Deno.stdout.rid);

// Parse command-line arguments
const { options } = await new Command()
  .name("ai-dev-env")
  .version("1.0.0")
  .description("AI Development Environment Setup Tool")
  .option("-d, --debug", "Enable debug logging")
  .option("-n, --non-interactive", "Run in non-interactive mode (skip prompts)")
  .parse(Deno.args);

// Set up logging utility
const logger = {
  debug: (message: string) => {
    if (options.debug) {
      console.log(`[DEBUG] ${message}`);
    }
  },
  info: (message: string) => {
    console.log(message);
  },
  error: (message: string) => {
    console.error(`❌ ${message}`);
  },
  success: (message: string) => {
    console.log(`✅ ${message}`);
  },
  warning: (message: string) => {
    console.log(`⚠️ ${message}`);
  }
};

// Detect the operating system
const os = Deno.build.os; // "darwin" (macOS), "windows", or "linux"
logger.debug(`Operating system detected: ${os}`);

// Get script directory for relative paths
const scriptDir = new URL(".", import.meta.url).pathname;
const toolsPath = join(scriptDir, "tools.json");

// Load tools configuration
logger.debug(`Loading tools configuration from ${toolsPath}`);
const toolsText = await Deno.readTextFile(toolsPath);
const tools = JSON.parse(toolsText) as Tools;

// Validate tools configuration
function validateToolsConfig(tools: unknown): tools is Tools {
  const t = tools as Tools;
  return Array.isArray(t.ides) && 
         Array.isArray(t.extensions) && 
         Array.isArray(t.apps);
}

if (!validateToolsConfig(tools)) {
  logger.error("Invalid tools configuration. Please check tools.json");
  Deno.exit(1);
}

logger.debug(`Loaded ${Object.keys(tools).length} tool categories`);

// Function to create a template settings file if it doesn't exist
async function ensureSettingsFile(filePath: string, ideName: string) {
  // Create parent directories if they don't exist
  logger.debug(`Ensuring settings file exists for ${ideName} at ${filePath}`);
  await ensureDir(dirname(filePath));
  
  if (!(await exists(filePath))) {
    logger.info(`Creating default settings file for ${ideName}...`);
    const defaultSettings = {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": "esbenp.prettier-vscode",
      "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
      },
      "editor.suggest.snippetsPreventQuickSuggestions": false,
      "editor.inlineSuggest.enabled": true,
      "github.copilot.enable": {
        "*": true,
        "plaintext": false,
        "markdown": true
      }
    };
    
    await Deno.writeTextFile(filePath, JSON.stringify(defaultSettings, null, 2));
    logger.success(`Created default settings file for ${ideName}.`);
  } else {
    logger.debug(`Settings file for ${ideName} already exists`);
  }
}

// Function to install IDE
async function installIDE(ideChoice: string, tools: Tools): Promise<boolean> {
  if (ideChoice === "skip") {
    return false;
  }
  
  const ide = tools.ides.find(i => i.name === ideChoice);
  if (!ide) {
    logger.error(`IDE ${ideChoice} not found in configuration`);
    return false;
  }
  
  try {
    const { success } = await executeCommand(ide.command, ["--version"], { silent: true });
    if (success) {
      logger.success(`${ide.name} is already installed.`);
      return true;
    }
    
    logger.warning(`${ide.name} is not installed. Installing...`);
    const installCmd = ide.install[os];
    
    if (!installCmd) {
      logger.warning(`Installation not supported on ${os}. Please install ${ide.name} manually.`);
      return false;
    }
    
    const cmdParts = installCmd.split(" ");
    const { success: installSuccess, stderr } = await executeCommand(cmdParts[0], cmdParts.slice(1));
    
    if (installSuccess) {
      logger.success(`${ide.name} installed successfully.`);
      return true;
    } else {
      throw new Error(stderr);
    }
  } catch (e) {
    const error = e as Error;
    logger.error(`Failed to install ${ide.name} on ${os}: ${error.message}`);
    const installCmd = ide.install[os];
    if (installCmd) {
      logger.info(`You can try installing manually with: ${installCmd}`);
    }
    return false;
  }
}

// Function to install extensions
async function installExtensions(ideChoice: string, extensionChoices: string[], tools: Tools): Promise<void> {
  if (ideChoice === "skip" || extensionChoices.length === 0) {
    return;
  }
  
  const ide = tools.ides.find(i => i.name === ideChoice);
  if (!ide) {
    logger.error(`IDE ${ideChoice} not found in configuration`);
    return;
  }
  
  logger.info(`Installing extensions for ${ide.name}... (this may take a while)`);
  let completedCount = 0;
  const totalCount = extensionChoices.length;
  
  for (const extId of extensionChoices) {
    try {
      logger.info(`[${++completedCount}/${totalCount}] Installing ${extId}...`);
      const { success, stderr } = await executeCommand(ide.command, ["--install-extension", extId]);
      
      if (success) {
        logger.success(`Installed extension: ${extId}`);
      } else {
        throw new Error(stderr);
      }
    } catch (e) {
      const error = e as Error;
      logger.error(`Failed to install extension ${extId}: ${error.message}`);
    }
  }
}

// Function to install Pake CLI
async function installPake(): Promise<boolean> {
  try {
    // Check if npm is available
    const { success: npmSuccess, stderr: npmError } = await executeCommand("npm", ["--version"], { silent: true });
    if (!npmSuccess) {
      throw new Error("npm is not installed or not in PATH. Please install Node.js and npm first.");
    }
    
    // Check if Pake is installed
    const { success: pakeSuccess } = await executeCommand("pake", ["--version"], { silent: true });
    if (pakeSuccess) {
      logger.success("✅ Pake CLI is already installed");
      return true;
    }
    
    logger.warning("🔍 Pake CLI not found, installing...");
    const { success: installSuccess, stderr: installError } = await executeCommand("npm", ["install", "-g", "pake-cli"]);
    
    if (installSuccess) {
      logger.success("✅ Pake CLI installed successfully");
      return true;
    } else {
      throw new Error(`Failed to install Pake CLI: ${installError}`);
    }
  } catch (e) {
    const error = e as Error;
    logger.error(`Failed to install Pake: ${error.message}`);
    return false;
  }
}

// Function to install apps
async function installApps(appChoices: string[], tools: Tools): Promise<void> {
  if (appChoices.length === 0) {
    logger.info("No apps selected for installation.");
    return;
  }
  
  logger.info("\n🚀 Installing desktop applications...");
  
  for (const appName of appChoices) {
    const app = tools.apps.find(a => a.name === appName);
    if (!app) {
      logger.error(`App ${appName} not found in configuration`);
      continue;
    }
    
    if (app.type === "pake") {
      logger.info(`\n📦 Installing ${app.name}...`);
      logger.info(`URL: ${app.url}`);
      
      const installCmd = app.install[os];
      if (!installCmd) {
        logger.warning(`⚠️ Installation not supported on ${os}. Please install manually using Pake:`);
        const displayName = app.displayName || app.name.replace(/ /g, '');
        logger.info(`   npm install -g pake-cli && pake ${app.url} --name ${displayName} --width 1200 --height 800`);
        continue;
      }
      
      // Install Pake if needed
      const isPakeInstalled = await installPake();
      if (!isPakeInstalled) {
        logger.info(`\n💡 To install ${app.name} manually, run:`);
        logger.info(`   npm install -g pake-cli`);
        const displayName = app.displayName || app.name.replace(/ /g, '');
        logger.info(`   pake ${app.url} --name ${displayName} --width 1200 --height 800`);
        continue;
      }
      
      // Extract arguments for pake command
      const urlMatch = installCmd.match(/pake\s+(https?:\/\/[^\s]+)/);
      const nameMatch = installCmd.match(/--name\s+(?:"([^"]+)"|([^\s]+))/);
      const widthMatch = installCmd.match(/--width\s+(\d+)/);
      const heightMatch = installCmd.match(/--height\s+(\d+)/);
      
      if (!urlMatch) {
        logger.error(`Could not extract URL from install command for ${app.name}`);
        continue;
      }
      
      const url = urlMatch[1];
      const displayName = app.displayName || (nameMatch ? (nameMatch[1] || nameMatch[2]) : app.name);
      const pakeName = displayName.replace(/[^a-zA-Z0-9-]/g, '');
      
      // Build arguments for pake command
      const args = [url];
      
      args.push("--name");
      args.push(pakeName);
      
      if (widthMatch && heightMatch) {
        args.push("--width");
        args.push(widthMatch[1]);
        args.push("--height");
        args.push(heightMatch[1]);
      }
      
      logger.info(`Running: pake ${args.join(' ')}`);
      
      // Create an environment object with any necessary environment variables
      const env: Record<string, string> = { ...Deno.env.toObject() };
      
      // Execute pake command
      const { success, stdout, stderr } = await executeCommand("pake", args, { env });
      
      if (success) {
        logger.success(`\n✅ Successfully created desktop app for ${app.name}!`);
        logger.success(`   The application is now in your applications folder.`);
      } else {
        // Check if this is the common DMG bundling error on macOS
        if (os === "darwin" && stderr.includes("bundle_dmg.sh")) {
          logger.warning(`\n⚠️ DMG bundling failed, but the app was still created.`);
          logger.warning(`   This is a common issue on macOS and can be safely ignored.`);
          
          // Check if the app was actually created
          const appPathMatch = stderr.match(/Bundling\s+([^(]+\.app)\s+\(/);
          
          if (appPathMatch && appPathMatch[1]) {
            logger.success(`   The application should be available at: ${appPathMatch[1]}`);
            logger.success(`\n✅ Application created successfully despite DMG bundling error.`);
          } else {
            logger.error(`Pake command failed: ${stderr}`);
          }
        } else {
          logger.error(`Pake command failed: ${stderr}`);
        }
      }
    } else {
      // Regular app installation logic
      const installCmd = app.install[os];
      if (installCmd) {
        try {
          logger.info(`📦 Installing ${app.name}...`);
          const cmd = installCmd.split(" ");
          const { success, stderr } = await executeCommand(cmd[0], cmd.slice(1));
          
          if (success) {
            logger.success(`✅ ${appName} installed successfully.`);
          } else {
            throw new Error(stderr);
          }
        } catch (e) {
          const error = e as Error;
          logger.error(`❌ Failed to install ${appName}: ${error.message}`);
        }
      } else {
        logger.warning(`⚠️ Installation not supported on ${os}. Please install ${appName} manually.`);
      }
    }
  }
}

// Function to apply IDE configuration
async function applyIDEConfiguration(ideChoice: string, tools: Tools): Promise<void> {
  if (ideChoice === "skip") {
    return;
  }
  
  const ide = tools.ides.find(i => i.name === ideChoice);
  if (!ide) {
    logger.error(`IDE ${ideChoice} not found in configuration`);
    return;
  }
  
  let settingsPath: string;
  
  // Define settings path based on OS and IDE
  if (ide.name === "VS Code") {
    if (os === "darwin") {
      settingsPath = `${Deno.env.get("HOME")}/Library/Application Support/Code/User/settings.json`;
    } else if (os === "windows") {
      settingsPath = `${Deno.env.get("APPDATA")}\\Code\\User\\settings.json`;
    } else {
      settingsPath = `${Deno.env.get("HOME")}/.config/Code/User/settings.json`;
    }
  } else if (ide.name === "Cursor") {
    if (os === "darwin") {
      settingsPath = `${Deno.env.get("HOME")}/Library/Application Support/Cursor/User/settings.json`;
    } else if (os === "windows") {
      settingsPath = `${Deno.env.get("APPDATA")}\\Cursor\\User\\settings.json`;
    } else {
      settingsPath = `${Deno.env.get("HOME")}/.config/Cursor/User/settings.json`;
    }
  } else {
    logger.warning(`Settings path not defined for ${ide.name}. Skipping configuration.`);
    return;
  }

  try {
    // Create default settings file if it doesn't exist
    await ensureSettingsFile(settingsPath, ide.name);
    
    // Check if config directory exists
    const configFilePath = join(scriptDir, "config", `${ide.name.toLowerCase().replace(" ", "")}-settings.json`);
    if (await exists(configFilePath)) {
      logger.info("Settings file already exists. Creating backup...");
      await copy(settingsPath, `${settingsPath}.backup`, { overwrite: true });
      await copy(configFilePath, settingsPath, { overwrite: true });
      logger.success(`Applied ${ide.name} configuration from ${configFilePath}.`);
    } else {
      logger.info(`Config file ${configFilePath} not found. Using default settings.`);
    }
  } catch (e) {
    const error = e as Error;
    logger.error(`Failed to apply ${ide.name} settings: ${error.message}`);
  }
}

// Main execution flow
async function main() {
  // Step 1: Choose an IDE
  const ideOptions = tools.ides.map(ide => ({ name: ide.name, value: ide.name }));
  ideOptions.push({ name: "Skip", value: "skip" });

  // Default to the first IDE (VS Code) or skip in non-interactive mode
  let ideChoice = options.nonInteractive || !isInteractive ? (ideOptions[0]?.value || "skip") : undefined;

  if (!ideChoice) {
    try {
      ideChoice = await Select.prompt({
        message: "Choose an IDE to install:",
        options: ideOptions,
      });
    } catch (error) {
      // If we get an error during prompt (e.g., pipe closed), just use the default
      logger.debug(`Error during IDE selection prompt: ${error.message}. Using default.`);
      ideChoice = ideOptions[0]?.value || "skip";
    }
  }

  logger.debug(`Selected IDE: ${ideChoice}`);

  // Install the selected IDE
  await installIDE(ideChoice, tools);

  // Step 2: Choose extensions
  const extensionOptions = tools.extensions.map(ext => {
    // Pre-check our preferred extensions
    const preCheckList = [
      "github.copilot", 
      "github.copilot-chat", 
      "github.vscode-pull-request-github",
      "bpruitt-goddard.mermaid-markdown-syntax-highlighting",
      "bierner.markdown-mermaid"
    ];
    
    return { 
      name: ext.name, 
      value: ext.id,
      checked: preCheckList.includes(ext.id)
    };
  });

  // Use preselected extensions in non-interactive mode
  let extensionChoices: string[] = [];
  if (options.nonInteractive || !isInteractive) {
    extensionChoices = extensionOptions
      .filter(ext => ext.checked)
      .map(ext => ext.value);
    logger.debug(`Using default extensions in non-interactive mode: ${extensionChoices.join(", ")}`);
  } else {
    try {
      extensionChoices = await Checkbox.prompt({
        message: "Choose extensions to install:",
        options: extensionOptions,
      });
    } catch (error) {
      // If we get an error during prompt, use the preselected extensions
      logger.debug(`Error during extension selection prompt: ${error.message}. Using defaults.`);
      extensionChoices = extensionOptions
        .filter(ext => ext.checked)
        .map(ext => ext.value);
    }
  }

  // Install selected extensions
  await installExtensions(ideChoice, extensionChoices, tools);

  // Step 3: Choose apps
  if (isInteractive && !options.nonInteractive) {
    tools.apps.forEach((app, index) => {
      logger.info(`  ${index + 1}. ${app.name} (${app.url})`);
      logger.info(`     Creates a native desktop app with Pake`);
    });
    logger.info("");
  }

  const appOptions = tools.apps.map(app => ({ 
    name: `${app.name} (${app.url})`, 
    value: app.name,
    checked: true // Pre-check all apps by default
  }));

  // Use all apps in non-interactive mode
  let appChoices: string[] = [];
  if (options.nonInteractive || !isInteractive || appOptions.length === 0) {
    appChoices = appOptions.map(app => app.value);
    logger.debug(`Using all apps in non-interactive mode: ${appChoices.join(", ")}`);
  } else {
    try {
      appChoices = await Checkbox.prompt({
        message: "Select apps to install as desktop applications:",
        options: appOptions,
      });
    } catch (error) {
      // If we get an error during prompt, use all apps
      logger.debug(`Error during app selection prompt: ${error.message}. Using all apps.`);
      appChoices = appOptions.map(app => app.value);
    }
  }

  // Install selected apps
  await installApps(appChoices, tools);

  // Step 4: Apply IDE configuration
  await applyIDEConfiguration(ideChoice, tools);

  // Step 5: Display completion message
  logger.success("\nSetup complete! Enjoy your development environment.");
}

// Run the main function
await main();