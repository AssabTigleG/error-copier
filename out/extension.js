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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const diagnosticTreeDataProvider_1 = require("./diagnosticTreeDataProvider");
const diagnosticScanner_1 = require("./diagnosticScanner");
const statusBar_1 = require("./statusBar");
const reportPanel_1 = require("./webview/reportPanel");
let diagnosticTreeDataProvider;
let statusBarController;
/**
 * Called when the extension is activated.
 */
function activate(context) {
    diagnosticTreeDataProvider = new diagnosticTreeDataProvider_1.DiagnosticTreeDataProvider();
    const diagnosticTreeView = vscode.window.createTreeView('errorContextCopierDiagnosticsView', {
        treeDataProvider: diagnosticTreeDataProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(diagnosticTreeView);
    // Initialize Status Bar controller
    statusBarController = new statusBar_1.StatusBarController(diagnosticTreeDataProvider);
    context.subscriptions.push(statusBarController);
    vscode.commands.executeCommand('setContext', 'errorContextCopier.treeFilterActive', false);
    // Tree Refresh Command
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.refreshDiagnosticsView', () => {
        diagnosticTreeDataProvider.refresh();
    }));
    // Focus Diagnostics View Command
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.focusDiagnosticsView', async () => {
        await vscode.commands.executeCommand('errorContextCopierDiagnosticsView.focus');
    }));
    // Grouping Mode Switch Command
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.view.switchGroupingMode', async () => {
        const currentMode = diagnosticTreeDataProvider.getGroupingMode();
        const items = [
            {
                label: "$(files) Group by File",
                description: currentMode === 'file' ? '(Current)' : undefined,
                mode: 'file'
            },
            {
                label: "$(error) Group by Severity",
                description: currentMode === 'severity' ? '(Current)' : undefined,
                mode: 'severity'
            },
            {
                label: "$(symbol-property) Group by Diagnostic Source / Rule",
                description: currentMode === 'sourceRule' ? '(Current)' : undefined,
                mode: 'sourceRule'
            }
        ];
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: "Select TreeView Grouping Mode"
        });
        if (selected) {
            diagnosticTreeDataProvider.setGroupingMode(selected.mode);
            vscode.window.showInformationMessage(`Diagnostics grouped ${selected.label.replace(/\$\([^)]+\)\s*/, '')}.`);
        }
    }));
    // Direct mode toggle commands
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.view.groupByFile', () => {
        diagnosticTreeDataProvider.setGroupingMode('file');
    }), vscode.commands.registerCommand('errorcontextcopier.view.groupBySeverity', () => {
        diagnosticTreeDataProvider.setGroupingMode('severity');
    }), vscode.commands.registerCommand('errorcontextcopier.view.groupBySourceRule', () => {
        diagnosticTreeDataProvider.setGroupingMode('sourceRule');
    }), vscode.commands.registerCommand('errorcontextcopier.view.toggleSeverities', async () => {
        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        const currentSeverities = config.get('includeSeverities', ['Error', 'Warning']);
        const items = [
            { label: "$(error) Errors", severity: "Error", picked: currentSeverities.includes("Error") },
            { label: "$(warning) Warnings", severity: "Warning", picked: currentSeverities.includes("Warning") },
            { label: "$(info) Information", severity: "Information", picked: currentSeverities.includes("Information") },
            { label: "$(lightbulb) Hints", severity: "Hint", picked: currentSeverities.includes("Hint") }
        ];
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: "Select diagnostic severities to display in sidebar and report"
        });
        if (selected) {
            const newSeverities = selected.map(s => s.severity);
            await config.update('includeSeverities', newSeverities, vscode.ConfigurationTarget.Global);
            diagnosticTreeDataProvider.refresh();
            vscode.window.showInformationMessage(`Active severities: ${newSeverities.join(', ') || 'None'}`);
        }
    }), vscode.commands.registerCommand('errorcontextcopier.view.toggleGeneratedFiles', () => {
        const isHiding = diagnosticTreeDataProvider.toggleHideGeneratedFiles();
        vscode.window.showInformationMessage(isHiding ? 'Generated files hidden (*.g.dart, *.min.js, etc.)' : 'Showing all files including generated code.');
    }));
    // Filter Commands
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.view.setTreeFilter', async () => {
        const currentFilter = diagnosticTreeDataProvider.getFilterText();
        const filterText = await vscode.window.showInputBox({
            prompt: "Filter diagnostics by file path, message, code or rule (leave empty to clear)",
            value: currentFilter || '',
            placeHolder: "e.g., myFile.ts, 'is not defined', or ts2304"
        });
        if (filterText !== undefined) {
            diagnosticTreeDataProvider.setFilterText(filterText || undefined);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.view.clearTreeFilter', () => {
        diagnosticTreeDataProvider.clearFilterText();
    }));
    // Context Submenu Commands (Explorer, Editor, Sidebar)
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.copyErrorsOnly', async (clickedUri, selectedUris) => {
        const uris = getContextUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0)
            return;
        const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Scanning Errors...", [vscode.DiagnosticSeverity.Error]);
        if (reportData && reportData.length > 0) {
            await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), "Errors", reportData.length);
        }
        else if (reportData) {
            vscode.window.showInformationMessage("No errors found in target.");
        }
    }), vscode.commands.registerCommand('errorcontextcopier.copyWarningsOnly', async (clickedUri, selectedUris) => {
        const uris = getContextUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0)
            return;
        const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Scanning Warnings...", [vscode.DiagnosticSeverity.Warning]);
        if (reportData && reportData.length > 0) {
            await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), "Warnings", reportData.length);
        }
        else if (reportData) {
            vscode.window.showInformationMessage("No warnings found in target.");
        }
    }), vscode.commands.registerCommand('errorcontextcopier.copyAllDiagnostics', async (clickedUri, selectedUris) => {
        const uris = getContextUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0)
            return;
        const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Scanning All Diagnostics...", [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning, vscode.DiagnosticSeverity.Information, vscode.DiagnosticSeverity.Hint]);
        if (reportData && reportData.length > 0) {
            await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), "Diagnostics", reportData.length);
        }
        else if (reportData) {
            vscode.window.showInformationMessage("No diagnostics found in target.");
        }
    }), vscode.commands.registerCommand('errorcontextcopier.copyAsAiPrompt', async (clickedUri, selectedUris) => {
        const uris = getContextUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0)
            return;
        const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Preparing AI Fix Prompt...");
        if (reportData && reportData.length > 0) {
            await copyReportToClipboard((0, diagnosticScanner_1.generateAiPrompt)(reportData), "AI Prompt", reportData.length);
        }
        else if (reportData) {
            vscode.window.showInformationMessage("No diagnostics found to prompt.");
        }
    }), vscode.commands.registerCommand('errorcontextcopier.openReportPanel', async (clickedUri, selectedUris) => {
        const uris = getContextUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0)
            return;
        const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Scanning for Report Panel...");
        if (reportData && reportData.length > 0) {
            reportPanel_1.ReportPanelManager.createOrShow(context.extensionUri, reportData);
        }
        else if (reportData) {
            vscode.window.showInformationMessage("No diagnostics found for report.");
        }
    }));
    // Tree item actions for Files
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.tree.copyFileErrors', async (item) => {
        if (item?.fileUri) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)([item.fileUri], `Scanning Errors in ${item.label}...`, [vscode.DiagnosticSeverity.Error]);
            if (reportData && reportData.length > 0) {
                await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), "Errors", reportData.length);
            }
            else if (reportData) {
                vscode.window.showInformationMessage(`No errors in ${item.label}.`);
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.copyFileWarnings', async (item) => {
        if (item?.fileUri) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)([item.fileUri], `Scanning Warnings in ${item.label}...`, [vscode.DiagnosticSeverity.Warning]);
            if (reportData && reportData.length > 0) {
                await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), "Warnings", reportData.length);
            }
            else if (reportData) {
                vscode.window.showInformationMessage(`No warnings in ${item.label}.`);
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.copyFileAll', async (item) => {
        if (item?.fileUri) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)([item.fileUri], `Scanning All Diagnostics in ${item.label}...`, [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning, vscode.DiagnosticSeverity.Information, vscode.DiagnosticSeverity.Hint]);
            if (reportData && reportData.length > 0) {
                await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), "Diagnostics", reportData.length);
            }
            else if (reportData) {
                vscode.window.showInformationMessage(`No diagnostics in ${item.label}.`);
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.copyFileAsAiPrompt', async (item) => {
        if (item?.fileUri) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)([item.fileUri], `Preparing AI Prompt for ${item.label}...`);
            if (reportData && reportData.length > 0) {
                await copyReportToClipboard((0, diagnosticScanner_1.generateAiPrompt)(reportData), "AI Prompt", reportData.length);
            }
            else if (reportData) {
                vscode.window.showInformationMessage(`No diagnostics in ${item.label}.`);
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.scanFileForPanel', async (item) => {
        if (item?.fileUri) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)([item.fileUri], `Scanning ${item.label} for Panel...`);
            if (reportData && reportData.length > 0) {
                reportPanel_1.ReportPanelManager.createOrShow(context.extensionUri, reportData);
            }
            else if (reportData) {
                vscode.window.showInformationMessage(`No matching diagnostics in ${item.label}.`);
            }
        }
    }));
    // Tree item actions for Individual Diagnostics
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.tree.autoFixDiagnostic', async (target) => {
        const rawInfo = (target instanceof diagnosticTreeDataProvider_1.DiagnosticNode) ? target.rawInfo : target;
        if (!rawInfo?.fileUri || !rawInfo.range)
            return;
        try {
            const doc = await vscode.workspace.openTextDocument(rawInfo.fileUri);
            const editor = await vscode.window.showTextDocument(doc, {
                selection: new vscode.Selection(rawInfo.range.start, rawInfo.range.end)
            });
            editor.revealRange(rawInfo.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            const actions = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', rawInfo.fileUri, rawInfo.range, vscode.CodeActionKind.QuickFix.value);
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
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to apply auto fix: ${e}`);
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.goToDiagnostic', async (target) => {
        const rawInfo = (target instanceof diagnosticTreeDataProvider_1.DiagnosticNode) ? target.rawInfo : target;
        if (rawInfo?.fileUri) {
            try {
                const doc = await vscode.workspace.openTextDocument(rawInfo.fileUri);
                const editor = await vscode.window.showTextDocument(doc, {
                    selection: new vscode.Selection(rawInfo.range.start, rawInfo.range.end)
                });
                editor.revealRange(new vscode.Range(rawInfo.range.start, rawInfo.range.end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            }
            catch (e) {
                vscode.window.showErrorMessage(`Failed to open file: ${rawInfo.fileUri.fsPath}. ${e}`);
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.copyDiagnosticMessage', async (item) => {
        if (item?.rawInfo) {
            await vscode.env.clipboard.writeText(item.rawInfo.message);
            vscode.window.showInformationMessage('Diagnostic message copied.');
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.copyDiagnosticWithContext', async (item) => {
        if (item?.rawInfo) {
            const docLinesCache = new Map();
            try {
                const doc = await vscode.workspace.openTextDocument(item.rawInfo.fileUri);
                docLinesCache.set(item.rawInfo.fileUri.toString(), doc.getText().split(/\r?\n/));
            }
            catch {
                const uint8 = await vscode.workspace.fs.readFile(item.rawInfo.fileUri);
                docLinesCache.set(item.rawInfo.fileUri.toString(), Buffer.from(uint8).toString('utf8').split(/\r?\n/));
            }
            const groups = (0, diagnosticScanner_1.processDiagnosticsForReportGrouping)([item.rawInfo], docLinesCache);
            if (groups.length > 0) {
                await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(groups), "Snippet", 1);
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.tree.copyDiagnosticAsAiPrompt', async (item) => {
        if (item?.rawInfo) {
            const docLinesCache = new Map();
            try {
                const doc = await vscode.workspace.openTextDocument(item.rawInfo.fileUri);
                docLinesCache.set(item.rawInfo.fileUri.toString(), doc.getText().split(/\r?\n/));
            }
            catch {
                const uint8 = await vscode.workspace.fs.readFile(item.rawInfo.fileUri);
                docLinesCache.set(item.rawInfo.fileUri.toString(), Buffer.from(uint8).toString('utf8').split(/\r?\n/));
            }
            const groups = (0, diagnosticScanner_1.processDiagnosticsForReportGrouping)([item.rawInfo], docLinesCache);
            if (groups.length > 0) {
                await copyReportToClipboard((0, diagnosticScanner_1.generateAiPrompt)(groups), "AI Prompt", 1);
            }
        }
    }));
    // Diagnostics changes listener (updates tree view & status bar)
    context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(() => {
        diagnosticTreeDataProvider.refresh();
    }));
    // Save listener
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (diagnosticTreeDataProvider && vscode.workspace.getWorkspaceFolder(doc.uri)) {
            setTimeout(() => diagnosticTreeDataProvider.refresh(), 300);
        }
    }));
    // Command palette scan commands
    context.subscriptions.push(vscode.commands.registerCommand('errorcontextcopier.scanSubfoldersAndCopy', async () => {
        const uris = await promptForSubfolderSelection();
        if (uris)
            await triggerScanAndCopyToClipboard(uris, "Scanning subfolder(s)...", "Markdown");
    }), vscode.commands.registerCommand('errorcontextcopier.scanAndShowInPanel', async () => {
        const uris = await promptForSubfolderSelection();
        if (uris) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Scanning for Panel...");
            if (reportData && reportData.length > 0) {
                reportPanel_1.ReportPanelManager.createOrShow(context.extensionUri, reportData);
            }
            else if (reportData) {
                vscode.window.showInformationMessage("No matching diagnostics for panel.");
            }
        }
    }), vscode.commands.registerCommand('errorcontextcopier.scanAndExportReportAs', async () => {
        const uris = await promptForSubfolderSelection();
        if (uris)
            await triggerScanAndExport(uris, "Scanning for export...");
    }), vscode.commands.registerCommand('errorcontextcopier.view.scanWorkspaceAndShowPanel', async () => {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (!wsFolders || wsFolders.length === 0) {
            vscode.window.showErrorMessage("No workspace open.");
            return;
        }
        const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(wsFolders.map(f => f.uri), "Scanning Workspace for Panel...");
        if (reportData && reportData.length > 0) {
            reportPanel_1.ReportPanelManager.createOrShow(context.extensionUri, reportData);
        }
        else if (reportData) {
            vscode.window.showInformationMessage("No matching diagnostics in workspace.");
        }
    }), vscode.commands.registerCommand('errorcontextcopier.view.scanWorkspaceAndExportAs', async () => {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (!wsFolders || wsFolders.length === 0) {
            vscode.window.showErrorMessage("No workspace open.");
            return;
        }
        await triggerScanAndExport(wsFolders.map(f => f.uri), "Scanning Workspace for Export...");
    }), vscode.commands.registerCommand('errorcontextcopier.view.defineScanScopeAndShowPanel', async () => {
        const uris = await promptForSubfolderSelection();
        if (uris && uris.length > 0) {
            const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, "Scanning Scope for Panel...");
            if (reportData && reportData.length > 0) {
                reportPanel_1.ReportPanelManager.createOrShow(context.extensionUri, reportData);
            }
            else if (reportData) {
                vscode.window.showInformationMessage("No matching diagnostics in scope.");
            }
        }
    }));
    registerSimpleCopyCommand(context, 'errorcontextcopier.scanWorkspaceAndCopy', async () => vscode.workspace.workspaceFolders?.map(f => f.uri), "Scanning workspace...");
    registerSimpleCopyCommand(context, 'errorcontextcopier.scanActiveFileAndCopy', async () => vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri] : undefined, "Scanning active file...");
    // Initial populate
    diagnosticTreeDataProvider.refresh();
}
/**
 * Resolves context target URIs from command arguments (explorer selection, active editor, or workspace).
 */
function getContextUris(clickedUri, selectedUris) {
    if (selectedUris && selectedUris.length > 0) {
        return selectedUris;
    }
    if (clickedUri) {
        return [clickedUri];
    }
    if (vscode.window.activeTextEditor) {
        return [vscode.window.activeTextEditor.document.uri];
    }
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        return vscode.workspace.workspaceFolders.map(f => f.uri);
    }
    vscode.window.showInformationMessage("No workspace or file selected.");
    return undefined;
}
/**
 * Triggers a scan for the given URIs and copies the generated report to the clipboard.
 */
async function triggerScanAndCopyToClipboard(uris, scanTitle, formatName) {
    const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, scanTitle);
    if (reportData && reportData.length > 0) {
        await copyReportToClipboard((0, diagnosticScanner_1.generateMarkdownReport)(reportData), formatName, reportData.length);
    }
    else if (reportData) {
        vscode.window.showInformationMessage("No matching diagnostics.");
    }
}
/**
 * Triggers a scan for the given URIs and prompts the user to select an export format.
 */
async function triggerScanAndExport(uris, scanTitle) {
    const reportData = await (0, diagnosticScanner_1.collectAndProcessDiagnostics)(uris, scanTitle);
    if (!reportData)
        return;
    if (reportData.length === 0) {
        vscode.window.showInformationMessage("No matching diagnostics to export.");
        return;
    }
    const formatOptions = [
        { label: "Markdown", description: "Standard Markdown format", generator: diagnosticScanner_1.generateMarkdownReport, formatName: "Markdown" },
        { label: "AI Fix Prompt", description: "Prompt formatted for ChatGPT/Claude/Gemini", generator: diagnosticScanner_1.generateAiPrompt, formatName: "AI Prompt" },
        { label: "JSON", description: "Structured JSON output", generator: diagnosticScanner_1.generateJsonReport, formatName: "JSON" },
        { label: "HTML", description: "Self-contained HTML document", generator: diagnosticScanner_1.generateHtmlFileReport, formatName: "HTML" },
        { label: "CSV", description: "Comma Separated Values", generator: diagnosticScanner_1.generateCsvReport, formatName: "CSV" },
    ];
    const selected = await vscode.window.showQuickPick(formatOptions, { placeHolder: "Select report format" });
    if (selected) {
        await copyReportToClipboard(selected.generator(reportData), selected.formatName, reportData.length);
    }
}
/**
 * Registers a simplified command for scanning and copying a Markdown report.
 */
function registerSimpleCopyCommand(context, commandId, getTargetUris, scanTitle) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async (clickedUri, selectedUris) => {
        const uris = await getTargetUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0) {
            if (commandId.includes('ActiveFile'))
                vscode.window.showInformationMessage("No active file.");
            else if (commandId.includes('Workspace') && (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0))
                vscode.window.showInformationMessage("No workspace open.");
            return;
        }
        await triggerScanAndCopyToClipboard(uris, scanTitle, "Markdown");
    }));
}
/**
 * Prompts the user to select one or more subfolders from the current workspace(s) for scanning.
 */
async function promptForSubfolderSelection() {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || wsFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace open.");
        return undefined;
    }
    const items = [];
    for (const ws of wsFolders) {
        try {
            for (const [name, type] of await vscode.workspace.fs.readDirectory(ws.uri)) {
                if (type === vscode.FileType.Directory && !name.startsWith('.') && !['node_modules', 'out', 'dist', 'build'].includes(name)) {
                    items.push({
                        label: wsFolders.length > 1 ? `${ws.name}/${name}` : name,
                        description: `In '${ws.name}'`,
                        uri: vscode.Uri.joinPath(ws.uri, name)
                    });
                }
            }
        }
        catch (e) {
            console.error(`Error reading dir ${ws.uri.fsPath}: ${e}`);
        }
    }
    if (items.length === 0) {
        vscode.window.showInformationMessage("No scannable subfolders found.");
        return undefined;
    }
    const picks = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: "Select subfolder(s)" });
    return picks?.map(p => p.uri);
}
/**
 * Copies the provided report string to the clipboard.
 */
async function copyReportToClipboard(reportString, formatName, groupCount) {
    try {
        await vscode.env.clipboard.writeText(reportString);
        vscode.window.showInformationMessage(`${formatName} report copied to clipboard! (${groupCount} item(s))`);
    }
    catch (e) {
        console.error("Clipboard fail:", e);
        vscode.window.showErrorMessage(`Failed to copy ${formatName} report.`);
        if (reportString.length < 2000) {
            vscode.window.showInformationMessage(`Report (could not copy):\n\n${reportString}`, { modal: true });
        }
    }
}
/**
 * Called when the extension is deactivated.
 */
function deactivate() {
    if (reportPanel_1.ReportPanelManager.currentPanel) {
        reportPanel_1.ReportPanelManager.currentPanel.dispose();
    }
    if (statusBarController) {
        statusBarController.dispose();
    }
}
//# sourceMappingURL=extension.js.map