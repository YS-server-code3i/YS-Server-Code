"use strict";
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
exports.GitProvider = exports.GitItem = void 0;
const vscode = __importStar(require("vscode"));
const companion = __importStar(require("../companion"));
class GitItem extends vscode.TreeItem {
    constructor(label, kind, collapsible, filePath, statusCode) {
        super(label, collapsible);
        this.label = label;
        this.kind = kind;
        this.collapsible = collapsible;
        this.filePath = filePath;
        this.statusCode = statusCode;
        this.contextValue = kind;
        switch (kind) {
            case "branch":
                this.iconPath = new vscode.ThemeIcon("git-branch");
                this.description = "current branch";
                break;
            case "status-group":
                this.iconPath = new vscode.ThemeIcon("folder");
                break;
            case "file":
                this.iconPath = new vscode.ThemeIcon(getStatusIcon(statusCode ?? ""));
                this.description = statusCode;
                if (filePath) {
                    this.command = {
                        command: "ysAI.openGitDiff",
                        title: "Show Diff",
                        arguments: [filePath],
                    };
                }
                break;
            case "commit":
                this.iconPath = new vscode.ThemeIcon("git-commit");
                break;
            case "message":
                this.iconPath = new vscode.ThemeIcon("info");
                break;
        }
    }
}
exports.GitItem = GitItem;
function getStatusIcon(code) {
    if (code === "M")
        return "edit";
    if (code === "A")
        return "add";
    if (code === "D")
        return "trash";
    if (code === "R")
        return "arrow-right";
    if (code === "??" || code === "?")
        return "question";
    return "circle-outline";
}
class GitProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.getRootItems();
        }
        if (element.label === "Changes") {
            return this.getChangedFiles();
        }
        if (element.label === "Recent Commits") {
            return this.getCommits();
        }
        return [];
    }
    async getRootItems() {
        try {
            const status = await companion.getGitStatus();
            const items = [
                new GitItem(`Branch: ${status.branch}`, "branch", vscode.TreeItemCollapsibleState.None),
                new GitItem(`Changes (${status.files.length})`, "status-group", vscode.TreeItemCollapsibleState.Expanded),
                new GitItem("Recent Commits", "status-group", vscode.TreeItemCollapsibleState.Collapsed),
            ];
            return items;
        }
        catch {
            return [new GitItem("Git unavailable — is this a git repo?", "message", vscode.TreeItemCollapsibleState.None)];
        }
    }
    async getChangedFiles() {
        try {
            const status = await companion.getGitStatus();
            if (status.files.length === 0) {
                return [new GitItem("No changes", "message", vscode.TreeItemCollapsibleState.None)];
            }
            return status.files.map((f) => new GitItem(f.path, "file", vscode.TreeItemCollapsibleState.None, f.path, f.status));
        }
        catch {
            return [];
        }
    }
    async getCommits() {
        try {
            const log = await companion.getGitLog(15);
            return log.commits.map((c) => {
                const item = new GitItem(c.message || "(no message)", "commit", vscode.TreeItemCollapsibleState.None);
                item.description = `${c.hash.slice(0, 7)} · ${c.author}`;
                item.tooltip = `${c.hash}\n${c.author} <${c.email}>\n${c.date}\n\n${c.message}`;
                return item;
            });
        }
        catch {
            return [];
        }
    }
}
exports.GitProvider = GitProvider;
//# sourceMappingURL=GitProvider.js.map