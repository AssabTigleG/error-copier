import * as vscode from 'vscode';
import { DiagnosticSummaryStats } from './types';
import { DiagnosticTreeDataProvider } from './diagnosticTreeDataProvider';

/**
 * Manages the Error Copier status bar item.
 */
export class StatusBarController {
    private statusBarItem: vscode.StatusBarItem;
    private disposables: vscode.Disposable[] = [];
    private enabled = true;

    constructor(private treeDataProvider: DiagnosticTreeDataProvider) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            'errorCopierStatusBar',
            vscode.StatusBarAlignment.Left,
            50
        );
        this.statusBarItem.command = 'errorcontextcopier.focusDiagnosticsView';
        this.statusBarItem.name = 'Error Copier Diagnostics';

        this.updateSettings();

        // Listen for stats updates from TreeDataProvider
        this.disposables.push(
            this.treeDataProvider.onDidChangeSummaryStats(stats => {
                this.updateStats(stats);
            })
        );

        // Listen for configuration changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('errorcontextcopier.statusBar.enabled')) {
                    this.updateSettings();
                    this.updateStats(this.treeDataProvider.getSummaryStats());
                }
            })
        );

        // Initial render
        this.updateStats(this.treeDataProvider.getSummaryStats());
    }

    private updateSettings(): void {
        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        this.enabled = config.get<boolean>('statusBar.enabled', true);
        if (this.enabled) {
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    public updateStats(stats: DiagnosticSummaryStats): void {
        if (!this.enabled) {
            this.statusBarItem.hide();
            return;
        }

        const { errors, warnings, information, hints, total } = stats;

        if (total === 0) {
            this.statusBarItem.text = '$(check) 0 Errors';
            this.statusBarItem.tooltip = 'Error Copier: No matching diagnostics. Click to open Diagnostics Tree.';
            this.statusBarItem.backgroundColor = undefined;
        } else {
            const parts: string[] = [];
            if (errors > 0) parts.push(`$(error) ${errors}`);
            if (warnings > 0) parts.push(`$(warning) ${warnings}`);
            if (information > 0) parts.push(`$(info) ${information}`);
            if (hints > 0) parts.push(`$(lightbulb) ${hints}`);

            this.statusBarItem.text = parts.length > 0 ? parts.join(' ') : '$(check) 0 Errors';
            this.statusBarItem.tooltip = `Error Copier: ${errors} Error(s), ${warnings} Warning(s), ${information} Info, ${hints} Hint(s). Click to view.`;

            if (errors > 0) {
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else if (warnings > 0) {
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                this.statusBarItem.backgroundColor = undefined;
            }
        }

        this.statusBarItem.show();
    }

    public dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
