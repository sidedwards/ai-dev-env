import { Select, Checkbox } from "https://deno.land/x/cliffy@v0.25.7/prompt/mod.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse } from "https://deno.land/std@0.224.0/path/mod.ts";

// Detect the operating system
const os = Deno.build.os; // "darwin" (macOS), "windows", or "linux"

// Load tools configuration
const toolsText = await Deno.readTextFile("tools.json");
const tools = JSON.parse(toolsText);

// Function to create a template settings file if it doesn't exist
async function ensureSettingsFile(filePath: string, ideName: string) {
  // Create parent directories if they don't exist
  await ensureDir(dirname(filePath));
  
  if (!(await exists(filePath))) {
    console.log(`Creating default settings file for ${ideName}...`);
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
    console.log(`Created default settings file for ${ideName}.`);
  }
}

// Step 1: Choose an IDE
const ideOptions = tools.ides.map((ide: any) => ({ name: ide.name, value: ide.name }));
ideOptions.push({ name: "Skip", value: "skip" });

const ideChoice = await Select.prompt({
  message: "Choose an IDE to install:",
  options: ideOptions,
});

// Install the selected IDE
if (ideChoice !== "skip") {
  const ide = tools.ides.find((i: any) => i.name === ideChoice);
  try {
    const command = new Deno.Command(ide.command, {
      args: ["--version"],
      stdout: "null",
      stderr: "null"
    });
    await command.output();
    console.log(`${ide.name} is already installed.`);
  } catch {
    console.log(`${ide.name} is not installed. Installing...`);
    const installCmd = ide.install[os];
    if (installCmd) {
      try {
        const command = new Deno.Command(installCmd.split(" ")[0], {
          args: installCmd.split(" ").slice(1)
        });
        await command.output();
        console.log(`${ide.name} installed successfully.`);
      } catch (e: unknown) {
        const error = e as Error;
        console.error(`Failed to install ${ide.name}: ${error.message}`);
      }
    } else {
      console.log(`Installation not supported on ${os}. Please install manually.`);
    }
  }
}

// Step 2: Choose extensions
const extensionOptions = tools.extensions.map((ext: any) => {
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

const extensionChoices = await Checkbox.prompt({
  message: "Choose extensions to install:",
  options: extensionOptions,
});

// Install selected extensions
if (ideChoice !== "skip" && extensionChoices.length > 0) {
  const ide = tools.ides.find((i: any) => i.name === ideChoice);
  for (const extId of extensionChoices) {
    try {
      const command = new Deno.Command(ide.command, {
        args: ["--install-extension", extId],
        stdout: "null",
        stderr: "null"
      });
      await command.output();
      console.log(`Installed extension: ${extId}`);
    } catch (e: unknown) {
      const error = e as Error;
      console.error(`Failed to install extension ${extId}: ${error.message}`);
    }
  }
}

// Step 3: Choose apps
tools.apps.forEach((app: any, index: number) => {
  console.log(`  ${index + 1}. ${app.name} (${app.url})`);
  console.log(`     Creates a native desktop app with Pake`);
});
console.log("");

const appOptions = tools.apps.map((app: any) => ({ 
  name: `${app.name} (${app.url})`, 
  value: app.name,
  checked: true // Pre-check all apps by default
}));

if (appOptions.length === 0) {
  console.log("No apps configured for installation.");
} else {
  const appChoices = await Checkbox.prompt({
    message: "Select apps to install as desktop applications:",
    options: appOptions,
  });

  // Install selected apps
  if (appChoices.length > 0) {
    console.log("\n🚀 Installing desktop applications...");
    
    for (const appName of appChoices) {
      const app = tools.apps.find((a: any) => a.name === appName);
      
      if (app.type === "pake") {
        console.log(`\n📦 Installing ${app.name}...`);
        console.log(`URL: ${app.url}`);
        
        const installCmd = app.install[os];
        if (installCmd) {
          try {
            // First check if npm is available
            try {
              const npmCheckCmd = new Deno.Command("npm", {
                args: ["--version"],
                stdout: "null",
                stderr: "null"
              });
              await npmCheckCmd.output();
            } catch (e) {
              throw new Error("npm is not installed or not in PATH. Please install Node.js and npm first.");
            }
            
            // Check if Pake is installed
            let isPakeInstalled = false;
            try {
              const checkPakeCmd = new Deno.Command("pake", {
                args: ["--version"],
                stdout: "null",
                stderr: "null"
              });
              await checkPakeCmd.output();
              isPakeInstalled = true;
              console.log("✅ Pake CLI is already installed");
            } catch {
              console.log("🔍 Pake CLI not found, installing...");
              const installPakeCmd = new Deno.Command("npm", {
                args: ["install", "-g", "pake-cli"]
              });
              const output = await installPakeCmd.output();
              
              if (output.code !== 0) {
                const decoder = new TextDecoder();
                const stderr = decoder.decode(output.stderr);
                throw new Error(`Failed to install Pake CLI: ${stderr}`);
              }
              console.log("✅ Pake CLI installed successfully");
              isPakeInstalled = true;
            }
            
            if (isPakeInstalled) {
              console.log(`🔨 Creating desktop application for ${app.name}...`);
              
              // Extract arguments for pake command
              const urlMatch = installCmd.match(/pake\s+(https?:\/\/[^\s]+)/);
              const nameMatch = installCmd.match(/--name\s+(?:"([^"]+)"|([^\s]+))/);
              const widthMatch = installCmd.match(/--width\s+(\d+)/);
              const heightMatch = installCmd.match(/--height\s+(\d+)/);
              
              if (!urlMatch) {
                throw new Error("Could not extract URL from install command");
              }
              
              const url = urlMatch[1];
              // Use displayName if available, otherwise use name from command or fall back to app.name
              const displayName = app.displayName || (nameMatch ? (nameMatch[1] || nameMatch[2]) : app.name);
              
              // Pake requires app names without spaces and special characters
              // Replace spaces and special characters with dashes
              const pakeName = displayName.replace(/[^a-zA-Z0-9-]/g, '');
              
              // Build arguments for pake command
              const args = ["pake", url];
              
              args.push("--name");
              args.push(pakeName);
              
              if (widthMatch && heightMatch) {
                args.push("--width");
                args.push(widthMatch[1]);
                args.push("--height");
                args.push(heightMatch[1]);
              }
              
              console.log(`Running: ${args.join(' ')}`);
              
              // Create an environment object with any necessary environment variables
              const env: Record<string, string> = { ...Deno.env.toObject() };
              
              // Create command with ability to capture output and set custom environment
              const pakeCommand = new Deno.Command(args[0], {
                args: args.slice(1),
                stdout: "piped",
                stderr: "piped",
                env: env
              });
              
              const pakeOutput = await pakeCommand.output();
              
              // Decode stdout and stderr
              const textDecoder = new TextDecoder();
              const stdout = textDecoder.decode(pakeOutput.stdout);
              const stderr = textDecoder.decode(pakeOutput.stderr);
              
              // Handle specific errors in the output
              if (pakeOutput.code === 0) {
                console.log(`\n✅ Successfully created desktop app for ${app.name}!`);
                console.log(`   The application is now in your applications folder.`);
              } else {
                // Check if this is the common DMG bundling error on macOS
                if (os === "darwin" && stderr.includes("bundle_dmg.sh")) {
                  console.log(`\n⚠️ DMG bundling failed, but the app was still created.`);
                  console.log(`   This is a common issue on macOS and can be safely ignored.`);
                  
                  // Check if the app was actually created
                  const appPathMatch = stderr.match(/Bundling\s+([^(]+\.app)\s+\(/);
                  
                  if (appPathMatch && appPathMatch[1]) {
                    console.log(`   The application should be available at: ${appPathMatch[1]}`);
                    console.log(`\n✅ Application created successfully despite DMG bundling error.`);
                  } else {
                    throw new Error(`Pake command failed: ${stderr}`);
                  }
                } else {
                  throw new Error(`Pake command failed: ${stderr}`);
                }
              }
            }
          } catch (e: unknown) {
            const error = e as Error;
            console.error(`❌ Failed to install ${app.name}: ${error.message}`);
            console.log(`\n💡 To install manually, run:`);
            console.log(`   npm install -g pake-cli`);
            
            // Use displayName if available for manual instructions
            const displayName = app.displayName || app.name.replace(/ /g, '');
            console.log(`   pake ${app.url} --name ${displayName} --width 1200 --height 800`);
          }
        } else {
          console.log(`⚠️ Installation not supported on ${os}. Please install manually using Pake:`);
          
          // Use displayName if available for manual instructions
          const displayName = app.displayName || app.name.replace(/ /g, '');
          console.log(`   npm install -g pake-cli && pake ${app.url} --name ${displayName} --width 1200 --height 800`);
        }
      } else {
        // Regular app installation logic
        const installCmd = app.install[os];
        if (installCmd) {
          try {
            console.log(`📦 Installing ${app.name}...`);
            const cmd = installCmd.split(" ");
            const command = new Deno.Command(cmd[0], {
              args: cmd.slice(1)
            });
            const output = await command.output();
            
            if (output.code === 0) {
              console.log(`✅ ${appName} installed successfully.`);
            } else {
              const decoder = new TextDecoder();
              const stderr = decoder.decode(output.stderr);
              throw new Error(stderr);
            }
          } catch (e: unknown) {
            const error = e as Error;
            console.error(`❌ Failed to install ${appName}: ${error.message}`);
          }
        } else {
          console.log(`⚠️ Installation not supported on ${os}. Please install ${appName} manually.`);
        }
      }
    }
  } else {
    console.log("No apps selected for installation.");
  }
}

// Step 4: Apply IDE configuration
if (ideChoice !== "skip") {
  const ide = tools.ides.find((i: any) => i.name === ideChoice);
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
    console.log(`Settings path not defined for ${ide.name}. Skipping configuration.`);
    settingsPath = "";
  }

  if (settingsPath) {
    try {
      // Create default settings file if it doesn't exist
      await ensureSettingsFile(settingsPath, ide.name);
      
      // Check if config directory exists
      const configFilePath = `config/${ide.name.toLowerCase().replace(" ", "")}-settings.json`;
      if (await exists(configFilePath)) {
        console.log("Settings file already exists. Creating backup...");
        await copy(settingsPath, `${settingsPath}.backup`, { overwrite: true });
        await copy(configFilePath, settingsPath, { overwrite: true });
        console.log(`Applied ${ide.name} configuration from ${configFilePath}.`);
      } else {
        console.log(`Config file ${configFilePath} not found. Using default settings.`);
      }
    } catch (e: unknown) {
      const error = e as Error;
      console.error(`Failed to apply ${ide.name} settings: ${error.message}`);
    }
  }
}

// Step 5: Display completion message
console.log("\nSetup complete! Enjoy your development environment.");