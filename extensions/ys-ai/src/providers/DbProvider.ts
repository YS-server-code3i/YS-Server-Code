import * as vscode from "vscode"
import * as companion from "../companion"

type DbNodeKind = "status" | "schema" | "table" | "column" | "message"

export class DbItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: DbNodeKind,
    public readonly collapsible: vscode.TreeItemCollapsibleState,
    public readonly schemaName?: string,
    public readonly tableName?: string,
  ) {
    super(label, collapsible)
    this.contextValue = kind

    switch (kind) {
      case "status":
        this.iconPath = new vscode.ThemeIcon("database")
        break
      case "schema":
        this.iconPath = new vscode.ThemeIcon("symbol-namespace")
        break
      case "table":
        this.iconPath = new vscode.ThemeIcon("table")
        this.command = {
          command: "ysAI.dbQueryTable",
          title: "Query Table",
          arguments: [schemaName, tableName],
        }
        break
      case "column":
        this.iconPath = new vscode.ThemeIcon("symbol-field")
        break
      case "message":
        this.iconPath = new vscode.ThemeIcon("info")
        break
    }
  }
}

export class DbProvider implements vscode.TreeDataProvider<DbItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DbItem | undefined | null>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: DbItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: DbItem): Promise<DbItem[]> {
    if (!element) {
      return this.getRootItems()
    }
    if (element.kind === "schema") {
      return this.getTablesForSchema(element.schemaName ?? "public")
    }
    if (element.kind === "table") {
      return this.getColumnsForTable(element.schemaName ?? "public", element.tableName ?? "")
    }
    return []
  }

  private async getRootItems(): Promise<DbItem[]> {
    try {
      const status = await companion.getDbStatus()
      if (!status.connected) {
        const msg = status.message ?? "Not connected"
        const item = new DbItem(msg, "message", vscode.TreeItemCollapsibleState.None)
        item.description = "Set DATABASE_URL in env"
        return [item]
      }

      const tables = await companion.getDbTables()
      const schemas = new Set<string>()
      for (const t of tables.tables) {
        schemas.add(t.table_schema)
      }

      const statusItem = new DbItem(
        `Connected (${status.latencyMs}ms)`,
        "status",
        vscode.TreeItemCollapsibleState.None,
      )
      statusItem.description = status.version?.split(" ").slice(0, 2).join(" ")

      const schemaItems = Array.from(schemas).map(
        (s) => new DbItem(s, "schema", vscode.TreeItemCollapsibleState.Expanded, s),
      )

      return [statusItem, ...schemaItems]
    } catch {
      return [new DbItem("Cannot reach companion server", "message", vscode.TreeItemCollapsibleState.None)]
    }
  }

  private async getTablesForSchema(schema: string): Promise<DbItem[]> {
    try {
      const tables = await companion.getDbTables()
      const filtered = tables.tables.filter((t) => t.table_schema === schema)
      if (filtered.length === 0) {
        return [new DbItem("No tables", "message", vscode.TreeItemCollapsibleState.None)]
      }
      return filtered.map((t) => {
        const item = new DbItem(t.table_name, "table", vscode.TreeItemCollapsibleState.Collapsed, t.table_schema, t.table_name)
        item.description = t.size ?? undefined
        item.tooltip = `${t.table_schema}.${t.table_name}\nType: ${t.table_type}\nRows: ~${t.estimated_rows ?? "?"}`
        return item
      })
    } catch {
      return []
    }
  }

  private async getColumnsForTable(schema: string, table: string): Promise<DbItem[]> {
    try {
      const result = await companion.getDbColumns(schema, table)
      return (result.columns as Array<{ column_name: string; data_type: string; is_nullable: string; column_default?: string }>).map((col) => {
        const item = new DbItem(col.column_name, "column", vscode.TreeItemCollapsibleState.None, schema, table)
        item.description = col.data_type
        item.tooltip = [
          `${col.column_name}: ${col.data_type}`,
          `Nullable: ${col.is_nullable}`,
          col.column_default ? `Default: ${col.column_default}` : "",
        ]
          .filter(Boolean)
          .join("\n")
        return item
      })
    } catch {
      return []
    }
  }
}
