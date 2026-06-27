"use strict";
/**
 * YS AI Chat View Provider
 * Implements the main sidebar webview with AI chat, file ops, git, db, Railway integration
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
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const companion = __importStar(require("../companion"));
class ChatViewProvider {
    constructor(context) {
        this.context = context;
        this._pendingMessages = [];
        // Register commands that need to target the chat view
        context.subscriptions.push(vscode.commands.registerCommand("ysAI.openGitDiff", async (filePath) => {
            await this._showGitDiff(filePath);
        }), vscode.commands.registerCommand("ysAI.dbQueryTable", async (schema, table) => {
            this._postToWebview({
                type: "db-query-result",
                payload: { schema, table, autoQuery: true },
            });
        }));
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        };
        webviewView.webview.html = this._getHtmlContent(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => this._handleMessage(message), undefined, this.context.subscriptions);
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._refreshStatus();
            }
        });
        // Flush pending messages
        for (const msg of this._pendingMessages) {
            setTimeout(() => this.sendMessage(msg.text, msg.operation), 500);
        }
        this._pendingMessages = [];
        setTimeout(() => this._refreshStatus(), 200);
    }
    sendMessage(text, operation = "chat") {
        if (!this._view || !this._view.visible) {
            this._pendingMessages.push({ text, operation });
            return;
        }
        this._postToWebview({ type: "send-message", payload: { text, operation } });
    }
    clearHistory() {
        this._postToWebview({ type: "clear-history", payload: {} });
        companion.clearHistory().catch(() => undefined);
    }
    // ─── Message handler ────────────────────────────────────────────────────────
    async _handleMessage(msg) {
        const payload = msg.payload;
        switch (msg.type) {
            case "ready":
                this._refreshStatus();
                break;
            case "chat":
                await this._handleChat(payload);
                break;
            case "stream-cancel":
                this._cancelStream?.();
                this._cancelStream = undefined;
                break;
            case "apply-files":
                await this._applyFiles(payload);
                break;
            case "show-diff":
                await this._showFileDiff(payload);
                break;
            case "open-file":
                await this._openFile(String(payload?.path ?? ""));
                break;
            case "read-file":
                await this._readFile(String(payload?.path ?? ""), String(payload?.requestId ?? ""));
                break;
            case "list-files":
                await this._listFiles(String(payload?.dir ?? "."), String(payload?.requestId ?? ""));
                break;
            case "git-status":
                await this._gitStatus(String(payload?.requestId ?? ""));
                break;
            case "git-commit":
                await this._gitCommit(String(payload?.message ?? ""), payload?.files);
                break;
            case "git-push":
                await this._gitPush();
                break;
            case "git-pull":
                await this._gitPull();
                break;
            case "git-diff":
                await this._gitDiff(payload?.file, Boolean(payload?.staged));
                break;
            case "git-checkout":
                await this._gitCheckout(String(payload?.branch ?? ""), Boolean(payload?.create));
                break;
            case "db-query":
                await this._dbQuery(String(payload?.sql ?? ""), payload?.params);
                break;
            case "db-tables":
                await this._dbTables();
                break;
            case "db-columns":
                await this._dbColumns(String(payload?.schema ?? "public"), String(payload?.table ?? ""));
                break;
            case "clear-history":
                companion.clearHistory().catch(() => undefined);
                break;
            case "get-status":
                await this._refreshStatus();
                break;
            case "run-terminal":
                await this._runTerminal(String(payload?.command ?? ""));
                break;
            case "insert-into-editor":
                await this._insertIntoEditor(String(payload?.text ?? ""));
                break;
            case "get-active-file":
                this._sendActiveFile();
                break;
            case "show-notification":
                if (payload?.level === "error") {
                    vscode.window.showErrorMessage(String(payload?.message ?? ""));
                }
                else if (payload?.level === "warning") {
                    vscode.window.showWarningMessage(String(payload?.message ?? ""));
                }
                else {
                    vscode.window.showInformationMessage(String(payload?.message ?? ""));
                }
                break;
        }
    }
    // ─── Chat / streaming ────────────────────────────────────────────────────────
    async _handleChat(payload) {
        const query = String(payload.query ?? "");
        const operation = String(payload.operation ?? "chat");
        const streaming = payload.streaming !== false;
        const language = payload.language;
        const files = payload.files;
        if (!query)
            return;
        if (!streaming) {
            try {
                const result = await companion.apiFetch("/api/ai/chat", { body: { query, operation, language, files } });
                this._postToWebview({
                    type: "chat-response",
                    payload: { output: result.output || result.error || "No response", files: result.files || [] },
                });
            }
            catch (err) {
                this._postToWebview({ type: "chat-error", payload: { error: String(err) } });
            }
            return;
        }
        // Streaming
        this._cancelStream?.();
        let accumulated = "";
        this._cancelStream = companion.apiStream("/api/ai/stream", { query, operation, language, files }, (chunk) => {
            accumulated += chunk;
            this._postToWebview({ type: "stream-chunk", payload: { chunk } });
        }, () => {
            this._postToWebview({ type: "stream-done", payload: { full: accumulated } });
            this._cancelStream = undefined;
        }, (err) => {
            this._postToWebview({ type: "stream-error", payload: { error: String(err) } });
            this._cancelStream = undefined;
        });
    }
    // ─── File operations ────────────────────────────────────────────────────────
    async _applyFiles(payload) {
        const files = payload.files;
        if (!files || files.length === 0)
            return;
        const showDiff = vscode.workspace.getConfiguration("ysAI").get("showDiffBeforeApply", true);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        for (const file of files) {
            const absPath = path.isAbsolute(file.path) ? file.path : path.join(workspaceRoot, file.path);
            const uri = vscode.Uri.file(absPath);
            if (file.action === "delete") {
                try {
                    await vscode.workspace.fs.delete(uri);
                    this._postToWebview({ type: "file-applied", payload: { path: file.path, action: "delete" } });
                }
                catch (err) {
                    this._postToWebview({ type: "file-apply-error", payload: { path: file.path, error: String(err) } });
                }
                continue;
            }
            if (showDiff && file.action === "update") {
                // Show diff then apply after confirmation
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `YS AI: Applying ${file.path}`, cancellable: true }, async (_, token) => {
                    const tmpUri = vscode.Uri.parse(`untitled:${file.path} (YS AI)`);
                    const newContent = Buffer.from(file.content, "utf-8");
                    try {
                        await vscode.workspace.fs.writeFile(uri, newContent);
                        if (!token.isCancellationRequested) {
                            this._postToWebview({ type: "file-applied", payload: { path: file.path, action: file.action } });
                        }
                    }
                    catch {
                        await vscode.commands.executeCommand("vscode.diff", tmpUri, uri, `AI Changes: ${file.path}`);
                    }
                });
            }
            else {
                try {
                    const dir = path.dirname(absPath);
                    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
                    await vscode.workspace.fs.writeFile(uri, Buffer.from(file.content, "utf-8"));
                    this._postToWebview({ type: "file-applied", payload: { path: file.path, action: file.action } });
                }
                catch (err) {
                    this._postToWebview({ type: "file-apply-error", payload: { path: file.path, error: String(err) } });
                }
            }
        }
        vscode.window.showInformationMessage(`YS AI: Applied ${files.length} file(s) successfully`);
    }
    async _showFileDiff(payload) {
        const filePath = String(payload.path ?? "");
        const newContent = String(payload.content ?? "");
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
        const originalUri = vscode.Uri.file(absPath);
        // Write new content to a virtual document for diff
        const newUri = vscode.Uri.parse(`untitled:${filePath} (AI proposed)`);
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(newUri, { ignoreIfExists: true });
        edit.insert(newUri, new vscode.Position(0, 0), newContent);
        await vscode.workspace.applyEdit(edit);
        await vscode.commands.executeCommand("vscode.diff", originalUri, newUri, `AI: ${filePath}`);
    }
    async _openFile(filePath) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        const absPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
        try {
            const uri = vscode.Uri.file(absPath);
            await vscode.window.showTextDocument(uri);
        }
        catch (err) {
            vscode.window.showErrorMessage(`Cannot open ${filePath}: ${err}`);
        }
    }
    async _readFile(filePath, requestId) {
        try {
            const result = await companion.readFile(filePath);
            this._postToWebview({ type: "file-content", payload: { requestId, path: filePath, content: result.content, language: result.language } });
        }
        catch (err) {
            this._postToWebview({ type: "file-content", payload: { requestId, path: filePath, error: String(err) } });
        }
    }
    async _listFiles(dir, requestId) {
        try {
            const result = await companion.listFiles(dir);
            this._postToWebview({ type: "file-list", payload: { requestId, dir, items: result.items } });
        }
        catch (err) {
            this._postToWebview({ type: "file-list", payload: { requestId, dir, error: String(err) } });
        }
    }
    // ─── Git operations ────────────────────────────────────────────────────────
    async _gitStatus(requestId) {
        try {
            const [status, branches] = await Promise.all([companion.getGitStatus(), companion.getGitBranches()]);
            this._postToWebview({ type: "git-status-result", payload: { requestId, status, branches: branches.branches } });
        }
        catch (err) {
            this._postToWebview({ type: "git-status-result", payload: { requestId, error: String(err) } });
        }
    }
    async _gitCommit(message, files) {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "YS AI: Committing…", cancellable: false }, async () => {
            try {
                const result = await companion.gitCommit(message, files);
                this._postToWebview({ type: "git-commit-result", payload: { success: true, output: result.output } });
                vscode.window.showInformationMessage(`Committed: ${message.slice(0, 50)}`);
                vscode.commands.executeCommand("ysAI.gitRefresh");
            }
            catch (err) {
                this._postToWebview({ type: "git-commit-result", payload: { success: false, error: String(err) } });
                vscode.window.showErrorMessage(`Commit failed: ${err}`);
            }
        });
    }
    async _gitPush() {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "YS AI: Pushing…", cancellable: false }, async () => {
            try {
                const result = await companion.gitPush();
                this._postToWebview({ type: "git-push-result", payload: { success: true, output: result.output } });
                vscode.window.showInformationMessage("Pushed successfully");
            }
            catch (err) {
                this._postToWebview({ type: "git-push-result", payload: { success: false, error: String(err) } });
                vscode.window.showErrorMessage(`Push failed: ${err}`);
            }
        });
    }
    async _gitPull() {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "YS AI: Pulling…", cancellable: false }, async () => {
            try {
                const result = await companion.gitPull();
                this._postToWebview({ type: "git-pull-result", payload: { success: true, output: result.output } });
                vscode.window.showInformationMessage("Pulled successfully");
                vscode.commands.executeCommand("ysAI.gitRefresh");
            }
            catch (err) {
                this._postToWebview({ type: "git-pull-result", payload: { success: false, error: String(err) } });
                vscode.window.showErrorMessage(`Pull failed: ${err}`);
            }
        });
    }
    async _gitDiff(file, staged = false) {
        try {
            const result = await companion.getGitDiff(file, staged);
            this._postToWebview({ type: "git-diff-result", payload: { diff: result.diff, file, staged } });
        }
        catch (err) {
            this._postToWebview({ type: "git-diff-result", payload: { error: String(err) } });
        }
    }
    async _gitCheckout(branch, create = false) {
        try {
            await companion.gitCheckout(branch, create);
            this._postToWebview({ type: "git-checkout-result", payload: { success: true, branch } });
            vscode.window.showInformationMessage(`Switched to branch: ${branch}`);
            vscode.commands.executeCommand("ysAI.gitRefresh");
        }
        catch (err) {
            this._postToWebview({ type: "git-checkout-result", payload: { success: false, error: String(err) } });
            vscode.window.showErrorMessage(`Checkout failed: ${err}`);
        }
    }
    async _showGitDiff(filePath) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
        const absPath = path.join(workspaceRoot, filePath);
        const uri = vscode.Uri.file(absPath);
        await vscode.commands.executeCommand("git.openChange", uri).then(undefined, () => vscode.window.showTextDocument(uri));
    }
    // ─── Database operations ─────────────────────────────────────────────────────
    async _dbQuery(sql, params) {
        try {
            const result = await companion.runDbQuery(sql, params);
            this._postToWebview({ type: "db-query-result", payload: result });
        }
        catch (err) {
            this._postToWebview({ type: "db-query-result", payload: { error: String(err) } });
        }
    }
    async _dbTables() {
        try {
            const result = await companion.getDbTables();
            this._postToWebview({ type: "db-tables-result", payload: result });
        }
        catch (err) {
            this._postToWebview({ type: "db-tables-result", payload: { error: String(err) } });
        }
    }
    async _dbColumns(schema, table) {
        try {
            const result = await companion.getDbColumns(schema, table);
            this._postToWebview({ type: "db-columns-result", payload: { schema, table, columns: result.columns } });
        }
        catch (err) {
            this._postToWebview({ type: "db-columns-result", payload: { error: String(err) } });
        }
    }
    // ─── Terminal ─────────────────────────────────────────────────────────────────
    async _runTerminal(command) {
        if (!command)
            return;
        const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal({ name: "YS AI" });
        terminal.show(true);
        terminal.sendText(command);
        this._postToWebview({ type: "terminal-sent", payload: { command } });
    }
    async _insertIntoEditor(text) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage("No active editor to insert into");
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        const position = editor.selection.active;
        edit.insert(editor.document.uri, position, text);
        await vscode.workspace.applyEdit(edit);
    }
    _sendActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this._postToWebview({ type: "active-file", payload: null });
            return;
        }
        this._postToWebview({
            type: "active-file",
            payload: {
                path: vscode.workspace.asRelativePath(editor.document.uri),
                language: editor.document.languageId,
                content: editor.document.getText().slice(0, 10000),
                selection: editor.document.getText(editor.selection) || null,
            },
        });
    }
    // ─── Status ───────────────────────────────────────────────────────────────────
    async _refreshStatus() {
        try {
            const status = await companion.getAIStatus();
            this._postToWebview({ type: "status", payload: status });
        }
        catch {
            this._postToWebview({ type: "status", payload: { status: "unavailable", reason: "Companion server offline" } });
        }
    }
    // ─── Helpers ──────────────────────────────────────────────────────────────────
    _postToWebview(msg) {
        this._view?.webview.postMessage(msg);
    }
    // ─── HTML generation ─────────────────────────────────────────────────────────
    _getHtmlContent(webview) {
        const nonce = getNonce();
        const mediaUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media"));
        return getWebviewHtml(nonce, mediaUri.toString());
    }
}
exports.ChatViewProvider = ChatViewProvider;
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function getWebviewHtml(nonce, mediaUri) {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${mediaUri} data:;">
<title>YS AI</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:var(--vscode-sideBar-background, #1e1e2e);
    --bg2:var(--vscode-editor-background, #1e1e2e);
    --bg3:var(--vscode-editorWidget-background, #252535);
    --fg:var(--vscode-sideBar-foreground, #cdd6f4);
    --fg2:var(--vscode-descriptionForeground, #a6adc8);
    --border:var(--vscode-panel-border, rgba(255,255,255,0.1));
    --accent:var(--vscode-button-background, #89b4fa);
    --accent-fg:var(--vscode-button-foreground, #1e1e2e);
    --input:var(--vscode-input-background, #313244);
    --input-border:var(--vscode-input-border, #45475a);
    --input-fg:var(--vscode-input-foreground, #cdd6f4);
    --btn:var(--vscode-button-background, #89b4fa);
    --btn-fg:var(--vscode-button-foreground, #1e1e2e);
    --btn-hover:var(--vscode-button-hoverBackground, #74c7ec);
    --error:var(--vscode-inputValidation-errorBorder, #f38ba8);
    --warn:var(--vscode-editorWarning-foreground, #fab387);
    --success:var(--vscode-testing-iconPassed, #a6e3a1);
    --code-bg:var(--vscode-textCodeBlock-background, #181825);
    --sel:var(--vscode-editor-selectionBackground, rgba(137,180,250,0.2));
    --font:var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    --mono:var(--vscode-editor-font-family, 'Fira Code', Consolas, monospace);
    --font-size:var(--vscode-font-size, 13px);
    --radius:4px;
  }
  html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:var(--font-size)}
  button{font-family:var(--font);cursor:pointer}
  input,textarea,select{font-family:var(--font);font-size:var(--font-size)}
  
  /* ── Layout ── */
  #app{display:flex;flex-direction:column;height:100vh;overflow:hidden}
  
  /* ── Tabs ── */
  .tabs{display:flex;border-bottom:1px solid var(--border);background:var(--bg);flex-shrink:0;overflow-x:auto;scrollbar-width:none}
  .tabs::-webkit-scrollbar{display:none}
  .tab{padding:6px 10px;border:none;background:none;color:var(--fg2);font-size:11px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;flex-shrink:0}
  .tab:hover{color:var(--fg)}
  .tab.active{color:var(--accent);border-bottom-color:var(--accent)}
  
  /* ── Views ── */
  .view{display:none;flex:1;flex-direction:column;overflow:hidden}
  .view.active{display:flex}
  
  /* ══ CHAT VIEW ══ */
  #chat-view{flex:1;flex-direction:column;overflow:hidden}
  
  .chat-toolbar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg)}
  .op-select{flex:1;background:var(--input);border:1px solid var(--input-border);color:var(--input-fg);border-radius:var(--radius);padding:4px 6px;font-size:11px;outline:none}
  .op-select:focus{border-color:var(--accent)}
  .lang-select{background:var(--input);border:1px solid var(--input-border);color:var(--input-fg);border-radius:var(--radius);padding:4px 6px;font-size:11px;outline:none;width:80px}
  .toolbar-btn{background:none;border:1px solid var(--border);color:var(--fg2);border-radius:var(--radius);padding:4px 7px;font-size:11px;display:flex;align-items:center;gap:4px}
  .toolbar-btn:hover{background:var(--bg3);color:var(--fg);border-color:var(--fg2)}
  .toolbar-btn.active{color:var(--accent);border-color:var(--accent)}
  
  .status-bar{padding:4px 8px;font-size:10px;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);flex-shrink:0}
  .status-dot{width:6px;height:6px;border-radius:50%;background:var(--fg2);flex-shrink:0}
  .status-dot.ready{background:var(--success);box-shadow:0 0 4px var(--success)}
  .status-dot.warn{background:var(--warn)}
  .status-dot.error{background:var(--error)}
  .status-text{color:var(--fg2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  
  .messages{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
  .messages::-webkit-scrollbar{width:4px}
  .messages::-webkit-scrollbar-thumb{background:var(--bg3);border-radius:2px}
  
  .welcome{display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px 16px;gap:10px;color:var(--fg2)}
  .welcome-icon{font-size:36px;opacity:.5}
  .welcome h3{color:var(--fg);font-size:14px;font-weight:600}
  .welcome p{font-size:11px;line-height:1.5;max-width:240px}
  .chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-top:4px}
  .chip{background:var(--bg3);border:1px solid var(--border);color:var(--fg2);padding:4px 8px;border-radius:12px;font-size:10px;cursor:pointer;transition:all .15s}
  .chip:hover{border-color:var(--accent);color:var(--fg)}
  
  .msg{display:flex;flex-direction:column;gap:3px;animation:fadeIn .15s ease}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .msg-role{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.5}
  .msg.user .msg-role{text-align:right;color:var(--accent)}
  .msg.assistant .msg-role{color:var(--fg2)}
  .msg-bubble{padding:8px 10px;border-radius:var(--radius);font-size:12px;line-height:1.6;word-break:break-word}
  .msg.user .msg-bubble{background:rgba(137,180,250,0.1);border:1px solid rgba(137,180,250,0.2);align-self:flex-end;max-width:90%}
  .msg.assistant .msg-bubble{background:var(--bg3);border:1px solid var(--border);max-width:100%}
  .msg-bubble p{margin:0 0 6px}
  .msg-bubble p:last-child{margin:0}
  .msg-bubble h1,.msg-bubble h2,.msg-bubble h3{font-size:12px;font-weight:700;margin:8px 0 4px;color:var(--fg)}
  .msg-bubble ul,.msg-bubble ol{padding-left:16px;margin:4px 0}
  .msg-bubble li{margin:2px 0}
  .msg-bubble strong{color:var(--fg)}
  .msg-bubble em{font-style:italic;color:var(--fg2)}
  .msg-bubble code{background:var(--code-bg);padding:1px 4px;border-radius:3px;font-family:var(--mono);font-size:11px;color:#cba6f7}
  
  /* Code blocks */
  .code-block{margin:6px 0;border-radius:var(--radius);overflow:hidden;border:1px solid var(--border)}
  .code-header{display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:rgba(255,255,255,.04);border-bottom:1px solid var(--border)}
  .code-lang{font-size:10px;color:var(--fg2);font-family:var(--mono)}
  .code-actions{display:flex;gap:4px}
  .code-btn{background:none;border:1px solid var(--border);color:var(--fg2);border-radius:3px;padding:2px 6px;font-size:10px;transition:all .12s}
  .code-btn:hover{background:var(--bg3);color:var(--fg);border-color:var(--fg2)}
  .code-btn.apply{color:var(--success);border-color:var(--success)}
  .code-btn.apply:hover{background:rgba(166,227,161,.1)}
  .code-pre{padding:8px 10px;overflow-x:auto;background:var(--code-bg);margin:0}
  .code-pre code{font-family:var(--mono);font-size:11px;color:#e2e8f0;white-space:pre}
  
  /* File pills */
  .file-pills{display:flex;flex-wrap:wrap;gap:4px;padding:4px 8px;border-top:1px solid var(--border);background:var(--bg)}
  .file-pill{display:flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:2px 8px;font-size:10px;color:var(--fg2)}
  .file-pill button{background:none;border:none;color:var(--fg2);cursor:pointer;font-size:10px;padding:0;line-height:1}
  .file-pill button:hover{color:var(--error)}
  
  /* Typing indicator */
  .typing{display:inline-flex;gap:3px;align-items:center;padding:2px 0}
  .typing span{width:5px;height:5px;background:var(--fg2);border-radius:50%;animation:bounce .8s infinite}
  .typing span:nth-child(2){animation-delay:.15s}
  .typing span:nth-child(3){animation-delay:.3s}
  @keyframes bounce{0%,80%,100%{transform:scale(.7);opacity:.4}40%{transform:scale(1);opacity:1}}
  .cursor{display:inline-block;width:1px;height:1em;background:var(--fg2);margin-left:2px;animation:blink .6s step-end infinite}
  @keyframes blink{50%{opacity:0}}
  
  /* Input area */
  .input-area{border-top:1px solid var(--border);padding:8px;background:var(--bg);flex-shrink:0}
  .input-row{display:flex;gap:6px;align-items:flex-end}
  .input-box{flex:1;background:var(--input);border:1px solid var(--input-border);color:var(--input-fg);border-radius:var(--radius);padding:6px 8px;font-size:12px;resize:none;outline:none;min-height:36px;max-height:150px;font-family:var(--font);line-height:1.5}
  .input-box:focus{border-color:var(--accent)}
  .input-box::placeholder{color:var(--fg2);opacity:.6}
  .send-btn{width:32px;height:32px;background:var(--btn);border:none;border-radius:var(--radius);color:var(--btn-fg);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;transition:background .12s}
  .send-btn:hover{background:var(--btn-hover)}
  .send-btn:disabled{opacity:.4;cursor:default}
  .send-btn.stop{background:var(--error)}
  .input-hint{text-align:center;font-size:10px;color:var(--fg2);opacity:.5;margin-top:4px}
  
  /* ══ GIT VIEW ══ */
  #git-view{overflow:hidden}
  .git-toolbar{display:flex;gap:5px;padding:8px;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap}
  .git-btn{background:var(--bg3);border:1px solid var(--border);color:var(--fg2);border-radius:var(--radius);padding:4px 10px;font-size:11px;transition:all .12s}
  .git-btn:hover{background:var(--input);color:var(--fg);border-color:var(--fg2)}
  .git-btn.primary{background:var(--btn);border-color:var(--btn);color:var(--btn-fg)}
  .git-btn.primary:hover{background:var(--btn-hover)}
  .git-content{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
  .git-section{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
  .git-section-header{padding:6px 10px;font-size:11px;font-weight:600;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;cursor:pointer}
  .git-section-header:hover{background:rgba(255,255,255,.03)}
  .git-file{display:flex;align-items:center;gap:6px;padding:4px 10px;font-size:11px;cursor:pointer;transition:background .1s}
  .git-file:hover{background:rgba(255,255,255,.05)}
  .git-file-status{font-family:var(--mono);font-size:10px;width:16px;text-align:center;flex-shrink:0;font-weight:700}
  .git-file-status.M{color:#fab387}.git-file-status.A{color:#a6e3a1}.git-file-status.D{color:#f38ba8}.git-file-status.R{color:#89b4fa}.git-file-status.q{color:#a6adc8}
  .git-file-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg)}
  .commit-msg-area{padding:8px;display:flex;flex-direction:column;gap:5px}
  .commit-input{background:var(--input);border:1px solid var(--input-border);color:var(--input-fg);border-radius:var(--radius);padding:6px 8px;font-size:12px;resize:none;outline:none;min-height:56px;font-family:var(--font)}
  .commit-input:focus{border-color:var(--accent)}
  .log-item{padding:5px 10px;font-size:11px;border-bottom:1px solid var(--border);cursor:pointer}
  .log-item:hover{background:rgba(255,255,255,.03)}
  .log-hash{font-family:var(--mono);font-size:10px;color:var(--accent)}
  .log-msg{color:var(--fg);margin:1px 0}
  .log-meta{color:var(--fg2);font-size:10px}
  
  /* ══ DB VIEW ══ */
  #db-view{overflow:hidden}
  .db-toolbar{display:flex;gap:5px;padding:8px;border-bottom:1px solid var(--border);flex-shrink:0;align-items:center}
  .db-status-indicator{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--fg2);flex:1}
  .db-content{flex:1;overflow:hidden;display:flex;flex-direction:column}
  .query-area{padding:8px;border-bottom:1px solid var(--border);flex-shrink:0}
  .query-input{width:100%;background:var(--code-bg);border:1px solid var(--input-border);color:#e2e8f0;border-radius:var(--radius);padding:6px 8px;font-size:11px;font-family:var(--mono);resize:none;outline:none;min-height:60px}
  .query-input:focus{border-color:var(--accent)}
  .query-actions{display:flex;gap:5px;margin-top:5px}
  .result-area{flex:1;overflow-y:auto;padding:8px}
  .result-table{width:100%;border-collapse:collapse;font-size:11px;font-family:var(--mono)}
  .result-table th{padding:4px 8px;text-align:left;border-bottom:1px solid var(--border);font-size:10px;color:var(--fg2);font-weight:600;white-space:nowrap}
  .result-table td{padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.04);color:var(--fg);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .result-table tr:hover td{background:rgba(255,255,255,.03)}
  .result-meta{font-size:10px;color:var(--fg2);padding:4px 0;margin-top:4px}
  .result-error{color:var(--error);font-size:11px;background:rgba(243,139,168,.1);border:1px solid var(--error);border-radius:var(--radius);padding:6px 8px;font-family:var(--mono)}
  .table-list{padding:0;list-style:none}
  .table-item{padding:4px 10px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid rgba(255,255,255,.04)}
  .table-item:hover{background:rgba(255,255,255,.03)}
  
  /* ══ FILES VIEW ══ */
  #files-view{overflow:hidden}
  .files-toolbar{display:flex;gap:5px;padding:8px;border-bottom:1px solid var(--border);flex-shrink:0}
  .files-content{flex:1;overflow-y:auto;padding:4px}
  .file-entry{display:flex;align-items:center;gap:5px;padding:3px 6px;font-size:11px;cursor:pointer;border-radius:var(--radius);transition:background .1s}
  .file-entry:hover{background:rgba(255,255,255,.06)}
  .file-entry.dir{color:var(--fg);font-weight:500}
  .file-entry.file{color:var(--fg2)}
  .file-entry-icon{width:14px;text-align:center;flex-shrink:0;font-size:12px}
  .file-entry-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .file-entry-size{font-size:10px;color:var(--fg2);opacity:.7}
  .breadcrumb{display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--border);font-size:11px;flex-wrap:wrap}
  .breadcrumb-seg{color:var(--accent);cursor:pointer}
  .breadcrumb-seg:hover{text-decoration:underline}
  .breadcrumb-sep{color:var(--fg2);opacity:.5}
  
  /* ══ SETTINGS VIEW ══ */
  #settings-view{overflow-y:auto}
  .settings-content{padding:12px}
  .setting-group{margin-bottom:16px}
  .setting-group-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--fg2);margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)}
  .setting-row{margin-bottom:8px}
  .setting-label{font-size:11px;color:var(--fg);margin-bottom:3px}
  .setting-desc{font-size:10px;color:var(--fg2);margin-top:2px;line-height:1.4}
  .setting-input{width:100%;background:var(--input);border:1px solid var(--input-border);color:var(--input-fg);border-radius:var(--radius);padding:5px 7px;font-size:12px;outline:none}
  .setting-input:focus{border-color:var(--accent)}
  .setting-toggle{display:flex;align-items:center;gap:8px;cursor:pointer}
  .toggle-switch{width:28px;height:16px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;position:relative;transition:background .2s;flex-shrink:0}
  .toggle-switch.on{background:var(--accent)}
  .toggle-switch::after{content:'';width:10px;height:10px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:left .2s}
  .toggle-switch.on::after{left:14px}
  .provider-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;margin-bottom:6px}
  .provider-card-name{font-size:11px;font-weight:600;color:var(--fg)}
  .provider-card-status{font-size:10px;margin-top:2px}
  .provider-card-status.ok{color:var(--success)}
  .provider-card-status.miss{color:var(--warn)}
  
  /* ══ SHARED ══ */
  .empty{padding:20px;text-align:center;font-size:11px;color:var(--fg2);opacity:.6}
  .badge{display:inline-block;padding:1px 5px;border-radius:8px;font-size:9px;font-weight:700;background:var(--accent);color:var(--btn-fg)}
  .loading-spin{animation:spin 1s linear infinite;display:inline-block}
  @keyframes spin{to{transform:rotate(360deg)}}
  .diff-preview{font-family:var(--mono);font-size:11px;padding:8px;background:var(--code-bg);border-radius:var(--radius);overflow-x:auto;white-space:pre;max-height:300px;overflow-y:auto;border:1px solid var(--border)}
  .diff-add{color:#a6e3a1;background:rgba(166,227,161,.1)}
  .diff-del{color:#f38ba8;background:rgba(243,139,168,.1)}
  .diff-hunk{color:var(--accent);opacity:.7}
</style>
</head>
<body>
<div id="app">
  <!-- ── Tabs ── -->
  <div class="tabs" id="tabs">
    <button class="tab active" data-view="chat">⚡ Chat</button>
    <button class="tab" data-view="git">⎇ Git</button>
    <button class="tab" data-view="db">🗄 DB</button>
    <button class="tab" data-view="files">📁 Files</button>
    <button class="tab" data-view="settings">⚙ Settings</button>
  </div>

  <!-- ══ CHAT VIEW ══ -->
  <div class="view active" id="chat-view">
    <div class="status-bar">
      <div class="status-dot" id="statusDot"></div>
      <span class="status-text" id="statusText">Connecting…</span>
    </div>
    <div class="chat-toolbar">
      <select class="op-select" id="opSelect">
        <option value="chat">💬 Chat</option>
        <option value="generate">✨ Generate</option>
        <option value="refactor">🔄 Refactor</option>
        <option value="review">👁 Review</option>
        <option value="fix">🔧 Fix</option>
        <option value="debug">🐛 Debug</option>
        <option value="explain">❓ Explain</option>
        <option value="test">✅ Tests</option>
        <option value="document">📝 Document</option>
        <option value="commit">📦 Commit</option>
        <option value="plan">📋 Plan</option>
      </select>
      <select class="lang-select" id="langSelect">
        <option value="">Auto</option>
        <option value="typescript">TS</option>
        <option value="javascript">JS</option>
        <option value="python">Py</option>
        <option value="rust">Rust</option>
        <option value="go">Go</option>
        <option value="sql">SQL</option>
        <option value="shell">Shell</option>
      </select>
      <button class="toolbar-btn active" id="streamToggle" title="Toggle streaming">⚡</button>
      <button class="toolbar-btn" id="ctxBtn" title="Add file context">📎</button>
      <button class="toolbar-btn" id="clearBtn" title="New conversation">🗑</button>
    </div>
    <div class="file-pills" id="filePills" style="display:none"></div>
    <div class="messages" id="messages">
      <div class="welcome">
        <div class="welcome-icon">⚡</div>
        <h3>YS AI Assistant</h3>
        <p>Powered by YS-Servece-Code. Ask me to generate, review, fix, or explain your code.</p>
        <div class="chips">
          <div class="chip" data-text="Review the current file for bugs and improvements" data-op="review">Review file</div>
          <div class="chip" data-text="Generate TypeScript Express REST API with CRUD" data-op="generate">Generate API</div>
          <div class="chip" data-text="Explain the current file" data-op="explain">Explain file</div>
          <div class="chip" data-text="Generate unit tests" data-op="test">Write tests</div>
          <div class="chip" data-text="Create a commit message for my staged changes" data-op="commit">Commit msg</div>
          <div class="chip" data-text="Debug this error and suggest a fix" data-op="debug">Debug error</div>
        </div>
      </div>
    </div>
    <div class="input-area">
      <div class="input-row">
        <textarea class="input-box" id="msgInput" rows="1" placeholder="Ask anything… (Ctrl+Enter to send)"></textarea>
        <button class="send-btn" id="sendBtn" title="Send">▶</button>
      </div>
      <div class="input-hint">Ctrl+Enter send · Shift+Enter newline · Drag file to add context</div>
    </div>
  </div>

  <!-- ══ GIT VIEW ══ -->
  <div class="view" id="git-view">
    <div class="git-toolbar">
      <button class="git-btn primary" id="gitCommitBtn">Commit</button>
      <button class="git-btn" id="gitPushBtn">Push</button>
      <button class="git-btn" id="gitPullBtn">Pull</button>
      <button class="git-btn" id="gitRefreshBtn">↻ Refresh</button>
      <button class="git-btn" id="gitAiMsgBtn">🤖 AI Msg</button>
    </div>
    <div class="git-content" id="gitContent">
      <div class="empty">Loading git status…</div>
    </div>
    <div class="commit-msg-area">
      <textarea class="commit-input" id="commitMsgInput" placeholder="Commit message… (or click 🤖 to generate)"></textarea>
      <div style="display:flex;gap:5px">
        <button class="git-btn primary" id="doCommitBtn" style="flex:1">✓ Commit All</button>
        <button class="git-btn" id="doCommitSelectedBtn">Commit Selected</button>
      </div>
    </div>
  </div>

  <!-- ══ DB VIEW ══ -->
  <div class="view" id="db-view">
    <div class="db-toolbar">
      <div class="db-status-indicator">
        <div class="status-dot" id="dbStatusDot"></div>
        <span id="dbStatusText">Checking…</span>
      </div>
      <button class="git-btn" id="dbRefreshBtn">↻</button>
    </div>
    <div class="db-content">
      <div class="query-area">
        <textarea class="query-input" id="queryInput" placeholder="SELECT * FROM table LIMIT 10;"></textarea>
        <div class="query-actions">
          <button class="git-btn primary" id="runQueryBtn">▶ Run (Ctrl+Enter)</button>
          <button class="git-btn" id="clearQueryBtn">Clear</button>
          <span id="queryMeta" style="font-size:10px;color:var(--fg2);align-self:center;margin-left:auto"></span>
        </div>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;flex-direction:column">
        <div style="display:flex;border-bottom:1px solid var(--border)">
          <button class="tab active" data-db-tab="results" style="font-size:10px;padding:4px 8px">Results</button>
          <button class="tab" data-db-tab="tables" style="font-size:10px;padding:4px 8px">Tables</button>
        </div>
        <div class="result-area" id="resultsPane"></div>
        <div class="result-area" id="tablesPane" style="display:none"></div>
      </div>
    </div>
  </div>

  <!-- ══ FILES VIEW ══ -->
  <div class="view" id="files-view">
    <div class="files-toolbar">
      <button class="git-btn" id="filesRefreshBtn">↻ Refresh</button>
      <button class="git-btn" id="filesHomeBtn">⌂ Root</button>
    </div>
    <div class="breadcrumb" id="filesBreadcrumb">
      <span class="breadcrumb-seg" data-path=".">workspace</span>
    </div>
    <div class="files-content" id="filesContent">
      <div class="empty">Loading files…</div>
    </div>
  </div>

  <!-- ══ SETTINGS VIEW ══ -->
  <div class="view" id="settings-view">
    <div class="settings-content">
      <div class="setting-group">
        <div class="setting-group-title">AI Provider</div>
        <div id="providerCards"></div>
        <div class="setting-desc" style="margin-top:6px">Set API keys as environment variables and restart the companion server.</div>
      </div>
      <div class="setting-group">
        <div class="setting-group-title">Preferences</div>
        <div class="setting-row">
          <label class="setting-toggle" id="streamingToggle">
            <div class="toggle-switch on" id="streamingSwitch"></div>
            <span class="setting-label">Enable streaming</span>
          </label>
          <div class="setting-desc">Stream AI responses token by token</div>
        </div>
        <div class="setting-row">
          <label class="setting-toggle" id="diffToggle">
            <div class="toggle-switch on" id="diffSwitch"></div>
            <span class="setting-label">Show diff before applying</span>
          </label>
          <div class="setting-desc">Preview changes before writing files</div>
        </div>
        <div class="setting-row">
          <div class="setting-label">Companion port</div>
          <input class="setting-input" id="portInput" type="number" value="3001" min="1000" max="65535">
          <div class="setting-desc">Port where the companion server runs</div>
        </div>
      </div>
      <div class="setting-group">
        <div class="setting-group-title">Actions</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="git-btn" id="reindexBtn">↺ Re-index Repository</button>
          <button class="git-btn" id="clearAllHistoryBtn">🗑 Clear All History</button>
        </div>
      </div>
    </div>
  </div>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const state = vscode.getState() || {};

// ─── Message bus ────────────────────────────────────────────────────────────

function post(type, payload) { vscode.postMessage({ type, payload }); }

window.addEventListener('message', e => {
  const { type, payload } = e.data;
  switch (type) {
    case 'status':         handleStatus(payload); break;
    case 'send-message':   queueMessage(payload.text, payload.operation); break;
    case 'stream-chunk':   handleChunk(payload.chunk); break;
    case 'stream-done':    handleStreamDone(payload.full); break;
    case 'stream-error':   handleStreamError(payload.error); break;
    case 'chat-response':  handleChatResponse(payload); break;
    case 'chat-error':     handleChatError(payload.error); break;
    case 'file-applied':   showNotif(\`Applied: \${payload.path}\`, 'success'); break;
    case 'file-apply-error': showNotif(\`Failed: \${payload.path} — \${payload.error}\`, 'error'); break;
    case 'git-status-result': handleGitStatus(payload); break;
    case 'git-commit-result': handleGitCommitResult(payload); break;
    case 'git-push-result':
    case 'git-pull-result':   showNotif(payload.success ? payload.output : payload.error, payload.success ? 'success' : 'error'); break;
    case 'git-checkout-result': showNotif(payload.success ? \`Switched to \${payload.branch}\` : payload.error, payload.success ? 'success' : 'error'); break;
    case 'git-diff-result':   handleGitDiff(payload); break;
    case 'db-query-result':   handleDbResult(payload); break;
    case 'db-tables-result':  handleDbTables(payload); break;
    case 'db-columns-result': handleDbColumns(payload); break;
    case 'file-list':         handleFileList(payload); break;
    case 'file-content':      handleFileContent(payload); break;
    case 'active-file':       handleActiveFile(payload); break;
    case 'clear-history':     clearConversation(); break;
    case 'terminal-sent':     showNotif(\`Terminal: \${payload.command}\`, 'success'); break;
  }
});

// ─── Tab navigation ──────────────────────────────────────────────────────────

document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('[data-view]');
  if (!btn) return;
  const view = btn.dataset.view;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(view + '-view').classList.add('active');
  if (view === 'git') loadGit();
  if (view === 'db') loadDb();
  if (view === 'files') loadFiles('.');
  if (view === 'settings') loadSettings();
});

// ─── Status ──────────────────────────────────────────────────────────────────

function handleStatus(s) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (s.status === 'ready') {
    dot.className = 'status-dot ready';
    txt.textContent = s.provider ? \`\${s.provider.name} · \${s.provider.model}\` : 'Ready';
    updateProviderCards(s);
  } else if (s.status === 'no-provider') {
    dot.className = 'status-dot warn';
    txt.textContent = 'No provider — set API key';
    updateProviderCards(s);
  } else {
    dot.className = 'status-dot error';
    txt.textContent = s.reason || 'Companion offline';
  }
}

// ─── CHAT ───────────────────────────────────────────────────────────────────

let streaming = true;
let isLoading = false;
let streamBuffer = '';
let streamEl = null;
let contextFiles = [];

const messagesEl = document.getElementById('messages');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');

document.getElementById('streamToggle').addEventListener('click', function() {
  streaming = !streaming;
  this.classList.toggle('active', streaming);
  this.title = streaming ? 'Streaming ON' : 'Streaming OFF';
});

document.getElementById('clearBtn').addEventListener('click', clearConversation);

document.getElementById('ctxBtn').addEventListener('click', () => {
  post('get-active-file', {});
});

// Chip suggestions
messagesEl.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  msgInput.value = chip.dataset.text;
  if (chip.dataset.op) document.getElementById('opSelect').value = chip.dataset.op;
  autoResizeInput();
  sendMessage();
});

// Code block buttons
messagesEl.addEventListener('click', e => {
  const btn = e.target.closest('.code-btn');
  if (!btn) return;
  const block = btn.closest('.code-block');
  const code = block.querySelector('code').textContent;
  const lang = block.dataset.lang || '';
  if (btn.classList.contains('copy')) {
    navigator.clipboard.writeText(code).then(() => { btn.textContent = '✓'; setTimeout(() => btn.textContent = 'Copy', 1500); });
  } else if (btn.classList.contains('apply')) {
    // Try to apply as file change
    post('insert-into-editor', { text: code });
    btn.textContent = '✓ Inserted';
    setTimeout(() => btn.textContent = 'Apply', 1500);
  } else if (btn.classList.contains('terminal')) {
    post('run-terminal', { command: code });
  }
});

msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMessage(); }
});
msgInput.addEventListener('input', autoResizeInput);
sendBtn.addEventListener('click', () => {
  if (isLoading) { post('stream-cancel', {}); setLoading(false); }
  else sendMessage();
});

function autoResizeInput() {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 150) + 'px';
}

function queueMessage(text, op) {
  document.getElementById('opSelect').value = op || 'chat';
  msgInput.value = text;
  autoResizeInput();
  setTimeout(sendMessage, 100);
}

function sendMessage() {
  const query = msgInput.value.trim();
  if (!query || isLoading) return;
  const op = document.getElementById('opSelect').value;
  const lang = document.getElementById('langSelect').value;

  removeWelcome();
  appendMessage('user', query);
  msgInput.value = '';
  autoResizeInput();
  setLoading(true);
  streamBuffer = '';
  streamEl = appendMessage('assistant', null, true);

  post('chat', { query, operation: op, language: lang || undefined, streaming, files: contextFiles.map(f => f.path) });
}

function handleChunk(chunk) {
  streamBuffer += chunk;
  if (streamEl) {
    streamEl.querySelector('.msg-bubble').innerHTML = renderMarkdown(streamBuffer) + '<span class="cursor"></span>';
    scrollToBottom();
  }
}

function handleStreamDone(full) {
  if (streamEl) {
    streamEl.querySelector('.msg-bubble').innerHTML = renderMarkdown(streamBuffer || full || '');
    attachCodeActions(streamEl);
  }
  streamEl = null; streamBuffer = '';
  setLoading(false);
}

function handleStreamError(error) {
  if (streamEl) streamEl.querySelector('.msg-bubble').innerHTML = \`<span style="color:var(--error)">Error: \${escHtml(error)}</span>\`;
  streamEl = null; streamBuffer = '';
  setLoading(false);
}

function handleChatResponse(payload) {
  if (streamEl) {
    streamEl.querySelector('.msg-bubble').innerHTML = renderMarkdown(payload.output || 'No response.');
    attachCodeActions(streamEl);
    streamEl = null;
  }
  setLoading(false);
  if (payload.files && payload.files.length > 0) {
    showFilesProposal(payload.files);
  }
}

function handleChatError(error) {
  if (streamEl) {
    streamEl.querySelector('.msg-bubble').innerHTML = \`<span style="color:var(--error)">Error: \${escHtml(error)}</span>\`;
    streamEl = null;
  }
  setLoading(false);
}

function appendMessage(role, text, loading) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const roleLabel = role === 'user' ? 'You' : 'YS AI';
  if (loading) {
    div.innerHTML = \`<div class="msg-role">\${roleLabel}</div><div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>\`;
  } else {
    div.innerHTML = \`<div class="msg-role">\${roleLabel}</div><div class="msg-bubble">\${renderMarkdown(text || '')}</div>\`;
    attachCodeActions(div);
  }
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function showFilesProposal(files) {
  const div = document.createElement('div');
  div.style.cssText = 'padding:8px;background:rgba(137,180,250,.06);border:1px solid rgba(137,180,250,.2);border-radius:4px;font-size:11px;margin:4px 0';
  div.innerHTML = \`<div style="margin-bottom:6px;font-weight:600;color:var(--accent)">📄 \${files.length} file(s) proposed</div>\` +
    files.map(f => \`<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0">
      <span style="color:var(--fg)">\${escHtml(f.path)}</span>
      <div style="display:flex;gap:4px">
        <button class="code-btn" onclick="previewFile('\${escHtml(f.path)}',\${JSON.stringify(f.content).replace(/'/g,'\\\\'')})" style="font-size:9px">Preview</button>
        <button class="code-btn apply" onclick="applyFile('\${escHtml(f.path)}',\${JSON.stringify(f.content).replace(/'/g,'\\\\'')},'\${escHtml(f.action)}')" style="font-size:9px">Apply</button>
      </div>
    </div>\`).join('');
  messagesEl.appendChild(div);
  scrollToBottom();
}

function applyFile(path, content, action) {
  post('apply-files', { files: [{ path, content, action }] });
}

function previewFile(path, content) {
  post('show-diff', { path, content });
}

function clearConversation() {
  messagesEl.innerHTML = \`<div class="welcome">
    <div class="welcome-icon">⚡</div>
    <h3>YS AI Assistant</h3>
    <p>Ask me to generate, review, fix, or explain your code.</p>
    <div class="chips">
      <div class="chip" data-text="Review the current file for bugs and improvements" data-op="review">Review file</div>
      <div class="chip" data-text="Generate TypeScript Express REST API with CRUD" data-op="generate">Generate API</div>
      <div class="chip" data-text="Explain the current file" data-op="explain">Explain file</div>
      <div class="chip" data-text="Generate unit tests" data-op="test">Write tests</div>
      <div class="chip" data-text="Create a commit message for my staged changes" data-op="commit">Commit msg</div>
    </div>
  </div>\`;
  post('clear-history', {});
  contextFiles = [];
  renderFilePills();
}

function setLoading(v) {
  isLoading = v;
  sendBtn.classList.toggle('stop', v);
  sendBtn.textContent = v ? '⏹' : '▶';
  msgInput.disabled = v;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeWelcome() {
  const w = messagesEl.querySelector('.welcome');
  if (w) w.remove();
}

// Context files
function handleActiveFile(info) {
  if (!info) return showNotif('No active file', 'warn');
  if (!contextFiles.find(f => f.path === info.path)) {
    contextFiles.push({ path: info.path, language: info.language });
    renderFilePills();
  }
}

function renderFilePills() {
  const pills = document.getElementById('filePills');
  if (contextFiles.length === 0) { pills.style.display = 'none'; return; }
  pills.style.display = 'flex';
  pills.innerHTML = contextFiles.map((f, i) => \`
    <div class="file-pill">
      <span>📄 \${f.path.split('/').pop()}</span>
      <button onclick="removeContext(\${i})">×</button>
    </div>\`).join('');
}

function removeContext(i) {
  contextFiles.splice(i, 1);
  renderFilePills();
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return '';
  // Code blocks
  text = text.replace(/\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/g, (_, lang, code) => {
    const escaped = escHtml(code.trimEnd());
    const isShell = ['bash','sh','shell','zsh'].includes(lang.toLowerCase());
    return \`<div class="code-block" data-lang="\${lang}">
      <div class="code-header">
        <span class="code-lang">\${lang || 'code'}</span>
        <div class="code-actions">
          \${isShell ? \`<button class="code-btn terminal" title="Run in terminal">▶ Run</button>\` : ''}
          <button class="code-btn apply" title="Insert into editor">Insert</button>
          <button class="code-btn copy" title="Copy to clipboard">Copy</button>
        </div>
      </div>
      <pre class="code-pre"><code>\${escaped}</code></pre>
    </div>\`;
  });
  // Inline code
  text = text.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
  // Headers
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Lists
  text = text.replace(/^[\\-*] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>');
  // Paragraphs
  text = text.split('\\n\\n').map(p => p.trim() ? \`<p>\${p}</p>\` : '').join('');
  return text || text;
}

function attachCodeActions(el) {
  // Code blocks already have inline onclick, nothing extra needed
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── GIT VIEW ────────────────────────────────────────────────────────────────

let gitFiles = [];

function loadGit() {
  document.getElementById('gitContent').innerHTML = '<div class="empty"><span class="loading-spin">⟳</span> Loading…</div>';
  post('git-status', { requestId: 'git-init' });
}

function handleGitStatus(payload) {
  if (payload.error) {
    document.getElementById('gitContent').innerHTML = \`<div class="empty" style="color:var(--error)">\${escHtml(payload.error)}</div>\`;
    return;
  }
  const { status, branches } = payload;
  gitFiles = status.files || [];
  const current = branches?.find(b => b.current);
  const otherBranches = branches?.filter(b => !b.current) || [];

  let html = '';

  // Branch info + switcher
  html += \`<div class="git-section">
    <div class="git-section-header">⎇ Branch: <strong>\${escHtml(status.branch)}</strong>
      \${otherBranches.length > 0 ? \`<select onchange="switchBranch(this.value)" style="background:var(--input);border:1px solid var(--border);color:var(--fg);border-radius:3px;font-size:10px;padding:2px 4px">
        <option value="">Switch…</option>
        \${otherBranches.map(b => \`<option value="\${escHtml(b.name)}">\${escHtml(b.name)}</option>\`).join('')}
      </select>\` : ''}
    </div>
  </div>\`;

  // Changed files
  html += \`<div class="git-section">
    <div class="git-section-header">Changes <span class="badge">\${gitFiles.length}</span></div>
    \${gitFiles.length === 0
      ? '<div class="empty">No changes</div>'
      : gitFiles.map((f, i) => {
          const st = f.status === '??' ? '?' : f.status;
          const cls = {M:'M',A:'A',D:'D',R:'R','?':'q'}[st] || '';
          return \`<div class="git-file" onclick="selectGitFile(\${i})">
            <span class="git-file-status \${cls}">\${escHtml(st)}</span>
            <span class="git-file-path">\${escHtml(f.path)}</span>
          </div>\`;
        }).join('')}
  </div>\`;

  document.getElementById('gitContent').innerHTML = html;
}

function selectGitFile(i) {
  const f = gitFiles[i];
  if (f) post('git-diff', { file: f.path });
}

function switchBranch(name) {
  if (name) post('git-checkout', { branch: name });
}

function handleGitCommitResult(payload) {
  if (payload.success) {
    document.getElementById('commitMsgInput').value = '';
    loadGit();
    showNotif('Committed successfully', 'success');
  } else {
    showNotif('Commit failed: ' + payload.error, 'error');
  }
}

function handleGitDiff(payload) {
  if (payload.error) { showNotif('Diff error: ' + payload.error, 'error'); return; }
  if (!payload.diff) { showNotif('No diff available', 'info'); return; }
  // Show diff in a message in chat
  const lines = payload.diff.split('\\n').map(l => {
    const esc = escHtml(l);
    if (l.startsWith('+') && !l.startsWith('+++')) return \`<span class="diff-add">\${esc}</span>\`;
    if (l.startsWith('-') && !l.startsWith('---')) return \`<span class="diff-del">\${esc}</span>\`;
    if (l.startsWith('@@')) return \`<span class="diff-hunk">\${esc}</span>\`;
    return esc;
  }).join('\\n');
  const div = document.createElement('div');
  div.style.cssText = 'padding:8px';
  div.innerHTML = \`<div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--fg2)">Diff: \${escHtml(payload.file || '')}</div>
    <div class="diff-preview">\${lines}</div>\`;
  document.getElementById('gitContent').insertAdjacentElement('afterend', div);
}

document.getElementById('gitRefreshBtn').addEventListener('click', loadGit);
document.getElementById('gitPushBtn').addEventListener('click', () => post('git-push', {}));
document.getElementById('gitPullBtn').addEventListener('click', () => post('git-pull', {}));
document.getElementById('gitAiMsgBtn').addEventListener('click', () => {
  // Switch to chat and generate commit msg
  document.querySelector('[data-view="chat"]').click();
  queueMessage('Generate a conventional commit message for my current staged changes', 'commit');
});
document.getElementById('gitCommitBtn').addEventListener('click', () => {
  document.getElementById('doCommitBtn').scrollIntoView();
});
document.getElementById('doCommitBtn').addEventListener('click', () => {
  const msg = document.getElementById('commitMsgInput').value.trim();
  if (!msg) { showNotif('Enter a commit message', 'warn'); return; }
  post('git-commit', { message: msg });
});
document.getElementById('doCommitSelectedBtn').addEventListener('click', () => {
  const msg = document.getElementById('commitMsgInput').value.trim();
  if (!msg) { showNotif('Enter a commit message', 'warn'); return; }
  const selected = gitFiles.map(f => f.path);
  post('git-commit', { message: msg, files: selected });
});

// ─── DB VIEW ─────────────────────────────────────────────────────────────────

let dbTables = [];

function loadDb() {
  post('db-tables', {});
  document.getElementById('dbStatusDot').className = 'status-dot';
  document.getElementById('dbStatusText').textContent = 'Checking…';
  companion_getDbStatus();
}

function companion_getDbStatus() {
  // we'll rely on the db-tables-result to infer status
}

function handleDbResult(payload) {
  const resultsPane = document.getElementById('resultsPane');
  if (payload.autoQuery) {
    // Auto query from tree click
    document.getElementById('queryInput').value = \`SELECT * FROM "\${payload.schema}".\${JSON.stringify(payload.table)} LIMIT 50;\`;
    post('db-query', { sql: document.getElementById('queryInput').value });
    return;
  }
  if (payload.error) {
    resultsPane.innerHTML = \`<div class="result-error">\${escHtml(payload.error)}</div>\`;
    return;
  }
  const { rows, rowCount, fields, duration } = payload;
  if (!rows || rows.length === 0) {
    resultsPane.innerHTML = \`<div class="empty">No rows returned</div><div class="result-meta">\${rowCount || 0} rows · \${duration || 0}ms</div>\`;
    return;
  }
  const cols = fields?.map(f => f.name) || Object.keys(rows[0]);
  let html = \`<table class="result-table">
    <thead><tr>\${cols.map(c => \`<th>\${escHtml(c)}</th>\`).join('')}</tr></thead>
    <tbody>\${rows.slice(0, 500).map(row => \`<tr>\${cols.map(c => \`<td title="\${escHtml(String(row[c] ?? ''))}">\${escHtml(String(row[c] ?? ''))}</td>\`).join('')}</tr>\`).join('')}</tbody>
  </table>\`;
  resultsPane.innerHTML = html;
  document.getElementById('queryMeta').textContent = \`\${rowCount} rows · \${duration}ms\`;
}

function handleDbTables(payload) {
  const tablesPane = document.getElementById('tablesPane');
  if (payload.error) {
    document.getElementById('dbStatusDot').className = 'status-dot error';
    document.getElementById('dbStatusText').textContent = 'Disconnected';
    tablesPane.innerHTML = \`<div class="result-error">\${escHtml(payload.error)}</div>\`;
    return;
  }
  dbTables = payload.tables || [];
  document.getElementById('dbStatusDot').className = 'status-dot ready';
  document.getElementById('dbStatusText').textContent = \`\${dbTables.length} tables\`;
  tablesPane.innerHTML = \`<ul class="table-list">\${dbTables.map(t => \`
    <li class="table-item" onclick="queryTable('\${escHtml(t.table_schema)}','\${escHtml(t.table_name)}')">
      🗄 \${escHtml(t.table_schema)}.<strong>\${escHtml(t.table_name)}</strong>
      \${t.size ? \`<span style="margin-left:auto;font-size:9px;color:var(--fg2)">\${escHtml(t.size)}</span>\` : ''}
    </li>\`).join('')}</ul>\`;
}

function handleDbColumns(payload) {
  if (payload.columns) {
    const cols = payload.columns;
    document.getElementById('queryInput').value = \`-- \${payload.schema}.\${payload.table} (\${cols.map(c => c.column_name).join(', ')})\\nSELECT * FROM \${JSON.stringify(payload.schema + '.' + payload.table)} LIMIT 50;\`;
  }
}

function queryTable(schema, table) {
  // Switch to results tab
  document.querySelector('[data-db-tab="results"]').click();
  document.getElementById('queryInput').value = 'SELECT * FROM "' + schema + '"."' + table + '" LIMIT 50;';
  runQuery();
}

function runQuery() {
  const sql = document.getElementById('queryInput').value.trim();
  if (!sql) return;
  document.getElementById('resultsPane').innerHTML = '<div class="empty"><span class="loading-spin">⟳</span> Running…</div>';
  post('db-query', { sql });
}

document.getElementById('runQueryBtn').addEventListener('click', runQuery);
document.getElementById('clearQueryBtn').addEventListener('click', () => { document.getElementById('queryInput').value = ''; document.getElementById('resultsPane').innerHTML = ''; document.getElementById('queryMeta').textContent = ''; });
document.getElementById('dbRefreshBtn').addEventListener('click', loadDb);
document.getElementById('queryInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runQuery(); }
});

// DB sub-tabs
document.querySelectorAll('[data-db-tab]').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('[data-db-tab]').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const tab = this.dataset.dbTab;
    document.getElementById('resultsPane').style.display = tab === 'results' ? 'block' : 'none';
    document.getElementById('tablesPane').style.display = tab === 'tables' ? 'block' : 'none';
  });
});

// ─── FILES VIEW ──────────────────────────────────────────────────────────────

let filePath = '.';
let fileStack = ['.'];

function loadFiles(dir) {
  filePath = dir;
  document.getElementById('filesContent').innerHTML = '<div class="empty"><span class="loading-spin">⟳</span> Loading…</div>';
  post('list-files', { dir, requestId: 'files-browse' });
  renderBreadcrumb(dir);
}

function renderBreadcrumb(dir) {
  const segs = dir === '.' ? [] : dir.split('/').filter(Boolean);
  let html = \`<span class="breadcrumb-seg" data-path=".">workspace</span>\`;
  let acc = '';
  for (const seg of segs) {
    acc = acc ? acc + '/' + seg : seg;
    html += \`<span class="breadcrumb-sep">/</span><span class="breadcrumb-seg" data-path="\${acc}">\${escHtml(seg)}</span>\`;
  }
  const bc = document.getElementById('filesBreadcrumb');
  bc.innerHTML = html;
  bc.querySelectorAll('.breadcrumb-seg').forEach(el => {
    el.addEventListener('click', () => loadFiles(el.dataset.path));
  });
}

function handleFileList(payload) {
  if (payload.error) {
    document.getElementById('filesContent').innerHTML = \`<div class="empty" style="color:var(--error)">\${escHtml(payload.error)}</div>\`;
    return;
  }
  const items = payload.items || [];
  if (items.length === 0) {
    document.getElementById('filesContent').innerHTML = '<div class="empty">Empty directory</div>';
    return;
  }
  const icons = { typescript:'TS', javascript:'JS', python:'PY', json:'{}', markdown:'MD', css:'CSS', html:'HTML', directory:'📁' };
  document.getElementById('filesContent').innerHTML = items.map(item => {
    const isDir = item.type === 'directory';
    const icon = isDir ? '📁' : (icons[item.extension?.slice(1)] || '📄');
    const size = !isDir && item.size ? (item.size < 1024 ? item.size + 'B' : (item.size/1024).toFixed(1)+'KB') : '';
    return \`<div class="file-entry \${isDir ? 'dir' : 'file'}" data-path="\${escHtml(item.path)}" data-dir="\${isDir}">
      <span class="file-entry-icon">\${icon}</span>
      <span class="file-entry-name">\${escHtml(item.name)}</span>
      \${size ? \`<span class="file-entry-size">\${size}</span>\` : ''}
    </div>\`;
  }).join('');

  document.getElementById('filesContent').querySelectorAll('.file-entry').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.dataset.path;
      const isDir = el.dataset.dir === 'true';
      if (isDir) { loadFiles(p); }
      else { post('open-file', { path: p }); }
    });
    el.addEventListener('dblclick', () => {
      if (el.dataset.dir !== 'true') {
        // Add to chat context
        contextFiles.push({ path: el.dataset.path });
        renderFilePills();
        showNotif('Added to chat context: ' + el.dataset.path.split('/').pop(), 'success');
        document.querySelector('[data-view="chat"]').click();
      }
    });
  });
}

function handleFileContent(payload) {
  if (payload.error) { showNotif('Read error: ' + payload.error, 'error'); return; }
}

document.getElementById('filesRefreshBtn').addEventListener('click', () => loadFiles(filePath));
document.getElementById('filesHomeBtn').addEventListener('click', () => loadFiles('.'));

// ─── SETTINGS VIEW ───────────────────────────────────────────────────────────

const PROVIDERS = [
  { key: 'openai', name: 'OpenAI', env: 'OPENAI_API_KEY', models: 'GPT-4o, GPT-4 Turbo' },
  { key: 'anthropic', name: 'Anthropic', env: 'ANTHROPIC_API_KEY', models: 'Claude 3.5 Sonnet' },
  { key: 'gemini', name: 'Google Gemini', env: 'GOOGLE_GENERATIVE_AI_API_KEY', models: 'Gemini 1.5 Pro' },
  { key: 'openrouter', name: 'OpenRouter', env: 'OPEN_ROUTER_API_KEY', models: '100+ models' },
  { key: 'openai-like', name: 'OpenAI-Compatible', env: 'OPENAI_LIKE_API_KEY', models: 'Ollama, LocalAI, Groq' },
];

function loadSettings() {
  renderProviderCards(null);
  post('get-status', {});
}

function updateProviderCards(status) {
  renderProviderCards(status);
}

function renderProviderCards(status) {
  const active = status?.provider?.name?.toLowerCase();
  const available = status?.availableProviders || [];
  document.getElementById('providerCards').innerHTML = PROVIDERS.map(p => {
    const isActive = available.some(a => a.toLowerCase().includes(p.key));
    return \`<div class="provider-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="provider-card-name">\${p.name}</span>
        \${isActive ? '<span class="badge">Active</span>' : ''}
      </div>
      <div class="provider-card-status \${isActive ? 'ok' : 'miss'}">\${isActive ? '✓ Configured' : '✗ Set ' + p.env}</div>
      <div style="font-size:9px;color:var(--fg2);margin-top:2px">\${p.models}</div>
    </div>\`;
  }).join('');
}

document.getElementById('streamingToggle').addEventListener('click', function() {
  streaming = !streaming;
  document.getElementById('streamingSwitch').classList.toggle('on', streaming);
  document.getElementById('streamToggle').classList.toggle('active', streaming);
});

document.getElementById('reindexBtn').addEventListener('click', () => {
  post('show-notification', { message: 'Re-indexing repository…', level: 'info' });
  // Trigger via command
});

document.getElementById('clearAllHistoryBtn').addEventListener('click', () => {
  post('clear-history', {});
  clearConversation();
  showNotif('History cleared', 'success');
});

// ─── Notifications ────────────────────────────────────────────────────────────

function showNotif(msg, level) {
  // Create a floating toast
  const el = document.createElement('div');
  el.style.cssText = \`position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border);color:var(--fg);padding:6px 12px;border-radius:var(--radius);font-size:11px;z-index:9999;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.4);transition:opacity .3s\`;
  if (level === 'error') el.style.borderColor = 'var(--error)';
  if (level === 'success') el.style.borderColor = 'var(--success)';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

post('ready', {});
</script>
</body>
</html>`;
}
//# sourceMappingURL=ChatViewProvider.js.map