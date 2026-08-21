import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FormattedReportGroup } from '../types';
import { generateMarkdownReport } from '../diagnosticScanner';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './types';

/**
 * Manages the Error Context Interactive Webview Report Panel.
 */
export class ReportPanelManager {
    public static currentPanel: ReportPanelManager | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private currentData: FormattedReportGroup[] = [];

    public static createOrShow(extensionUri: vscode.Uri, reportData: FormattedReportGroup[]): ReportPanelManager {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (ReportPanelManager.currentPanel) {
            ReportPanelManager.currentPanel.panel.reveal(column || vscode.ViewColumn.One);
            ReportPanelManager.currentPanel.updateData(reportData);
            return ReportPanelManager.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'errorContextReport',
            'Error Context Report',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui')]
            }
        );

        ReportPanelManager.currentPanel = new ReportPanelManager(panel, extensionUri, reportData);
        return ReportPanelManager.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, initialData: FormattedReportGroup[]) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.currentData = initialData;

        this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            async (message: WebviewToExtensionMessage) => {
                switch (message.command) {
                    case 'webviewReady':
                        this.postMessage({ command: 'loadData', data: this.currentData });
                        break;
                    case 'navigateTo':
                        await this.navigateToLocation(message.filePath, message.line);
                        break;
                    case 'autoFix':
                        await this.autoFixLocation(message.filePath, message.line);
                        break;
                    case 'fixAllInFile':
                        await this.fixAllInFile(message.filePath);
                        break;
                    case 'fixAllInScope':
                        await this.fixAllInScope(message.filePaths);
                        break;
                    case 'copyMarkdownToClipboard':
                        await this.copyMarkdown(message.data || this.currentData);
                        break;
                    case 'openFile':
                        await this.openFile(message.filePath);
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    public updateData(reportData: FormattedReportGroup[]): void {
        this.currentData = reportData;
        this.postMessage({ command: 'loadData', data: reportData });
    }

    public postMessage(message: ExtensionToWebviewMessage): Thenable<boolean> {
        return this.panel.webview.postMessage(message);
    }

    private async autoFixLocation(filePath: string, line: number): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const zeroBasedLine = Math.max(0, line - 1);
            const range = new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 100);
            const editor = await vscode.window.showTextDocument(doc, {
                selection: new vscode.Selection(range.start, range.end)
            });
            editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

            const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                uri,
                range,
                vscode.CodeActionKind.QuickFix.value
            );

            if (!actions || actions.length === 0) {
                vscode.window.showInformationMessage("No automatic Quick Fix available for this issue.");
                return;
            }

            if (actions.length === 1) {
                const action = actions[0];
                if (action.edit) {
                    await vscode.workspace.applyEdit(action.edit);
                }
                if (action.command) {
                    await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments || []));
                }
                vscode.window.showInformationMessage(`Applied fix: ${action.title}`);
                return;
            }

            const pickItems = actions.map(act => ({
                label: act.isPreferred ? `$(star-full) ${act.title}` : act.title,
                description: act.kind?.value,
                action: act
            }));

            const selected = await vscode.window.showQuickPick(pickItems, {
                placeHolder: "Select a Quick Fix to apply"
            });

            if (selected) {
                const action = selected.action;
                if (action.edit) {
                    await vscode.workspace.applyEdit(action.edit);
                }
                if (action.command) {
                    await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments || []));
                }
                vscode.window.showInformationMessage(`Applied fix: ${action.title}`);
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to apply auto fix: ${e}`);
        }
    }

    private async fixAllInFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            let appliedCount = 0;

            // 1. Try SourceFixAll first
            const wholeDocRange = new vscode.Range(0, 0, Math.max(0, doc.lineCount - 1), 100);
            const sourceActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                'vscode.executeCodeActionProvider',
                uri,
                wholeDocRange,
                vscode.CodeActionKind.SourceFixAll.value
            );
            if (sourceActions && sourceActions.length > 0) {
                for (const act of sourceActions) {
                    if (act.edit) {
                        const success = await vscode.workspace.applyEdit(act.edit);
                        if (success) appliedCount++;
                    } else if (act.command) {
                        await vscode.commands.executeCommand(act.command.command, ...(act.command.arguments || []));
                        appliedCount++;
                    }
                }
            }

            // 2. Iterate through file diagnostics and apply preferred QuickFixes
            const diags = vscode.languages.getDiagnostics(uri);
            for (const diag of diags) {
                const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                    'vscode.executeCodeActionProvider',
                    uri,
                    diag.range,
                    vscode.CodeActionKind.QuickFix.value
                );
                if (actions && actions.length > 0) {
                    const preferred = actions.find(a => a.isPreferred) || (actions.length === 1 ? actions[0] : undefined);
                    if (preferred) {
                        if (preferred.edit) {
                            const success = await vscode.workspace.applyEdit(preferred.edit);
                            if (success) appliedCount++;
                        } else if (preferred.command) {
                            await vscode.commands.executeCommand(preferred.command.command, ...(preferred.command.arguments || []));
                            appliedCount++;
                        }
                    }
                }
            }

            vscode.window.showInformationMessage(
                appliedCount > 0 ? `Applied ${appliedCount} auto-fix(es) in ${path.basename(filePath)}.` : `No automatic fixes available for ${path.basename(filePath)}.`
            );
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to auto-fix file: ${e}`);
        }
    }

    private async fixAllInScope(filePaths: string[]): Promise<void> {
        if (!filePaths || filePaths.length === 0) {
            vscode.window.showInformationMessage("No files in current scope.");
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Applying Auto-Fixes across files...",
            cancellable: true
        }, async (progress, token) => {
            let totalFixed = 0;
            let current = 0;

            for (const fp of filePaths) {
                if (token.isCancellationRequested) break;
                current++;
                progress.report({
                    message: `${path.basename(fp)} (${current}/${filePaths.length})`,
                    increment: (1 / Math.max(1, filePaths.length)) * 100
                });

                try {
                    const uri = vscode.Uri.file(fp);
                    const doc = await vscode.workspace.openTextDocument(uri);

                    const wholeDocRange = new vscode.Range(0, 0, Math.max(0, doc.lineCount - 1), 100);
                    const sourceActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                        'vscode.executeCodeActionProvider',
                        uri,
                        wholeDocRange,
                        vscode.CodeActionKind.SourceFixAll.value
                    );
                    if (sourceActions) {
                        for (const act of sourceActions) {
                            if (act.edit && await vscode.workspace.applyEdit(act.edit)) totalFixed++;
                        }
                    }

                    const diags = vscode.languages.getDiagnostics(uri);
                    for (const diag of diags) {
                        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                            'vscode.executeCodeActionProvider',
                            uri,
                            diag.range,
                            vscode.CodeActionKind.QuickFix.value
                        );
                        if (actions && actions.length > 0) {
                            const preferred = actions.find(a => a.isPreferred) || (actions.length === 1 ? actions[0] : undefined);
                            if (preferred && preferred.edit) {
                                if (await vscode.workspace.applyEdit(preferred.edit)) totalFixed++;
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error fixing ${fp}:`, e);
                }
            }

            vscode.window.showInformationMessage(`Batch fix completed! Applied ${totalFixed} fix(es) across ${current} file(s).`);
        });
    }

    private async navigateToLocation(filePath: string, line: number): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const zeroBasedLine = Math.max(0, line - 1);
            const pos = new vscode.Position(zeroBasedLine, 0);
            const editor = await vscode.window.showTextDocument(doc, {
                selection: new vscode.Selection(pos, pos)
            });
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to open ${filePath}: ${e}`);
        }
    }

    private async openFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to open file: ${filePath}. ${e}`);
        }
    }

    private async copyMarkdown(data: FormattedReportGroup[]): Promise<void> {
        try {
            const md = generateMarkdownReport(data);
            await vscode.env.clipboard.writeText(md);
            vscode.window.showInformationMessage(`Markdown report for ${data.length} group(s) copied to clipboard!`);
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to copy report: ${e}`);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
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

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        ReportPanelManager.currentPanel = undefined;
        this.panel.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
