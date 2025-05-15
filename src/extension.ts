import * as vscode from 'vscode';
import * as fs from 'fs';
import { DiagnosticTreeDataProvider, DiagnosticNode, FileNode, RawDiagnosticInfo } from './diagnosticTreeDataProvider';

interface FolderQuickPickItem extends vscode.QuickPickItem { uri: vscode.Uri; }

interface FormattedReportGroup {
    filePath: string;
    fullPath: string;
    individualMessages: Array<{ message: string; originalStartLine: number; severity: string; code?: string | number }>;
    contextDisplayStartLineNumber: number;
    linesBeforeGroupContent?: string[];
    groupCodeLines: string[];
    linesAfterGroupContent?: string[];
}

const SEVERITY_MAP: { [key: string]: vscode.DiagnosticSeverity } = {
    "Error": vscode.DiagnosticSeverity.Error,
    "Warning": vscode.DiagnosticSeverity.Warning,
    "Information": vscode.DiagnosticSeverity.Information,
    "Hint": vscode.DiagnosticSeverity.Hint
};

const SEVERITY_TO_STRING_MAP: { [key: number]: string } = {
    [vscode.DiagnosticSeverity.Error]: "Error",
    [vscode.DiagnosticSeverity.Warning]: "Warning",
    [vscode.DiagnosticSeverity.Information]: "Information",
    [vscode.DiagnosticSeverity.Hint]: "Hint"
};

let reportPanel: vscode.WebviewPanel | undefined = undefined;
let diagnosticTreeDataProvider: DiagnosticTreeDataProvider;

/**
 * Called when the extension is activated. This is the main entry point.
 * It sets up the diagnostics tree view, registers all commands, and
 * initializes event listeners.
 * @param {vscode.ExtensionContext} context - The extension context provided by VS Code.
 */
export function activate(context: vscode.ExtensionContext) {
    diagnosticTreeDataProvider = new DiagnosticTreeDataProvider();
    const diagnosticTreeView = vscode.window.createTreeView('errorContextCopierDiagnosticsView', { treeDataProvider: diagnosticTreeDataProvider });
    context.subscriptions.push(diagnosticTreeView);
    vscode.commands.executeCommand('setContext', 'errorContextCopier.treeFilterActive', false);

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.refreshDiagnosticsView', () => diagnosticTreeDataProvider.refresh())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.view.setTreeFilter', async () => {
            const currentFilter = diagnosticTreeDataProvider.getFilterText();
            const filterText = await vscode.window.showInputBox({
                prompt: "Filter diagnostics by file path or message (leave empty to clear)",
                value: currentFilter || '',
                placeHolder: "e.g., myFile.ts or 'is not defined'"
            });
            if (filterText !== undefined) {
                diagnosticTreeDataProvider.setFilterText(filterText || undefined);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.view.clearTreeFilter', () => {
            diagnosticTreeDataProvider.clearFilterText();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.view.scanWorkspaceAndShowPanel', async () => {
            const wsFolders = vscode.workspace.workspaceFolders;
            if (!wsFolders || wsFolders.length === 0) { vscode.window.showErrorMessage("No workspace open."); return; }
            const reportData = await collectAndProcessDiagnostics(wsFolders.map(f => f.uri), "Scanning Workspace for Panel...");
            if (reportData && reportData.length > 0) createOrShowReportPanel(context.extensionUri, reportData);
            else if (reportData) vscode.window.showInformationMessage("No matching diagnostics in workspace.");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.view.scanWorkspaceAndExportAs', async () => {
            const wsFolders = vscode.workspace.workspaceFolders;
            if (!wsFolders || wsFolders.length === 0) { vscode.window.showErrorMessage("No workspace open."); return; }
            await triggerScanAndExport(wsFolders.map(f => f.uri), "Scanning Workspace for Export...");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.view.defineScanScopeAndShowPanel', async () => {
            const uris = await promptForSubfolderSelection();
            if (uris && uris.length > 0) {
                const reportData = await collectAndProcessDiagnostics(uris, "Scanning Scope for Panel...");
                if (reportData && reportData.length > 0) createOrShowReportPanel(context.extensionUri, reportData);
                else if (reportData) vscode.window.showInformationMessage("No matching diagnostics in scope.");
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.tree.goToDiagnostic', async (rawInfo: RawDiagnosticInfo) => {
            if (rawInfo?.fileUri) {
                try {
                    const doc = await vscode.workspace.openTextDocument(rawInfo.fileUri);
                    const editor = await vscode.window.showTextDocument(doc, { selection: new vscode.Selection(rawInfo.range.start, rawInfo.range.end) });
                    editor.revealRange(new vscode.Range(rawInfo.range.start, rawInfo.range.end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                } catch (e) { vscode.window.showErrorMessage(`Failed to open file: ${rawInfo.fileUri.fsPath}. ${e}`); }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.tree.copyDiagnosticMessage', async (item: DiagnosticNode) => {
            if (item?.rawInfo) { await vscode.env.clipboard.writeText(item.rawInfo.message); vscode.window.showInformationMessage('Diagnostic message copied.'); }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.tree.scanFileForPanel', async (item: FileNode) => {
            if (item?.fileUri) {
                const reportData = await collectAndProcessDiagnostics([item.fileUri], `Scanning ${item.label} for Panel...`);
                if (reportData && reportData.length > 0) createOrShowReportPanel(context.extensionUri, reportData);
                else if (reportData) vscode.window.showInformationMessage(`No matching diagnostics in ${item.label}.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.tree.scanFileForClipboard', async (item: FileNode) => {
            if (item?.fileUri) {
                const reportData = await collectAndProcessDiagnostics([item.fileUri], `Scanning ${item.label} for Clipboard...`);
                if (reportData && reportData.length > 0) await copyReportToClipboard(generateMarkdownReport(reportData), "Markdown", reportData.length);
                else if (reportData) vscode.window.showInformationMessage(`No matching diagnostics in ${item.label}.`);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            if (diagnosticTreeDataProvider && vscode.workspace.getWorkspaceFolder(doc.uri)) {
                setTimeout(() => diagnosticTreeDataProvider.refresh(), 500);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.scanSubfoldersAndCopy', async () => {
            const uris = await promptForSubfolderSelection();
            if (uris) await triggerScanAndCopyToClipboard(uris, "Scanning subfolder(s)...", "Markdown");
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.scanAndShowInPanel', async () => {
            const uris = await promptForSubfolderSelection();
            if (uris) {
                const reportData = await collectAndProcessDiagnostics(uris, "Scanning for Panel...");
                if (reportData && reportData.length > 0) createOrShowReportPanel(context.extensionUri, reportData);
                else if (reportData) vscode.window.showInformationMessage("No matching diagnostics for panel.");
            }
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('errorcontextcopier.scanAndExportReportAs', async () => {
            const uris = await promptForSubfolderSelection();
            if (uris) await triggerScanAndExport(uris, "Scanning for export...");
        })
    );

    registerSimpleCopyCommand(context, 'errorcontextcopier.scanWorkspaceAndCopy', async () => vscode.workspace.workspaceFolders?.map(f => f.uri), "Scanning workspace...");
    registerSimpleCopyCommand(context, 'errorcontextcopier.scanActiveFileAndCopy', async () => vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri] : undefined, "Scanning active file...");
    registerSimpleCopyCommand(context, 'errorcontextcopier.scanExplorerSelectionAndCopy', async (c?: vscode.Uri, s?: vscode.Uri[]) => s && s.length > 0 ? s : (c ? [c] : []), "Scanning selection...");

    diagnosticTreeDataProvider.refresh();
}

/**
 * Triggers a scan for the given URIs and copies the generated report to the clipboard
 * in the specified format (currently only Markdown).
 * @param {vscode.Uri[]} uris - The URIs of folders/files to scan.
 * @param {string} scanTitle - The title to display in the progress notification.
 * @param {"Markdown"} formatName - The name of the format for the report.
 */
async function triggerScanAndCopyToClipboard(uris: vscode.Uri[], scanTitle: string, formatName: "Markdown") {
    const reportData = await collectAndProcessDiagnostics(uris, scanTitle);
    if (reportData && reportData.length > 0) {
        await copyReportToClipboard(generateMarkdownReport(reportData), formatName, reportData.length);
    } else if (reportData) vscode.window.showInformationMessage("No matching diagnostics.");
}

/**
 * Triggers a scan for the given URIs and prompts the user to select an export format.
 * The generated report is then copied to the clipboard.
 * @param {vscode.Uri[]} uris - The URIs of folders/files to scan.
 * @param {string} scanTitle - The title to display in the progress notification.
 */
async function triggerScanAndExport(uris: vscode.Uri[], scanTitle: string) {
    const reportData = await collectAndProcessDiagnostics(uris, scanTitle);
    if (!reportData) return;
    if (reportData.length === 0) { vscode.window.showInformationMessage("No matching diagnostics to export."); return; }
    const formatOptions: Array<vscode.QuickPickItem & { generator: (data: FormattedReportGroup[]) => string, formatName: string }> = [
        { label: "Markdown", description: "Standard Markdown format", generator: generateMarkdownReport, formatName: "Markdown" },
        { label: "JSON", description: "Structured JSON output", generator: generateJsonReport, formatName: "JSON" },
        { label: "HTML", description: "Self-contained HTML document", generator: generateHtmlFileReport, formatName: "HTML" },
        { label: "CSV", description: "Comma Separated Values", generator: generateCsvReport, formatName: "CSV" },
    ];
    const selected = await vscode.window.showQuickPick(formatOptions, { placeHolder: "Select report format" });
    if (selected) await copyReportToClipboard(selected.generator(reportData), selected.formatName, reportData.length);
}

/**
 * Registers a simplified command for scanning and copying a Markdown report.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @param {string} commandId - The ID of the command to register.
 * @param {() => Promise<vscode.Uri[]|undefined> | (vscode.Uri[]|undefined)} getTargetUris - Function to get target URIs.
 * @param {string} scanTitle - The title for the progress notification.
 */
function registerSimpleCopyCommand(
    context: vscode.ExtensionContext,
    commandId: string,
    getTargetUris: (clickedUri?: vscode.Uri, selectedUris?: vscode.Uri[]) => Promise<vscode.Uri[] | undefined> | (vscode.Uri[] | undefined),
    scanTitle: string
) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, async (clickedUri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
        const uris = await getTargetUris(clickedUri, selectedUris);
        if (!uris || uris.length === 0) {
            if (commandId.includes('ActiveFile')) vscode.window.showInformationMessage("No active file.");
            else if (commandId.includes('Workspace') && (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0)) vscode.window.showInformationMessage("No workspace open.");
            else if (commandId.includes('Explorer')) vscode.window.showInformationMessage("No items selected in Explorer.");
            return;
        }
        await triggerScanAndCopyToClipboard(uris, scanTitle, "Markdown");
    }));
}

/**
 * Prompts the user to select one or more subfolders from the current workspace(s) for scanning.
 * @returns {Promise<vscode.Uri[] | undefined>} A promise that resolves to an array of selected folder URIs, or undefined if no selection is made.
 */
async function promptForSubfolderSelection(): Promise<vscode.Uri[] | undefined> {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (!wsFolders || wsFolders.length === 0) { vscode.window.showErrorMessage("No workspace open."); return undefined; }
    const items: FolderQuickPickItem[] = [];
    for (const ws of wsFolders) {
        try {
            for (const [name, type] of await vscode.workspace.fs.readDirectory(ws.uri))
                if (type === vscode.FileType.Directory && !name.startsWith('.') && !['node_modules', 'out', 'dist', 'build'].includes(name))
                    items.push({ label: wsFolders.length > 1 ? `${ws.name}/${name}` : name, description: `In '${ws.name}'`, uri: vscode.Uri.joinPath(ws.uri, name) });
        } catch (e) { console.error(`Error reading dir ${ws.uri.fsPath}: ${e}`); }
    }
    if (items.length === 0) { vscode.window.showInformationMessage("No scannable subfolders found."); return undefined; }
    const picks = await vscode.window.showQuickPick(items, { canPickMany: true, placeHolder: "Select subfolder(s)" });
    return picks?.map(p => p.uri);
}

/**
 * Collects diagnostics from the specified URIs, processes them according to extension settings,
 * and groups them for reporting.
 * @param {vscode.Uri[]} targetUris - An array of URIs (files or folders) to scan.
 * @param {string} scanTitle - The title to display for the progress notification.
 * @returns {Promise<FormattedReportGroup[] | null>} A promise that resolves to an array of formatted report groups,
 * or null if the operation was cancelled. Returns an empty array if no diagnostics are found.
 */
async function collectAndProcessDiagnostics(targetUris: vscode.Uri[], scanTitle: string): Promise<FormattedReportGroup[] | null> {
    const config = vscode.workspace.getConfiguration('errorcontextcopier');
    const severities = config.get<string[]>('includeSeverities', ['Error']).map(s => SEVERITY_MAP[s]).filter(s => s !== undefined);
    const ignoreCodes = config.get<(string | number)[]>('ignoredErrorCodes', []);
    const ignoreMsgs = config.get<string[]>('ignoredErrorMessages', []);
    const diagsForProc: RawDiagnosticInfo[] = [];
    const linesCache = new Map<string, string[]>();
    let cancelled = false;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: scanTitle, cancellable: true }, async (prog, token) => {
        token.onCancellationRequested(() => { cancelled = true; vscode.window.showInformationMessage("Scan cancelled."); });
        const estimate = await estimateTotalFiles(targetUris); let processed = 0;
        const files: vscode.Uri[] = [], folders: vscode.Uri[] = [];
        for (const u of targetUris) { if (token.isCancellationRequested) break; try { (await vscode.workspace.fs.stat(u)).type === vscode.FileType.Directory ? folders.push(u) : files.push(u); } catch (e) { console.warn(`Stat error ${u.fsPath}: ${e}`); } }

        const processFile = async (fUri: vscode.Uri) => {
            if (token.isCancellationRequested) return;
            processed++; prog.report({ message: `Processing: ${vscode.workspace.asRelativePath(fUri)}`, increment: (1 / Math.max(1, estimate)) * 100 });
            try {
                let actionable = vscode.languages.getDiagnostics(fUri).filter(d => severities.includes(d.severity));
                if (ignoreCodes.length > 0) actionable = actionable.filter(e => !e.code || !ignoreCodes.some(ic => String(ic) === (typeof e.code === 'object' ? String(e.code.value) : String(e.code))));
                if (ignoreMsgs.length > 0) actionable = actionable.filter(e => !ignoreMsgs.some(p => { try { return p.startsWith('/') && p.lastIndexOf('/') > 0 ? new RegExp(p.substring(1, p.lastIndexOf('/')), p.substring(p.lastIndexOf('/') + 1)).test(e.message) : e.message.includes(p); } catch { return false; } }));
                if (actionable.length > 0) {
                    if (!linesCache.has(fUri.toString())) linesCache.set(fUri.toString(), (await vscode.workspace.openTextDocument(fUri)).getText().split(/\r?\n/));
                    for (const e of actionable) diagsForProc.push({ filePath: vscode.workspace.asRelativePath(fUri, false), fileUri: fUri, message: e.message, startLineZeroIndexed: e.range.start.line, endLineZeroIndexed: e.range.end.line, code: typeof e.code === 'object' ? e.code.value : e.code, severity: e.severity, range: e.range });
                }
            } catch (e) { console.error(`File processing error ${fUri.fsPath}: ${e}`); }
        };
        for (const f of files) await processFile(f);
        for (const d of folders) {
            if (token.isCancellationRequested) break;
            prog.report({ message: `Scanning folder: ${vscode.workspace.asRelativePath(d)}` });
            for (const fInD of await vscode.workspace.findFiles(new vscode.RelativePattern(d, '**/*'), getDefaultExcludes())) await processFile(fInD);
        }
    });
    if (cancelled) return null;
    return diagsForProc.length === 0 ? [] : processDiagnosticsForReportGrouping(diagsForProc, linesCache);
}

/**
 * Groups collected raw diagnostics by file and proximity for report generation.
 * @param {RawDiagnosticInfo[]} diagnostics - The raw diagnostic information to process.
 * @param {Map<string, string[]>} docLinesCache - A cache of document lines, keyed by file URI string.
 * @returns {FormattedReportGroup[]} An array of formatted groups ready for reporting.
 */
function processDiagnosticsForReportGrouping(diagnostics: RawDiagnosticInfo[], docLinesCache: Map<string, string[]>): FormattedReportGroup[] {
    if (!diagnostics.length) return [];
    const config = vscode.workspace.getConfiguration('errorcontextcopier');
    const linesBefore = config.get<number>('contextLinesBefore', 1);
    const linesAfter = config.get<number>('contextLinesAfter', 1);
    const threshold = config.get<number>('groupingLineThreshold', 2);
    diagnostics.sort((a, b) => (a.fileUri.toString() < b.fileUri.toString() ? -1 : (a.fileUri.toString() > b.fileUri.toString() ? 1 : a.startLineZeroIndexed - b.startLineZeroIndexed)));

    interface TmpGrp { fileP: string; fileU: vscode.Uri; diags: RawDiagnosticInfo[]; startL: number; endL: number; }
    const rawGrps: TmpGrp[] = [];
    let curGrp: TmpGrp | null = null;

    for (const d of diagnostics) {
        if (!curGrp || curGrp.fileU.toString() !== d.fileUri.toString() || d.startLineZeroIndexed > curGrp.endL + threshold) {
            curGrp = { fileP: d.filePath, fileU: d.fileUri, diags: [d], startL: d.startLineZeroIndexed, endL: d.endLineZeroIndexed };
            rawGrps.push(curGrp);
        } else {
            curGrp.diags.push(d);
            curGrp.endL = Math.max(curGrp.endL, d.endLineZeroIndexed);
        }
    }

    const fmtGrps: FormattedReportGroup[] = [];
    for (const g of rawGrps) {
        const fLines = docLinesCache.get(g.fileU.toString()); if (!fLines) continue;
        const msgs: FormattedReportGroup['individualMessages'] = g.diags.map(d => ({
            message: d.message,
            originalStartLine: d.startLineZeroIndexed + 1,
            severity: SEVERITY_TO_STRING_MAP[d.severity] ?? "Unknown",
            code: typeof d.code === 'object' ? String(d.code.value) : String(d.code)
        }));
        const actualStart = Math.max(0, g.startL);
        const actualEnd = Math.min(fLines.length - 1, g.endL);
        if (actualStart > actualEnd) continue;

        const codeLs = fLines.slice(actualStart, actualEnd + 1);
        const startBef = Math.max(0, actualStart - linesBefore);

        fmtGrps.push({
            filePath: g.fileP,
            fullPath: g.fileU.fsPath,
            individualMessages: msgs,
            contextDisplayStartLineNumber: actualStart + 1,
            linesBeforeGroupContent: actualStart > 0 && linesBefore > 0 ? fLines.slice(startBef, actualStart) : undefined,
            groupCodeLines: codeLs,
            linesAfterGroupContent: actualEnd < fLines.length - 1 && linesAfter > 0 ? fLines.slice(actualEnd + 1, Math.min(fLines.length, actualEnd + 1 + linesAfter)) : undefined,
        });
    }
    return fmtGrps;
}

/**
 * Generates a Markdown formatted report string from the grouped diagnostics.
 * @param {FormattedReportGroup[]} formattedReportGroups - The grouped diagnostic data.
 * @returns {string} The Markdown report string.
 */
function generateMarkdownReport(formattedReportGroups: FormattedReportGroup[]): string {
    const lineNumberPadding = 5;
    let report = `## Diagnostic Report (Generated by Error Context Copier)\n\n`;
    report += `Scan completed on: ${new Date().toLocaleString()}\n`;
    report += `Found diagnostics in ${formattedReportGroups.length} group(s)/file-section(s).\n\n`;
    report += "---\n\n";

    for (const group of formattedReportGroups) {
        report += `**File:** \`${group.filePath}\`\n`;
        const firstMsg = group.individualMessages[0];
        const lastMsg = group.individualMessages[group.individualMessages.length - 1];

        if (group.individualMessages.length > 1) {
            report += `**Diagnostics (Lines ${firstMsg.originalStartLine} - ${lastMsg.originalStartLine}):**\n`;
        } else {
            report += `**Diagnostic (Line ${firstMsg.originalStartLine}):**\n`;
        }
        for (const diagMsg of group.individualMessages) {
            report += `  - **${diagMsg.severity} (L${diagMsg.originalStartLine}):** ${diagMsg.message}${diagMsg.code ? ` (${diagMsg.code})` : ''}\n`;
        }
        report += "\n```text\n";
        if (group.linesBeforeGroupContent) {
            for (let i = 0; i < group.linesBeforeGroupContent.length; i++) {
                const lineNo = group.contextDisplayStartLineNumber - group.linesBeforeGroupContent.length + i;
                report += `${String(lineNo).padStart(lineNumberPadding)} | ${group.linesBeforeGroupContent[i]}\n`;
            }
        }
        for (let i = 0; i < group.groupCodeLines.length; i++) {
            report += `${String(group.contextDisplayStartLineNumber + i).padStart(lineNumberPadding)} > ${group.groupCodeLines[i]}\n`;
        }
        if (group.linesAfterGroupContent) {
            const firstLineNum = group.contextDisplayStartLineNumber + group.groupCodeLines.length;
            for (let i = 0; i < group.linesAfterGroupContent.length; i++) {
                report += `${String(firstLineNum + i).padStart(lineNumberPadding)} | ${group.linesAfterGroupContent[i]}\n`;
            }
        }
        report += "```\n---\n\n";
    }
    return report;
}

/**
 * Generates a JSON formatted report string from the grouped diagnostics.
 * @param {FormattedReportGroup[]} formattedReportGroups - The grouped diagnostic data.
 * @returns {string} The JSON report string.
 */
function generateJsonReport(formattedReportGroups: FormattedReportGroup[]): string {
    return JSON.stringify(formattedReportGroups, null, 2);
}

/**
 * Escapes HTML special characters in a string.
 * @param {(string | number | undefined)} unsafe - The string or number to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(unsafe: string | number | undefined): string {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)

        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

/**
 * Generates a self-contained HTML file report string from the grouped diagnostics.
 * @param {FormattedReportGroup[]} formattedReportGroups - The grouped diagnostic data.
 * @returns {string} The HTML report string.
 */
function generateHtmlFileReport(formattedReportGroups: FormattedReportGroup[]): string {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diagnostic Report</title>
    <style>
        body { font-family: sans-serif; margin: 20px; line-height: 1.6; }
        .report-group { border: 1px solid #ccc; margin-bottom: 20px; padding: 15px; border-radius: 5px; }
        h1, h2 { margin-top: 0; }
        h3 { margin-top: 0; font-size: 1.1em; }
        ul { padding-left: 20px; }
        pre { background-color: #f4f4f4; padding: 10px; border-radius: 3px; white-space: pre-wrap; word-wrap: break-word; }
        .severity-Error { color: red; font-weight: bold; }
        .severity-Warning { color: orange; font-weight: bold; }
        .severity-Information { color: blue; }
        .severity-Hint { color: green; }
        .line-num { display: inline-block; width: 3em; color: #888; text-align: right; margin-right: 5px;}
        .error-line > .line-num { font-weight: bold; color: #555;}
    </style>
</head>
<body>
    <h1>Diagnostic Report</h1>
    <p>Scan completed on: ${new Date().toLocaleString()}</p>
    <p>Found diagnostics in ${formattedReportGroups.length} group(s)/file-section(s).</p>
    <hr>`;

    for (const group of formattedReportGroups) {
        html += `<div class="report-group">
        <h2>File: <code>${escapeHtml(group.filePath)}</code></h2>`;

        const firstMsg = group.individualMessages[0];
        const lastMsg = group.individualMessages[group.individualMessages.length - 1];
        if (group.individualMessages.length > 1) {
            html += `<h3>Diagnostics (Lines ${firstMsg.originalStartLine} - ${lastMsg.originalStartLine}):</h3>`;
        } else {
            html += `<h3>Diagnostic (Line ${firstMsg.originalStartLine}):</h3>`;
        }
        html += `<ul>`;
        for (const diagMsg of group.individualMessages) {
            html += `<li><strong class="severity-${escapeHtml(diagMsg.severity)}">${escapeHtml(diagMsg.severity)} (L${diagMsg.originalStartLine}):</strong> ${escapeHtml(diagMsg.message)}${diagMsg.code ? ` (${escapeHtml(diagMsg.code)})` : ''}</li>`;
        }
        html += `</ul>
        <pre>`;
        if (group.linesBeforeGroupContent) {
            for (let i = 0; i < group.linesBeforeGroupContent.length; i++) {
                const lineNo = group.contextDisplayStartLineNumber - group.linesBeforeGroupContent.length + i;
                html += `<div><span class="line-num">${lineNo}</span> ${escapeHtml(group.linesBeforeGroupContent[i])}</div>`;
            }
        }
        for (let i = 0; i < group.groupCodeLines.length; i++) {
            html += `<div class="error-line"><span class="line-num">${group.contextDisplayStartLineNumber + i}</span> ${escapeHtml(group.groupCodeLines[i])}</div>`;
        }
        if (group.linesAfterGroupContent) {
            const firstLineNum = group.contextDisplayStartLineNumber + group.groupCodeLines.length;
            for (let i = 0; i < group.linesAfterGroupContent.length; i++) {
                html += `<div><span class="line-num">${firstLineNum + i}</span> ${escapeHtml(group.linesAfterGroupContent[i])}</div>`;
            }
        }
        html += `</pre></div><hr>`;
    }
    html += `</body></html>`;
    return html;
}

/**
 * Generates a CSV formatted report string from the grouped diagnostics.
 * @param {FormattedReportGroup[]} formattedReportGroups - The grouped diagnostic data.
 * @returns {string} The CSV report string.
 */
function generateCsvReport(formattedReportGroups: FormattedReportGroup[]): string {
    let csv = '"File Path","Severity","Line Number","Message","Code","Context Code Snippet"\n';
    const escapeCsvField = (field: string | number | undefined) => {
        if (field === null || field === undefined) return '""';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
    };

    for (const group of formattedReportGroups) {
        const contextSnippetLines: string[] = [];
        if (group.linesBeforeGroupContent) contextSnippetLines.push(...group.linesBeforeGroupContent);
        contextSnippetLines.push(...group.groupCodeLines);
        if (group.linesAfterGroupContent) contextSnippetLines.push(...group.linesAfterGroupContent);
        const contextSnippet = contextSnippetLines.join('\n');

        for (const diag of group.individualMessages) {
            csv += `${escapeCsvField(group.filePath)},`;
            csv += `${escapeCsvField(diag.severity)},`;
            csv += `${escapeCsvField(diag.originalStartLine)},`;
            csv += `${escapeCsvField(diag.message)},`;
            csv += `${escapeCsvField(diag.code)},`;
            csv += `${escapeCsvField(contextSnippet)}\n`;
        }
    }
    return csv;
}

/**
 * Copies the provided report string to the clipboard.
 * @param {string} reportString - The report content to copy.
 * @param {string} formatName - The name of the report format (e.g., "Markdown", "JSON").
 * @param {number} groupCount - The number of diagnostic groups in the report.
 */
async function copyReportToClipboard(reportString: string, formatName: string, groupCount: number) {
    try {
        await vscode.env.clipboard.writeText(reportString);
        vscode.window.showInformationMessage(`${formatName} report for ${groupCount} group(s) copied!`);
    } catch (e) {
        console.error("Clipboard fail:", e);
        vscode.window.showErrorMessage(`Failed to copy ${formatName} report.`);
        if (reportString.length < 2000) vscode.window.showInformationMessage(`Report (could not copy):\n\n${reportString}`, { modal: true });
    }
}

/**
 * Creates a new webview panel to display the diagnostic report or reveals an existing one.
 * @param {vscode.ExtensionContext['extensionUri']} extensionUri - The URI of the extension, for loading local resources.
 * @param {FormattedReportGroup[]} reportData - The processed diagnostic data to display.
 */
function createOrShowReportPanel(extensionUri: vscode.Uri, reportData: FormattedReportGroup[]) {
    const col = vscode.window.activeTextEditor?.viewColumn;
    if (reportPanel) {
        reportPanel.reveal(col);
        reportPanel.webview.postMessage({ command: 'loadData', data: reportData });
        return;
    }

    reportPanel = vscode.window.createWebviewPanel(
        'errorContextReport',
        'Error Context Report',
        col || vscode.ViewColumn.One,
        { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'webview-ui')] }
    );
    reportPanel.webview.html = getWebviewContent(reportPanel.webview, extensionUri);
    reportPanel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'navigateTo') {
            const { filePath, line } = msg;
            try {
                const d = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                await vscode.window.showTextDocument(d, { selection: new vscode.Selection(new vscode.Position(line - 1, 0), new vscode.Position(line - 1, 0)) });
            } catch (e) { vscode.window.showErrorMessage(`Open fail: ${filePath}. ${e}`); }
        }
        else if (msg.command === 'webviewReady') reportPanel?.webview.postMessage({ command: 'loadData', data: reportData });
        else if (msg.command === 'copyMarkdownToClipboard') await copyReportToClipboard(generateMarkdownReport(msg.data), "Markdown", msg.data.length);
    });
    reportPanel.onDidDispose(() => { reportPanel = undefined; }, null);
}

/**
 * Generates the HTML content for the webview panel, injecting necessary URIs and a nonce.
 * @param {vscode.Webview} webview - The webview instance.
 * @param {vscode.ExtensionContext['extensionUri']} extensionUri - The URI of the extension.
 * @returns {string} The HTML content string for the webview.
 */
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const htmlPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'report-panel.html');
    let htmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
    const cssPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'report-panel.css');
    const cssUri = webview.asWebviewUri(cssPathOnDisk);
    const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'report-panel.js');
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const nonce = getNonce();

    return htmlContent.replace(/\$\{nonce\}/g, nonce)
        .replace(/\$\{webview.cspSource\}/g, webview.cspSource)
        .replace(/\$\{cssUri\}/g, cssUri.toString())
        .replace(/\$\{scriptUri\}/g, scriptUri.toString());
}

/**
 * Generates a random nonce string for use in Content Security Policy.
 * @returns {string} A 32-character random string.
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Retrieves the glob pattern for default file exclusions based on VS Code settings.
 * @returns {vscode.GlobPattern | undefined} The glob pattern string, or undefined if no exclusions are set.
 */
function getDefaultExcludes(): vscode.GlobPattern | undefined {
    const conf = vscode.workspace.getConfiguration('files').get<{ [k: string]: boolean }>('exclude');
    if (conf && Object.keys(conf).length > 0) {
        const act = Object.entries(conf).filter(([, e]) => e).map(([p]) => p);
        if (act.length > 0) return `{${act.join(',')}}`;
    }
    return undefined;
}

/**
 * Estimates the total number of files to be scanned from a list of target URIs (files or folders).
 * @param {vscode.Uri[]} uris - An array of URIs to estimate file count for.
 * @returns {Promise<number>} A promise that resolves to the estimated total number of files.
 */
async function estimateTotalFiles(uris: vscode.Uri[]): Promise<number> {
    let c = 0; const lim = 500;
    for (const u of uris) {
        try {
            if ((await vscode.workspace.fs.stat(u)).type === vscode.FileType.Directory)
                c += (await vscode.workspace.findFiles(new vscode.RelativePattern(u, '**/*'), getDefaultExcludes(), lim)).length;
            else c += 1;
        } catch (e) { console.warn(`Estimate fail ${u.fsPath}: ${e}`); c += 1; }
    }
    return c > 0 ? c : (uris.length > 0 ? uris.length : 10);
}

/**
 * Called when the extension is deactivated. Disposes of the report panel if it exists.
 */
export function deactivate() {
    if (reportPanel) reportPanel.dispose();
}