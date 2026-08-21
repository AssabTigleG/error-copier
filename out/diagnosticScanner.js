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
exports.yieldToEventLoop = yieldToEventLoop;
exports.escapeHtml = escapeHtml;
exports.escapeCsvField = escapeCsvField;
exports.getDefaultExcludes = getDefaultExcludes;
exports.estimateTotalFiles = estimateTotalFiles;
exports.processDiagnosticsForReportGrouping = processDiagnosticsForReportGrouping;
exports.collectAndProcessDiagnostics = collectAndProcessDiagnostics;
exports.generateMarkdownReport = generateMarkdownReport;
exports.generateJsonReport = generateJsonReport;
exports.generateHtmlFileReport = generateHtmlFileReport;
exports.generateCsvReport = generateCsvReport;
const vscode = __importStar(require("vscode"));
const types_1 = require("./types");
/**
 * Yields execution to the event loop so the UI remains responsive during long scans.
 */
function yieldToEventLoop() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
/**
 * Escapes HTML special characters in a string.
 */
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined)
        return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * Escapes CSV special characters in a string.
 */
function escapeCsvField(field) {
    if (field === null || field === undefined)
        return '""';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
}
/**
 * Retrieves the glob pattern for default file exclusions based on VS Code settings.
 */
function getDefaultExcludes() {
    const conf = vscode.workspace.getConfiguration('files').get('exclude');
    if (conf && Object.keys(conf).length > 0) {
        const act = Object.entries(conf).filter(([, e]) => e).map(([p]) => p);
        if (act.length > 0)
            return `{${act.join(',')}}`;
    }
    return undefined;
}
/**
 * Estimates the total number of files to be scanned from a list of target URIs.
 */
async function estimateTotalFiles(uris) {
    let count = 0;
    const limit = 500;
    for (const u of uris) {
        try {
            const stat = await vscode.workspace.fs.stat(u);
            if (stat.type === vscode.FileType.Directory) {
                const found = await vscode.workspace.findFiles(new vscode.RelativePattern(u, '**/*'), getDefaultExcludes(), limit);
                count += found.length;
            }
            else {
                count += 1;
            }
        }
        catch (e) {
            console.warn(`Estimate fail ${u.fsPath}: ${e}`);
            count += 1;
        }
    }
    return count > 0 ? count : (uris.length > 0 ? uris.length : 10);
}
/**
 * Groups collected raw diagnostics by file and proximity for report generation.
 */
function processDiagnosticsForReportGrouping(diagnostics, docLinesCache, options) {
    if (!diagnostics.length)
        return [];
    const config = vscode.workspace.getConfiguration('errorcontextcopier');
    const linesBefore = options?.linesBefore ?? config.get('contextLinesBefore', 1);
    const linesAfter = options?.linesAfter ?? config.get('contextLinesAfter', 1);
    const threshold = options?.threshold ?? config.get('groupingLineThreshold', 2);
    const sortedDiags = [...diagnostics].sort((a, b) => {
        const uriA = a.fileUri.toString();
        const uriB = b.fileUri.toString();
        if (uriA < uriB)
            return -1;
        if (uriA > uriB)
            return 1;
        return a.startLineZeroIndexed - b.startLineZeroIndexed;
    });
    const rawGrps = [];
    let curGrp = null;
    for (const d of sortedDiags) {
        if (!curGrp || curGrp.fileU.toString() !== d.fileUri.toString() || d.startLineZeroIndexed > curGrp.endL + threshold) {
            curGrp = {
                fileP: d.filePath,
                fileU: d.fileUri,
                diags: [d],
                startL: d.startLineZeroIndexed,
                endL: d.endLineZeroIndexed
            };
            rawGrps.push(curGrp);
        }
        else {
            curGrp.diags.push(d);
            curGrp.endL = Math.max(curGrp.endL, d.endLineZeroIndexed);
        }
    }
    const fmtGrps = [];
    for (const g of rawGrps) {
        const fLines = docLinesCache.get(g.fileU.toString());
        if (!fLines)
            continue;
        const msgs = g.diags.map(d => ({
            message: d.message,
            originalStartLine: d.startLineZeroIndexed + 1,
            severity: types_1.SEVERITY_TO_STRING_MAP[d.severity] ?? "Unknown",
            code: typeof d.code === 'object' ? String(d.code.value) : (d.code !== undefined ? String(d.code) : undefined),
            source: d.source
        }));
        const actualStart = Math.max(0, g.startL);
        const actualEnd = Math.min(fLines.length - 1, g.endL);
        if (actualStart > actualEnd)
            continue;
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
 * Collects diagnostics from specified URIs with asynchronous streaming/chunking
 * to keep the UI thread responsive during large scans.
 */
async function collectAndProcessDiagnostics(targetUris, scanTitle) {
    const config = vscode.workspace.getConfiguration('errorcontextcopier');
    const configuredSeverityStrings = config.get('includeSeverities', ['Error', 'Warning']);
    const severities = configuredSeverityStrings.map(s => types_1.SEVERITY_MAP[s]).filter(s => s !== undefined);
    const ignoreCodes = config.get('ignoredErrorCodes', []);
    const ignoreMsgs = config.get('ignoredErrorMessages', []);
    const chunkSize = config.get('asyncChunkSize', 50);
    const diagsForProc = [];
    const linesCache = new Map();
    let cancelled = false;
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: scanTitle,
        cancellable: true
    }, async (prog, token) => {
        token.onCancellationRequested(() => {
            cancelled = true;
            vscode.window.showInformationMessage("Scan cancelled.");
        });
        const estimate = await estimateTotalFiles(targetUris);
        let processed = 0;
        const files = [];
        const folders = [];
        for (const u of targetUris) {
            if (token.isCancellationRequested)
                break;
            try {
                const stat = await vscode.workspace.fs.stat(u);
                if (stat.type === vscode.FileType.Directory) {
                    folders.push(u);
                }
                else {
                    files.push(u);
                }
            }
            catch (e) {
                console.warn(`Stat error ${u.fsPath}: ${e}`);
            }
        }
        const processFile = async (fUri) => {
            if (token.isCancellationRequested)
                return;
            processed++;
            if (processed % 10 === 0) {
                prog.report({
                    message: `Processing: ${vscode.workspace.asRelativePath(fUri)} (${processed}/${Math.max(processed, estimate)})`,
                    increment: (10 / Math.max(1, estimate)) * 100
                });
            }
            try {
                let actionable = vscode.languages.getDiagnostics(fUri).filter(d => severities.includes(d.severity));
                if (ignoreCodes.length > 0) {
                    actionable = actionable.filter(e => {
                        if (!e.code)
                            return true;
                        const codeVal = typeof e.code === 'object' ? String(e.code.value) : String(e.code);
                        return !ignoreCodes.some(ic => String(ic) === codeVal);
                    });
                }
                if (ignoreMsgs.length > 0) {
                    actionable = actionable.filter(e => {
                        return !ignoreMsgs.some(p => {
                            try {
                                return p.startsWith('/') && p.lastIndexOf('/') > 0
                                    ? new RegExp(p.substring(1, p.lastIndexOf('/')), p.substring(p.lastIndexOf('/') + 1)).test(e.message)
                                    : e.message.includes(p);
                            }
                            catch {
                                return false;
                            }
                        });
                    });
                }
                if (actionable.length > 0) {
                    if (!linesCache.has(fUri.toString())) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(fUri);
                            linesCache.set(fUri.toString(), doc.getText().split(/\r?\n/));
                        }
                        catch {
                            // If text doc fails, try reading raw bytes
                            const uint8 = await vscode.workspace.fs.readFile(fUri);
                            linesCache.set(fUri.toString(), Buffer.from(uint8).toString('utf8').split(/\r?\n/));
                        }
                    }
                    for (const e of actionable) {
                        diagsForProc.push({
                            filePath: vscode.workspace.asRelativePath(fUri, false),
                            fileUri: fUri,
                            message: e.message,
                            startLineZeroIndexed: e.range.start.line,
                            endLineZeroIndexed: e.range.end.line,
                            code: typeof e.code === 'object' ? e.code.value : e.code,
                            source: e.source,
                            severity: e.severity,
                            range: e.range
                        });
                    }
                }
            }
            catch (e) {
                console.error(`File processing error ${fUri.fsPath}: ${e}`);
            }
        };
        // Process individual files in chunks
        for (let i = 0; i < files.length; i += chunkSize) {
            if (token.isCancellationRequested)
                break;
            const chunk = files.slice(i, i + chunkSize);
            await Promise.all(chunk.map(f => processFile(f)));
            await yieldToEventLoop();
        }
        // Process directories in chunks
        for (const folder of folders) {
            if (token.isCancellationRequested)
                break;
            prog.report({ message: `Scanning folder: ${vscode.workspace.asRelativePath(folder)}` });
            const foundFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), getDefaultExcludes());
            for (let i = 0; i < foundFiles.length; i += chunkSize) {
                if (token.isCancellationRequested)
                    break;
                const chunk = foundFiles.slice(i, i + chunkSize);
                await Promise.all(chunk.map(f => processFile(f)));
                await yieldToEventLoop();
            }
        }
    });
    if (cancelled)
        return null;
    return diagsForProc.length === 0 ? [] : processDiagnosticsForReportGrouping(diagsForProc, linesCache);
}
/**
 * Generates a Markdown formatted report string from the grouped diagnostics.
 */
function generateMarkdownReport(formattedReportGroups) {
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
        }
        else {
            report += `**Diagnostic (Line ${firstMsg.originalStartLine}):**\n`;
        }
        for (const diagMsg of group.individualMessages) {
            const srcCode = [diagMsg.source, diagMsg.code].filter(Boolean).join(': ');
            report += `  - **${diagMsg.severity} (L${diagMsg.originalStartLine}):** ${diagMsg.message}${srcCode ? ` (${srcCode})` : ''}\n`;
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
 */
function generateJsonReport(formattedReportGroups) {
    return JSON.stringify(formattedReportGroups, null, 2);
}
/**
 * Generates a self-contained HTML file report string from the grouped diagnostics.
 */
function generateHtmlFileReport(formattedReportGroups) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diagnostic Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 20px; line-height: 1.6; color: #24292e; background-color: #f6f8fa; }
        .report-group { background: #fff; border: 1px solid #e1e4e8; margin-bottom: 20px; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        h1, h2 { margin-top: 0; }
        h3 { margin-top: 10px; font-size: 1.05em; color: #444; }
        ul { padding-left: 20px; margin: 8px 0; }
        pre { background-color: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; overflow-x: auto; font-family: Consolas, 'Courier New', monospace; font-size: 0.9em; }
        .severity-Error { color: #d73a49; font-weight: bold; }
        .severity-Warning { color: #e36209; font-weight: bold; }
        .severity-Information { color: #005cc5; }
        .severity-Hint { color: #22863a; }
        .line-num { display: inline-block; width: 3.5em; color: #6e7681; text-align: right; margin-right: 10px; user-select: none; }
        .error-line { background-color: rgba(215, 58, 73, 0.15); display: block; border-left: 3px solid #d73a49; margin: 0 -12px; padding: 0 9px; }
        .error-line > .line-num { font-weight: bold; color: #f85149; }
    </style>
</head>
<body>
    <h1>Diagnostic Report</h1>
    <p><strong>Scan completed on:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Found diagnostics:</strong> in ${formattedReportGroups.length} group(s)/file-section(s).</p>
    <hr>`;
    for (const group of formattedReportGroups) {
        html += `<div class="report-group">
        <h2>File: <code>${escapeHtml(group.filePath)}</code></h2>`;
        const firstMsg = group.individualMessages[0];
        const lastMsg = group.individualMessages[group.individualMessages.length - 1];
        if (group.individualMessages.length > 1) {
            html += `<h3>Diagnostics (Lines ${firstMsg.originalStartLine} - ${lastMsg.originalStartLine}):</h3>`;
        }
        else {
            html += `<h3>Diagnostic (Line ${firstMsg.originalStartLine}):</h3>`;
        }
        html += `<ul>`;
        for (const diagMsg of group.individualMessages) {
            const srcCode = [diagMsg.source, diagMsg.code].filter(Boolean).join(': ');
            html += `<li><strong class="severity-${escapeHtml(diagMsg.severity)}">${escapeHtml(diagMsg.severity)} (L${diagMsg.originalStartLine}):</strong> ${escapeHtml(diagMsg.message)}${srcCode ? ` (${escapeHtml(srcCode)})` : ''}</li>`;
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
            html += `<span class="error-line"><span class="line-num">${group.contextDisplayStartLineNumber + i}</span> ${escapeHtml(group.groupCodeLines[i])}</span>`;
        }
        if (group.linesAfterGroupContent) {
            const firstLineNum = group.contextDisplayStartLineNumber + group.groupCodeLines.length;
            for (let i = 0; i < group.linesAfterGroupContent.length; i++) {
                html += `<div><span class="line-num">${firstLineNum + i}</span> ${escapeHtml(group.linesAfterGroupContent[i])}</div>`;
            }
        }
        html += `</pre></div>`;
    }
    html += `</body></html>`;
    return html;
}
/**
 * Generates a CSV formatted report string from the grouped diagnostics.
 */
function generateCsvReport(formattedReportGroups) {
    let csv = '"File Path","Severity","Line Number","Message","Code","Source","Context Code Snippet"\n';
    for (const group of formattedReportGroups) {
        const contextSnippetLines = [];
        if (group.linesBeforeGroupContent)
            contextSnippetLines.push(...group.linesBeforeGroupContent);
        contextSnippetLines.push(...group.groupCodeLines);
        if (group.linesAfterGroupContent)
            contextSnippetLines.push(...group.linesAfterGroupContent);
        const contextSnippet = contextSnippetLines.join('\n');
        for (const diag of group.individualMessages) {
            csv += `${escapeCsvField(group.filePath)},`;
            csv += `${escapeCsvField(diag.severity)},`;
            csv += `${escapeCsvField(diag.originalStartLine)},`;
            csv += `${escapeCsvField(diag.message)},`;
            csv += `${escapeCsvField(diag.code)},`;
            csv += `${escapeCsvField(diag.source || '')},`;
            csv += `${escapeCsvField(contextSnippet)}\n`;
        }
    }
    return csv;
}
//# sourceMappingURL=diagnosticScanner.js.map