"use strict";
/**
 * YS AI Extension — Entry Point
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatViewProvider_1 = require("./providers/ChatViewProvider");
const FileTreeProvider_1 = require("./providers/FileTreeProvider");
const GitProvider_1 = require("./providers/GitProvider");
const DbProvider_1 = require("./providers/DbProvider");
const companion = __importStar(require("./companion"));
let statusBarItem;
async function activate(context) {
    // ─── Status bar ────────────────────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = "ysAI.openChat";
    statusBarItem.text = "$(loading~spin) YS AI";
    statusBarItem.tooltip = "YS AI — checking companion server…";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // ─── Chat webview provider ──────────────────────────────────────────────────
    const chatProvider = new ChatViewProvider_1.ChatViewProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("ysAI.chat", chatProvider, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    // ─── Tree providers ─────────────────────────────────────────────────────────
    const fileProvider = new FileTreeProvider_1.FileTreeProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider("ysAI.files", fileProvider));
    const gitProvider = new GitProvider_1.GitProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider("ysAI.git", gitProvider));
    const dbProvider = new DbProvider_1.DbProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider("ysAI.database", dbProvider));
    // ─── Commands ───────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand("ysAI.openChat", () => {
        vscode.commands.executeCommand("workbench.view.extension.ys-ai-container");
    }), vscode.commands.registerCommand("ysAI.newConversation", () => {
        chatProvider.clearHistory();
    }), vscode.commands.registerCommand("ysAI.explainFile", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const fileName = editor.document.fileName.split("/").pop() ?? "file";
        const content = editor.document.getText();
        chatProvider.sendMessage(`Explain this file (${fileName}):\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``, "explain");
        vscode.commands.executeCommand("workbench.view.extension.ys-ai-container");
    }), vscode.commands.registerCommand("ysAI.reviewFile", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const fileName = editor.document.fileName.split("/").pop() ?? "file";
        const content = editor.document.getText();
        chatProvider.sendMessage(`Review this file for bugs, issues and improvements (${fileName}):\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``, "review");
        vscode.commands.executeCommand("workbench.view.extension.ys-ai-container");
    }), vscode.commands.registerCommand("ysAI.fixSelection", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const selection = editor.selection;
        const selected = editor.document.getText(selection);
        if (!selected) {
            vscode.window.showWarningMessage("Select code first to fix.");
            return;
        }
        const lang = editor.document.languageId;
        chatProvider.sendMessage(`Fix this ${lang} code:\n\`\`\`${lang}\n${selected}\n\`\`\``, "fix");
        vscode.commands.executeCommand("workbench.view.extension.ys-ai-container");
    }), vscode.commands.registerCommand("ysAI.generateTests", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const fileName = editor.document.fileName.split("/").pop() ?? "file";
        const content = editor.document.getText();
        const lang = editor.document.languageId;
        chatProvider.sendMessage(`Generate comprehensive unit tests for this ${lang} file (${fileName}):\n\`\`\`${lang}\n${content.slice(0, 6000)}\n\`\`\``, "test");
        vscode.commands.executeCommand("workbench.view.extension.ys-ai-container");
    }), vscode.commands.registerCommand("ysAI.generateCommitMessage", async () => {
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "YS AI: Generating commit message…", cancellable: false }, async () => {
            try {
                const status = await companion.getGitStatus();
                const changedFiles = status.files.map((f) => `${f.status} ${f.path}`).join("\n");
                const diff = await companion.getGitDiff();
                const query = `Generate a conventional commit message for these changes:\n\nFiles changed:\n${changedFiles}\n\nDiff preview:\n${diff.diff.slice(0, 3000)}`;
                chatProvider.sendMessage(query, "commit");
                return true;
            }
            catch {
                return false;
            }
        });
        if (result) {
            vscode.commands.executeCommand("workbench.view.extension.ys-ai-container");
        }
    }), vscode.commands.registerCommand("ysAI.reindex", async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "YS AI: Re-indexing repository…", cancellable: false }, async () => {
            try {
                const result = await companion.reindexRepository();
                vscode.window.showInformationMessage(`YS AI: Repository indexed (${JSON.stringify(result.stats)})`);
            }
            catch (err) {
                vscode.window.showErrorMessage(`YS AI: Re-index failed: ${err}`);
            }
        });
    }), vscode.commands.registerCommand("ysAI.gitRefresh", () => gitProvider.refresh()), vscode.commands.registerCommand("ysAI.dbRefresh", () => dbProvider.refresh()), vscode.commands.registerCommand("ysAI.filesRefresh", () => fileProvider.refresh()));
    // ─── File save watcher (optional auto re-index) ─────────────────────────────
    const autoReindex = vscode.workspace.getConfiguration("ysAI").get("autoReindex", false);
    if (autoReindex) {
        const watcher = vscode.workspace.createFileSystemWatcher("**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,cpp,c,h}");
        context.subscriptions.push(watcher, watcher.onDidChange(() => companion.reindexRepository().catch(() => undefined)));
    }
    // ─── Check companion health ─────────────────────────────────────────────────
    checkCompanionHealth();
    setInterval(checkCompanionHealth, 30000);
}
async function checkCompanionHealth() {
    try {
        const alive = await companion.healthCheck();
        if (alive) {
            const status = await companion.getAIStatus();
            if (status.status === "ready" && status.provider) {
                statusBarItem.text = `$(sparkle) YS AI`;
                statusBarItem.tooltip = `YS AI ready — ${status.provider.name} (${status.provider.model})`;
                statusBarItem.backgroundColor = undefined;
            }
            else {
                statusBarItem.text = `$(warning) YS AI`;
                statusBarItem.tooltip = "YS AI — no AI provider configured. Set an API key.";
                statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            }
        }
        else {
            statusBarItem.text = `$(error) YS AI`;
            statusBarItem.tooltip = "YS AI companion server not responding";
            statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        }
    }
    catch {
        statusBarItem.text = `$(error) YS AI`;
        statusBarItem.tooltip = "YS AI companion server offline";
    }
}
function deactivate() {
    // nothing
}
//# sourceMappingURL=extension.js.map