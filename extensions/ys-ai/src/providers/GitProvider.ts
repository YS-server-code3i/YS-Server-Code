import * as vscode from "vscode"
import * as companion from "../companion"

type GitNodeKind = "branch" | "status-group" | "file" | "commit" | "message"

export class GitItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: GitNodeKind,
    public readonly collapsible: vscode.TreeItemCollapsibleState,
    public readonly filePath?: string,
    public readonly statusCode?: string,
  ) {
    super(label, collapsible)
    this.contextValue = kind

    switch (kind) {
      case "branch":
        this.iconPath = new vscode.ThemeIcon("git-branch")
        this.description = "current branch"
        break
      case "status-group":
        this.iconPath = new vscode.ThemeIcon("folder")
        break
      case "file":
        this.iconPath = new vscode.ThemeIcon(getStatusIcon(statusCode ?? ""))
        this.description = statusCode
        if (filePath) {
          this.command = {
            command: "ysAI.openGitDiff",
            title: "Show Diff",
            arguments: [filePath],
          }
        }
        break
      case "commit":
        this.iconPath = new vscode.ThemeIcon("git-commit")
        break
      case "message":
        this.iconPath = new vscode.ThemeIcon("info")
        break
    }
  }
}

function getStatusIcon(code: string): string {
  if (code === "M") return "edit"
  if (code === "A") return "add"
  if (code === "D") return "trash"
  if (code === "R") return "arrow-right"
  if (code === "??" || code === "?") return "question"
  return "circle-outline"
}

export class GitProvider implements vscode.TreeDataProvider<GitItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitItem | undefined | null>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined)
  }

  getTreeItem(element: GitItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: GitItem): Promise<GitItem[]> {
    if (!element) {
      return this.getRootItems()
    }
    if (element.label === "Changes") {
      return this.getChangedFiles()
    }
    if (element.label === "Recent Commits") {
      return this.getCommits()
    }
    return []
  }

  private async getRootItems(): Promise<GitItem[]> {
    try {
      const status = await companion.getGitStatus()
      const items: GitItem[] = [
        new GitItem(`Branch: ${status.branch}`, "branch", vscode.TreeItemCollapsibleState.None),
        new GitItem(`Changes (${status.files.length})`, "status-group", vscode.TreeItemCollapsibleState.Expanded),
        new GitItem("Recent Commits", "status-group", vscode.TreeItemCollapsibleState.Collapsed),
      ]
      return items
    } catch {
      return [new GitItem("Git unavailable — is this a git repo?", "message", vscode.TreeItemCollapsibleState.None)]
    }
  }

  private async getChangedFiles(): Promise<GitItem[]> {
    try {
      const status = await companion.getGitStatus()
      if (status.files.length === 0) {
        return [new GitItem("No changes", "message", vscode.TreeItemCollapsibleState.None)]
      }
      return status.files.map(
        (f) => new GitItem(f.path, "file", vscode.TreeItemCollapsibleState.None, f.path, f.status),
      )
    } catch {
      return []
    }
  }

  private async getCommits(): Promise<GitItem[]> {
    try {
      const log = await companion.getGitLog(15)
      return log.commits.map((c) => {
        const item = new GitItem(c.message || "(no message)", "commit", vscode.TreeItemCollapsibleState.None)
        item.description = `${c.hash.slice(0, 7)} · ${c.author}`
        item.tooltip = `${c.hash}\n${c.author} <${c.email}>\n${c.date}\n\n${c.message}`
        return item
      })
    } catch {
      return []
    }
  }
}
