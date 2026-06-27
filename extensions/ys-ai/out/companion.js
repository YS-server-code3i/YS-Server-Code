"use strict";
/**
 * Companion server HTTP client
 * All API calls go to the companion server running at 127.0.0.1:PORT
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
exports.getConfig = getConfig;
exports.apiFetch = apiFetch;
exports.apiStream = apiStream;
exports.getAIStatus = getAIStatus;
exports.reindexRepository = reindexRepository;
exports.clearHistory = clearHistory;
exports.getGitStatus = getGitStatus;
exports.getGitLog = getGitLog;
exports.getGitBranches = getGitBranches;
exports.getGitDiff = getGitDiff;
exports.gitCommit = gitCommit;
exports.gitPush = gitPush;
exports.gitPull = gitPull;
exports.gitCheckout = gitCheckout;
exports.getDbStatus = getDbStatus;
exports.getDbTables = getDbTables;
exports.getDbColumns = getDbColumns;
exports.runDbQuery = runDbQuery;
exports.listFiles = listFiles;
exports.readFile = readFile;
exports.writeFile = writeFile;
exports.healthCheck = healthCheck;
const http = __importStar(require("http"));
const vscode = __importStar(require("vscode"));
function getConfig() {
    const cfg = vscode.workspace.getConfiguration("ysAI");
    return { port: cfg.get("companionPort", 3001) };
}
function baseUrl() {
    return `http://127.0.0.1:${getConfig().port}`;
}
/** Generic JSON fetch via Node http module (no external deps) */
async function apiFetch(path, options = {}) {
    return new Promise((resolve, reject) => {
        const body = options.body ? JSON.stringify(options.body) : undefined;
        const cfg = getConfig();
        const req = http.request({
            hostname: "127.0.0.1",
            port: cfg.port,
            path,
            method: options.method || (body ? "POST" : "GET"),
            headers: {
                "Content-Type": "application/json",
                ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
            },
        }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c.toString()));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    reject(new Error(`Invalid JSON from companion (${res.statusCode}): ${data.slice(0, 200)}`));
                }
            });
        });
        req.on("error", reject);
        if (body)
            req.write(body);
        req.end();
    });
}
/** Stream SSE from companion, calling onChunk for each text piece, onDone when finished */
function apiStream(path, body, onChunk, onDone, onError) {
    const cfg = getConfig();
    const bodyStr = JSON.stringify(body);
    let aborted = false;
    const req = http.request({
        hostname: "127.0.0.1",
        port: cfg.port,
        path,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
            Accept: "text/event-stream",
        },
    }, (res) => {
        if (aborted)
            return;
        if (res.statusCode && res.statusCode >= 400) {
            onError(new Error(`Companion returned HTTP ${res.statusCode}`));
            return;
        }
        let buffer = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
            if (aborted)
                return;
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: "))
                    continue;
                const data = line.slice(6);
                if (data === "[DONE]") {
                    onDone();
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        onError(new Error(parsed.error));
                    }
                    else if (parsed.text) {
                        onChunk(parsed.text);
                    }
                }
                catch {
                    // skip unparseable
                }
            }
        });
        res.on("end", () => {
            if (!aborted)
                onDone();
        });
        res.on("error", onError);
    });
    req.on("error", (err) => {
        if (!aborted)
            onError(err);
    });
    req.write(bodyStr);
    req.end();
    return () => {
        aborted = true;
        req.destroy();
    };
}
async function getAIStatus() {
    return apiFetch("/api/ai/status");
}
async function reindexRepository() {
    return apiFetch("/api/ai/reindex", { method: "POST" });
}
async function clearHistory() {
    await apiFetch("/api/ai/history", { method: "DELETE" });
}
async function getGitStatus() {
    return apiFetch("/api/github/git/status");
}
async function getGitLog(limit = 20) {
    return apiFetch(`/api/github/git/log?limit=${limit}`);
}
async function getGitBranches() {
    return apiFetch("/api/github/git/branches");
}
async function getGitDiff(file, staged = false) {
    const params = new URLSearchParams();
    if (file)
        params.set("file", file);
    if (staged)
        params.set("staged", "true");
    return apiFetch(`/api/github/git/diff?${params}`);
}
async function gitCommit(message, files) {
    return apiFetch("/api/github/git/commit", { body: { message, files } });
}
async function gitPush() {
    return apiFetch("/api/github/git/push", { body: {} });
}
async function gitPull() {
    return apiFetch("/api/github/git/pull", { body: {} });
}
async function gitCheckout(branch, create = false) {
    return apiFetch("/api/github/git/checkout", { body: { branch, create } });
}
async function getDbStatus() {
    return apiFetch("/api/db/status");
}
async function getDbTables() {
    return apiFetch("/api/db/tables");
}
async function getDbColumns(schema, table) {
    return apiFetch(`/api/db/tables/${schema}/${table}/columns`);
}
async function runDbQuery(sql, params) {
    return apiFetch("/api/db/query", { body: { sql, params } });
}
async function listFiles(path = ".") {
    return apiFetch(`/api/files/list?path=${encodeURIComponent(path)}`);
}
async function readFile(path) {
    return apiFetch(`/api/files/read?path=${encodeURIComponent(path)}`);
}
async function writeFile(path, content) {
    return apiFetch("/api/files/write", { body: { path, content } });
}
// ─── Health ───────────────────────────────────────────────────────────────────
async function healthCheck() {
    try {
        await apiFetch("/healthz");
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=companion.js.map