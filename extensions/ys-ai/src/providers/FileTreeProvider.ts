import * as vscode from "vscode"
import * as path from "path"
import * as companion from "../companion"

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly filePath: string,
    public readonly isDirectory: boolean,
    public readonly size?: number,
  ) {
    super(label, isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)

    this.tooltip = filePath
    this.description = !isDirectory && size != null ? formatSize(size) : undefined

    if (!isDirectory) {
      this.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [vscode.Uri.file(getAbsPath(filePath))],
      }
      this.contextValue = "file"
      this.iconPath = new vscode.ThemeIcon("file")
    } else {
      this.contextValue = "directory"
      this.iconPath = new vscode.ThemeIcon("folder")
    }

    if (label.startsWith(".")) {
      this.iconPath = new vscode.ThemeIcon(isDirectory ? "folder" : "file")
    }
  }
}

function getAbsPath(relPath: string): string {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()
  return path.join(workspace, relPath)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export class FileTreeProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileItem | undefined | null>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: FileItem): Promise<FileItem[]> {
    const dirPath = element?.filePath ?? "."
    try {
      const result = await companion.listFiles(dirPath)
      return result.items
        .filter((item) => !item.hidden || dirPath !== ".")
        .map((item) => new FileItem(item.name, item.path, item.type === "directory", item.size))
    } catch {
      return [new FileItem("Cannot reach companion server", ".", false)]
    }
  }
}
