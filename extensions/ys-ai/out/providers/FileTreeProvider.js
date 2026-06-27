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
exports.FileTreeProvider = exports.FileItem = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const companion = __importStar(require("../companion"));
class FileItem extends vscode.TreeItem {
    constructor(label, filePath, isDirectory, size) {
        super(label, isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.filePath = filePath;
        this.isDirectory = isDirectory;
        this.size = size;
        this.tooltip = filePath;
        this.description = !isDirectory && size != null ? formatSize(size) : undefined;
        if (!isDirectory) {
            this.command = {
                command: "vscode.open",
                title: "Open File",
                arguments: [vscode.Uri.file(getAbsPath(filePath))],
            };
            this.contextValue = "file";
            this.iconPath = new vscode.ThemeIcon("file");
        }
        else {
            this.contextValue = "directory";
            this.iconPath = new vscode.ThemeIcon("folder");
        }
        if (label.startsWith(".")) {
            this.iconPath = new vscode.ThemeIcon(isDirectory ? "folder" : "file");
        }
    }
}
exports.FileItem = FileItem;
function getAbsPath(relPath) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    return path.join(workspace, relPath);
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
class FileTreeProvider {
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
        const dirPath = element?.filePath ?? ".";
        try {
            const result = await companion.listFiles(dirPath);
            return result.items
                .filter((item) => !item.hidden || dirPath !== ".")
                .map((item) => new FileItem(item.name, item.path, item.type === "directory", item.size));
        }
        catch {
            return [new FileItem("Cannot reach companion server", ".", false)];
        }
    }
}
exports.FileTreeProvider = FileTreeProvider;
//# sourceMappingURL=FileTreeProvider.js.map