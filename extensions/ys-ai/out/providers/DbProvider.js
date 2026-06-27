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
exports.DbProvider = exports.DbItem = void 0;
const vscode = __importStar(require("vscode"));
const companion = __importStar(require("../companion"));
class DbItem extends vscode.TreeItem {
    constructor(label, kind, collapsible, schemaName, tableName) {
        super(label, collapsible);
        this.label = label;
        this.kind = kind;
        this.collapsible = collapsible;
        this.schemaName = schemaName;
        this.tableName = tableName;
        this.contextValue = kind;
        switch (kind) {
            case "status":
                this.iconPath = new vscode.ThemeIcon("database");
                break;
            case "schema":
                this.iconPath = new vscode.ThemeIcon("symbol-namespace");
                break;
            case "table":
                this.iconPath = new vscode.ThemeIcon("table");
                this.command = {
                    command: "ysAI.dbQueryTable",
                    title: "Query Table",
                    arguments: [schemaName, tableName],
                };
                break;
            case "column":
                this.iconPath = new vscode.ThemeIcon("symbol-field");
                break;
            case "message":
                this.iconPath = new vscode.ThemeIcon("info");
                break;
        }
    }
}
exports.DbItem = DbItem;
class DbProvider {
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
        if (element.kind === "schema") {
            return this.getTablesForSchema(element.schemaName ?? "public");
        }
        if (element.kind === "table") {
            return this.getColumnsForTable(element.schemaName ?? "public", element.tableName ?? "");
        }
        return [];
    }
    async getRootItems() {
        try {
            const status = await companion.getDbStatus();
            if (!status.connected) {
                const msg = status.message ?? "Not connected";
                const item = new DbItem(msg, "message", vscode.TreeItemCollapsibleState.None);
                item.description = "Set DATABASE_URL in env";
                return [item];
            }
            const tables = await companion.getDbTables();
            const schemas = new Set();
            for (const t of tables.tables) {
                schemas.add(t.table_schema);
            }
            const statusItem = new DbItem(`Connected (${status.latencyMs}ms)`, "status", vscode.TreeItemCollapsibleState.None);
            statusItem.description = status.version?.split(" ").slice(0, 2).join(" ");
            const schemaItems = Array.from(schemas).map((s) => new DbItem(s, "schema", vscode.TreeItemCollapsibleState.Expanded, s));
            return [statusItem, ...schemaItems];
        }
        catch {
            return [new DbItem("Cannot reach companion server", "message", vscode.TreeItemCollapsibleState.None)];
        }
    }
    async getTablesForSchema(schema) {
        try {
            const tables = await companion.getDbTables();
            const filtered = tables.tables.filter((t) => t.table_schema === schema);
            if (filtered.length === 0) {
                return [new DbItem("No tables", "message", vscode.TreeItemCollapsibleState.None)];
            }
            return filtered.map((t) => {
                const item = new DbItem(t.table_name, "table", vscode.TreeItemCollapsibleState.Collapsed, t.table_schema, t.table_name);
                item.description = t.size ?? undefined;
                item.tooltip = `${t.table_schema}.${t.table_name}\nType: ${t.table_type}\nRows: ~${t.estimated_rows ?? "?"}`;
                return item;
            });
        }
        catch {
            return [];
        }
    }
    async getColumnsForTable(schema, table) {
        try {
            const result = await companion.getDbColumns(schema, table);
            return result.columns.map((col) => {
                const item = new DbItem(col.column_name, "column", vscode.TreeItemCollapsibleState.None, schema, table);
                item.description = col.data_type;
                item.tooltip = [
                    `${col.column_name}: ${col.data_type}`,
                    `Nullable: ${col.is_nullable}`,
                    col.column_default ? `Default: ${col.column_default}` : "",
                ]
                    .filter(Boolean)
                    .join("\n");
                return item;
            });
        }
        catch {
            return [];
        }
    }
}
exports.DbProvider = DbProvider;
//# sourceMappingURL=DbProvider.js.map