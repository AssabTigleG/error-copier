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
exports.ReportPanelManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const diagnosticScanner_1 = require("../diagnosticScanner");
/**
 * Manages the Error Context Interactive Webview Report Panel.
 */
class ReportPanelManager {
    static createOrShow(extensionUri, reportData) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        if (ReportPanelManager.currentPanel) {
            ReportPanelManager.currentPanel.panel.reveal(column || vscode.ViewColumn.One);
            ReportPanelManager.currentPanel.updateData(reportData);
            return ReportPanelManager.currentPanel;
        }
        const panel = vscode.window.createWebviewPanel('errorContextReport', 'Error Context Report', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui')]
        });
        ReportPanelManager.currentPanel = new ReportPanelManager(panel, extensionUri, reportData);
        return ReportPanelManager.currentPanel;
    }
    constructor(panel, extensionUri, initialData) {
        this.disposables = [];
        this.currentData = [];
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.currentData = initialData;
        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'webviewReady':
                    this.postMessage({ command: 'loadData', data: this.currentData });
                    break;
                case 'navigateTo':
                    await this.navigateToLocation(message.filePath, message.line);
                    break;
                case 'copyMarkdownToClipboard':
                    await this.copyMarkdown(message.data || this.currentData);
                    break;
                case 'openFile':
                    await this.openFile(message.filePath);
                    break;
            }
        }, null, this.disposables);
    }
    updateData(reportData) {
        this.currentData = reportData;
        this.postMessage({ command: 'loadData', data: reportData });
    }
    postMessage(message) {
        return this.panel.webview.postMessage(message);
    }
    async navigateToLocation(filePath, line) {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const zeroBasedLine = Math.max(0, line - 1);
            const pos = new vscode.Position(zeroBasedLine, 0);
            const editor = await vscode.window.showTextDocument(doc, {
                selection: new vscode.Selection(pos, pos)
            });
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to open ${filePath}: ${e}`);
        }
    }
    async openFile(filePath) {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}. ${e}`);
        }
    }
    async copyMarkdown(data) {
        try {
            const md = (0, diagnosticScanner_1.generateMarkdownReport)(data);
            await vscode.env.clipboard.writeText(md);
            vscode.window.showInformationMessage(`Markdown report for ${data.length} group(s) copied to clipboard!`);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to copy report: ${e}`);
        }
    }
    getHtmlForWebview(webview) {
        const htmlPathOnDisk = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'report-panel.html');
        let htmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'report-panel.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'report-panel.js'));
        const nonce = this.getNonce();
        return htmlContent
            .replace(/\$\{nonce\}/g, nonce)
            .replace(/\$\{webview\.cspSource\}/g, webview.cspSource)
            .replace(/\$\{cssUri\}/g, cssUri.toString())
            .replace(/\$\{scriptUri\}/g, scriptUri.toString());
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    dispose() {
        ReportPanelManager.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.ReportPanelManager = ReportPanelManager;
//# sourceMappingURL=reportPanel.js.map