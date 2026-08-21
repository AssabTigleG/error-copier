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
exports.DiagnosticTreeDataProvider = exports.WorkspaceFolderNode = exports.SourceRuleGroupNode = exports.SeverityGroupNode = exports.FileNode = exports.DiagnosticGroupNode = exports.DiagnosticNode = void 0;
exports.sanitizeDiagnosticMessage = sanitizeDiagnosticMessage;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const types_1 = require("./types");
/**
 * Cleans multi-line diagnostic messages and extracts fix hints for clean display.
 */
function sanitizeDiagnosticMessage(msg) {
    const lines = (msg || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
        return {
            title: lines[0],
            hint: lines.slice(1).join(' ')
        };
    }
    const tryMatch = (lines[0] || '').match(/^(.+?\.)\s+(Try\s+.+)$/);
    if (tryMatch) {
        return {
            title: tryMatch[1],
            hint: tryMatch[2]
        };
    }
    return { title: lines[0] || msg };
}
/**
 * Represents an individual diagnostic item in the tree view.
 */
class DiagnosticNode extends vscode.TreeItem {
    constructor(rawInfo, collapsibleState = vscode.TreeItemCollapsibleState.None) {
        const lineNum = rawInfo.startLineZeroIndexed + 1;
        const { title, hint } = sanitizeDiagnosticMessage(rawInfo.message);
        const label = `L${lineNum}: ${title}`;
        super(label, collapsibleState);
        this.rawInfo = rawInfo;
        this.collapsibleState = collapsibleState;
        const codeStr = rawInfo.code ? (typeof rawInfo.code === 'object' ? String(rawInfo.code.value) : String(rawInfo.code)) : '';
        const srcStr = rawInfo.source || '';
        const tag = [srcStr, codeStr].filter(Boolean).join(': ');
        this.description = tag ? `[${tag}]` : undefined;
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.appendMarkdown(`**${path.basename(rawInfo.filePath)}:${lineNum}**\n\n`);
        md.appendMarkdown(`* **Severity:** ${DiagnosticNode.getSeverityLabel(rawInfo.severity)}\n`);
        if (tag) {
            md.appendMarkdown(`* **Rule:** \`${tag}\`\n`);
        }
        md.appendMarkdown(`\n**Message:**\n${title}\n`);
        if (hint) {
            md.appendMarkdown(`\n💡 *${hint}*\n`);
        }
        this.tooltip = md;
        this.command = {
            command: 'errorcontextcopier.tree.goToDiagnostic',
            title: 'Go to Diagnostic',
            arguments: [this.rawInfo]
        };
        this.iconPath = DiagnosticNode.getIconForSeverity(rawInfo.severity);
        this.contextValue = 'diagnosticItem';
    }
    static getSeverityLabel(severity) {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return 'Error';
            case vscode.DiagnosticSeverity.Warning: return 'Warning';
            case vscode.DiagnosticSeverity.Information: return 'Information';
            case vscode.DiagnosticSeverity.Hint: return 'Hint';
            default: return 'Issue';
        }
    }
    static getIconForSeverity(severity) {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
            case vscode.DiagnosticSeverity.Warning:
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            case vscode.DiagnosticSeverity.Information:
                return new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
            case vscode.DiagnosticSeverity.Hint:
                return new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('editorHint.foreground'));
            default:
                return new vscode.ThemeIcon('issue-opened');
        }
    }
}
exports.DiagnosticNode = DiagnosticNode;
/**
 * Represents a group of related diagnostics clustered within a line range.
 */
class DiagnosticGroupNode extends vscode.TreeItem {
    constructor(startLineZeroIndexed, endLineZeroIndexed, fileUri, collapsibleState = vscode.TreeItemCollapsibleState.Collapsed) {
        super(`L${startLineZeroIndexed + 1} - L${endLineZeroIndexed + 1}`, collapsibleState);
        this.startLineZeroIndexed = startLineZeroIndexed;
        this.endLineZeroIndexed = endLineZeroIndexed;
        this.fileUri = fileUri;
        this.collapsibleState = collapsibleState;
        this.individualDiagnostics = [];
        this.contextValue = 'diagnosticGroupItem';
    }
    addDiagnostic(diagnosticInfo) {
        this.individualDiagnostics.push(diagnosticInfo);
        this.updateHeader();
    }
    updateHeader() {
        const count = this.individualDiagnostics.length;
        this.label = `L${this.startLineZeroIndexed + 1} - L${this.endLineZeroIndexed + 1} (${count} diagnostics)`;
        const first = this.individualDiagnostics[0];
        if (first) {
            const { title } = sanitizeDiagnosticMessage(first.message);
            this.description = `${title.substring(0, 40)}${title.length > 40 ? '...' : ''}`;
            const highestSeverity = Math.min(...this.individualDiagnostics.map(d => d.severity));
            this.iconPath = DiagnosticNode.getIconForSeverity(highestSeverity);
        }
    }
    get diagnosticsCount() {
        return this.individualDiagnostics.length;
    }
}
exports.DiagnosticGroupNode = DiagnosticGroupNode;
/**
 * Represents a file containing diagnostics in the tree view.
 */
class FileNode extends vscode.TreeItem {
    constructor(relativePath, fileUri, collapsibleState = vscode.TreeItemCollapsibleState.Collapsed) {
        const baseName = path.basename(relativePath) || relativePath;
        super(baseName, collapsibleState);
        this.relativePath = relativePath;
        this.fileUri = fileUri;
        this.collapsibleState = collapsibleState;
        this.diagnosticGroups = [];
        this.individualDiagnostics = [];
        const dirName = path.dirname(relativePath);
        const displayDir = dirName && dirName !== '.' ? dirName : '';
        this.description = displayDir;
        this.resourceUri = fileUri;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'fileItem';
    }
    addDiagnosticGroup(groupNode) {
        this.diagnosticGroups.push(groupNode);
        this.updateSummary();
    }
    addDiagnostic(diagnostic) {
        this.individualDiagnostics.push(diagnostic);
        this.updateSummary();
    }
    get highestSeverity() {
        const allDiags = this.getAllDiagnostics();
        if (allDiags.length === 0)
            return vscode.DiagnosticSeverity.Hint;
        return Math.min(...allDiags.map(d => d.severity));
    }
    updateSummary() {
        const allDiags = this.getAllDiagnostics();
        const errors = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warnings = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
        const info = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Information).length;
        const hints = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Hint).length;
        const parts = [];
        if (errors > 0)
            parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
        if (warnings > 0)
            parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
        if (info > 0 && errors === 0 && warnings === 0)
            parts.push(`${info} info`);
        if (hints > 0 && errors === 0 && warnings === 0 && info === 0)
            parts.push(`${hints} hint${hints > 1 ? 's' : ''}`);
        const dirName = path.dirname(this.relativePath);
        const displayDir = dirName && dirName !== '.' ? dirName : '';
        const countsSummary = parts.join(', ') || `${allDiags.length} issue(s)`;
        this.description = displayDir ? `${displayDir} • ${countsSummary}` : countsSummary;
        this.tooltip = `${this.fileUri.fsPath}\n${countsSummary}`;
        // Accentuate file icon if errors exist
        if (errors > 0) {
            this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('editorError.foreground'));
        }
        else if (warnings > 0) {
            this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('editorWarning.foreground'));
        }
        else {
            this.iconPath = vscode.ThemeIcon.File;
        }
    }
    getAllDiagnostics() {
        if (this.diagnosticGroups.length > 0) {
            const diags = [];
            this.diagnosticGroups.forEach(g => diags.push(...g.individualDiagnostics));
            return diags;
        }
        return this.individualDiagnostics;
    }
    get totalDiagnosticsInFile() {
        return this.getAllDiagnostics().length;
    }
}
exports.FileNode = FileNode;
/**
 * Represents a severity bucket (Errors, Warnings, Information, Hints) in the tree view.
 */
class SeverityGroupNode extends vscode.TreeItem {
    constructor(severity, label, collapsibleState = vscode.TreeItemCollapsibleState.Expanded) {
        super(label, collapsibleState);
        this.severity = severity;
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.fileNodes = new Map();
        this.iconPath = DiagnosticNode.getIconForSeverity(severity);
        this.contextValue = 'severityGroupItem';
    }
    get diagnosticCount() {
        return Array.from(this.fileNodes.values()).reduce((sum, file) => sum + file.totalDiagnosticsInFile, 0);
    }
}
exports.SeverityGroupNode = SeverityGroupNode;
/**
 * Represents a diagnostic source / rule bucket in the tree view.
 */
class SourceRuleGroupNode extends vscode.TreeItem {
    constructor(sourceRuleKey, label, collapsibleState = vscode.TreeItemCollapsibleState.Collapsed) {
        super(label, collapsibleState);
        this.sourceRuleKey = sourceRuleKey;
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.fileNodes = new Map();
        this.iconPath = new vscode.ThemeIcon('symbol-property');
        this.contextValue = 'sourceRuleGroupItem';
    }
    get diagnosticCount() {
        return Array.from(this.fileNodes.values()).reduce((sum, file) => sum + file.totalDiagnosticsInFile, 0);
    }
}
exports.SourceRuleGroupNode = SourceRuleGroupNode;
/**
 * Represents a workspace folder in the tree view.
 */
class WorkspaceFolderNode extends vscode.TreeItem {
    constructor(label, folderUri, collapsibleState = vscode.TreeItemCollapsibleState.Expanded) {
        super(label, collapsibleState);
        this.label = label;
        this.folderUri = folderUri;
        this.collapsibleState = collapsibleState;
        this.fileNodes = new Map();
        this.tooltip = folderUri.fsPath;
        this.iconPath = vscode.ThemeIcon.Folder;
        this.contextValue = 'workspaceFolderItem';
    }
    get diagnosticCount() {
        return Array.from(this.fileNodes.values()).reduce((s, f) => s + f.totalDiagnosticsInFile, 0);
    }
}
exports.WorkspaceFolderNode = WorkspaceFolderNode;
/**
 * Provides data for the diagnostics tree view in the sidebar.
 */
class DiagnosticTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._onDidChangeSummaryStats = new vscode.EventEmitter();
        this.onDidChangeSummaryStats = this._onDidChangeSummaryStats.event;
        this.workspaceFolderNodes = new Map();
        this.severityNodes = new Map();
        this.sourceRuleNodes = new Map();
        this.currentGroupingMode = 'file';
        this.expandedFileUrisDueToNewErrors = new Set();
        this.currentFilterText = undefined;
        this.hideGeneratedFiles = false;
        this.currentStats = {
            errors: 0,
            warnings: 0,
            information: 0,
            hints: 0,
            total: 0
        };
        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        this.currentGroupingMode = config.get('defaultGroupingMode', 'file');
        this.hideGeneratedFiles = config.get('ignoreGeneratedFiles', false);
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('errorcontextcopier.includeSeverities') ||
                e.affectsConfiguration('errorcontextcopier.ignoredErrorCodes') ||
                e.affectsConfiguration('errorcontextcopier.ignoredErrorMessages') ||
                e.affectsConfiguration('errorcontextcopier.groupingLineThreshold') ||
                e.affectsConfiguration('errorcontextcopier.defaultGroupingMode') ||
                e.affectsConfiguration('errorcontextcopier.ignoreGeneratedFiles')) {
                const updatedConfig = vscode.workspace.getConfiguration('errorcontextcopier');
                this.currentGroupingMode = updatedConfig.get('defaultGroupingMode', this.currentGroupingMode);
                this.hideGeneratedFiles = updatedConfig.get('ignoreGeneratedFiles', this.hideGeneratedFiles);
                this.refresh();
            }
        });
    }
    getGroupingMode() {
        return this.currentGroupingMode;
    }
    setGroupingMode(mode) {
        this.currentGroupingMode = mode;
        this.refresh();
    }
    cycleGroupingMode() {
        const modes = ['file', 'severity', 'sourceRule'];
        const nextIdx = (modes.indexOf(this.currentGroupingMode) + 1) % modes.length;
        const nextMode = modes[nextIdx];
        this.setGroupingMode(nextMode);
        return nextMode;
    }
    toggleHideGeneratedFiles() {
        this.hideGeneratedFiles = !this.hideGeneratedFiles;
        vscode.commands.executeCommand('setContext', 'errorContextCopier.hideGeneratedFilesActive', this.hideGeneratedFiles);
        this.refresh();
        return this.hideGeneratedFiles;
    }
    isHidingGeneratedFiles() {
        return this.hideGeneratedFiles;
    }
    setFilterText(filterText) {
        this.currentFilterText = filterText?.toLowerCase();
        vscode.commands.executeCommand('setContext', 'errorContextCopier.treeFilterActive', !!this.currentFilterText);
        this.refresh();
    }
    clearFilterText() {
        this.setFilterText(undefined);
    }
    getFilterText() {
        return this.currentFilterText;
    }
    getSummaryStats() {
        return this.currentStats;
    }
    refresh() {
        this.expandedFileUrisDueToNewErrors.clear();
        this.fetchAndProcessWorkspaceDiagnostics();
        this._onDidChangeTreeData.fire();
        this._onDidChangeSummaryStats.fire(this.currentStats);
    }
    getTreeItem(element) {
        return element;
    }
    /**
     * Sorts file nodes with errors first, then warnings, then infos, then alphabetically.
     */
    sortFileNodes(files) {
        return Array.from(files).sort((a, b) => {
            const sevDiff = a.highestSeverity - b.highestSeverity;
            if (sevDiff !== 0)
                return sevDiff;
            const countDiff = b.totalDiagnosticsInFile - a.totalDiagnosticsInFile;
            if (countDiff !== 0)
                return countDiff;
            return a.label.localeCompare(b.label);
        });
    }
    getChildren(element) {
        if (!vscode.workspace.workspaceFolders)
            return Promise.resolve([]);
        if (!element) {
            if (this.currentGroupingMode === 'file') {
                const wsArray = Array.from(this.workspaceFolderNodes.values());
                // If single workspace folder, auto-flatten to avoid redundant folder root
                if (wsArray.length === 1) {
                    return Promise.resolve(this.sortFileNodes(wsArray[0].fileNodes.values()));
                }
                return Promise.resolve(wsArray);
            }
            else if (this.currentGroupingMode === 'severity') {
                return Promise.resolve(Array.from(this.severityNodes.values()).filter(node => node.diagnosticCount > 0));
            }
            else {
                return Promise.resolve(Array.from(this.sourceRuleNodes.values())
                    .filter(node => node.diagnosticCount > 0)
                    .sort((a, b) => a.label.localeCompare(b.label)));
            }
        }
        if (element instanceof WorkspaceFolderNode) {
            return Promise.resolve(this.sortFileNodes(element.fileNodes.values()));
        }
        if (element instanceof SeverityGroupNode) {
            return Promise.resolve(this.sortFileNodes(element.fileNodes.values()));
        }
        if (element instanceof SourceRuleGroupNode) {
            return Promise.resolve(this.sortFileNodes(element.fileNodes.values()));
        }
        if (element instanceof FileNode) {
            const resultChildren = [];
            if (element.diagnosticGroups.length > 0) {
                for (const group of element.diagnosticGroups) {
                    if (group.diagnosticsCount === 1) {
                        resultChildren.push(new DiagnosticNode(group.individualDiagnostics[0]));
                    }
                    else {
                        resultChildren.push(group);
                    }
                }
                return Promise.resolve(resultChildren);
            }
            return Promise.resolve(element.individualDiagnostics.map(d => new DiagnosticNode(d)));
        }
        if (element instanceof DiagnosticGroupNode) {
            return Promise.resolve(element.individualDiagnostics.map(d => new DiagnosticNode(d)));
        }
        return Promise.resolve([]);
    }
    isGeneratedFile(fsPath) {
        const lower = fsPath.toLowerCase();
        return lower.endsWith('.g.dart') ||
            lower.endsWith('.freezed.dart') ||
            lower.includes('.generated.') ||
            lower.endsWith('.min.js') ||
            lower.endsWith('.min.css') ||
            lower.endsWith('.map');
    }
    fetchAndProcessWorkspaceDiagnostics() {
        const oldWorkspaceFolderNodes = new Map(this.workspaceFolderNodes);
        this.workspaceFolderNodes.clear();
        this.severityNodes.clear();
        this.sourceRuleNodes.clear();
        this.currentStats = { errors: 0, warnings: 0, information: 0, hints: 0, total: 0 };
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders)
            return;
        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        const configuredSeverityStrings = config.get('includeSeverities', ['Error', 'Warning']);
        const severitiesToInclude = configuredSeverityStrings.map(s => types_1.SEVERITY_MAP[s]).filter(s => s !== undefined);
        const ignoredErrorCodes = config.get('ignoredErrorCodes', []);
        const ignoredMessagePatterns = config.get('ignoredErrorMessages', []);
        const groupingThreshold = config.get('groupingLineThreshold', 2);
        // Prepare Severity buckets
        const severityBucketNames = {
            [vscode.DiagnosticSeverity.Error]: 'Errors',
            [vscode.DiagnosticSeverity.Warning]: 'Warnings',
            [vscode.DiagnosticSeverity.Information]: 'Information',
            [vscode.DiagnosticSeverity.Hint]: 'Hints'
        };
        for (const sev of [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning, vscode.DiagnosticSeverity.Information, vscode.DiagnosticSeverity.Hint]) {
            this.severityNodes.set(sev, new SeverityGroupNode(sev, severityBucketNames[sev]));
        }
        for (const folder of workspaceFolders) {
            const wsNode = new WorkspaceFolderNode(folder.name, folder.uri);
            const allDiagnosticsInVscode = vscode.languages.getDiagnostics();
            const diagnosticsForCurrentFolder = allDiagnosticsInVscode.filter(([uri]) => uri.fsPath.startsWith(folder.uri.fsPath));
            for (const [uri, diags] of diagnosticsForCurrentFolder) {
                if (this.hideGeneratedFiles && this.isGeneratedFile(uri.fsPath)) {
                    continue;
                }
                let actionableDiagnostics = diags.filter(diag => severitiesToInclude.includes(diag.severity));
                if (ignoredErrorCodes.length > 0) {
                    actionableDiagnostics = actionableDiagnostics.filter(d => {
                        if (!d.code)
                            return true;
                        const codeVal = typeof d.code === 'object' ? String(d.code.value) : String(d.code);
                        return !ignoredErrorCodes.some(ic => String(ic) === codeVal);
                    });
                }
                if (ignoredMessagePatterns.length > 0) {
                    actionableDiagnostics = actionableDiagnostics.filter(d => {
                        return !ignoredMessagePatterns.some(pStr => {
                            try {
                                return pStr.startsWith('/') && pStr.lastIndexOf('/') > 0
                                    ? new RegExp(pStr.substring(1, pStr.lastIndexOf('/')), pStr.substring(pStr.lastIndexOf('/') + 1)).test(d.message)
                                    : d.message.includes(pStr);
                            }
                            catch {
                                return false;
                            }
                        });
                    });
                }
                let filteredRawInfos = actionableDiagnostics.map(d => ({
                    filePath: vscode.workspace.asRelativePath(uri, false),
                    fileUri: uri,
                    message: d.message,
                    startLineZeroIndexed: d.range.start.line,
                    endLineZeroIndexed: d.range.end.line,
                    code: d.code,
                    source: d.source,
                    severity: d.severity,
                    range: d.range
                }));
                if (this.currentFilterText) {
                    const filter = this.currentFilterText;
                    filteredRawInfos = filteredRawInfos.filter(info => {
                        const codeStr = info.code ? (typeof info.code === 'object' ? String(info.code.value) : String(info.code)) : '';
                        const srcStr = info.source || '';
                        return info.filePath.toLowerCase().includes(filter) ||
                            info.message.toLowerCase().includes(filter) ||
                            codeStr.toLowerCase().includes(filter) ||
                            srcStr.toLowerCase().includes(filter);
                    });
                }
                if (filteredRawInfos.length > 0) {
                    filteredRawInfos.sort((a, b) => a.startLineZeroIndexed - b.startLineZeroIndexed);
                    // Update stats
                    for (const info of filteredRawInfos) {
                        this.currentStats.total++;
                        if (info.severity === vscode.DiagnosticSeverity.Error)
                            this.currentStats.errors++;
                        else if (info.severity === vscode.DiagnosticSeverity.Warning)
                            this.currentStats.warnings++;
                        else if (info.severity === vscode.DiagnosticSeverity.Information)
                            this.currentStats.information++;
                        else if (info.severity === vscode.DiagnosticSeverity.Hint)
                            this.currentStats.hints++;
                    }
                    const relativePath = filteredRawInfos[0].filePath;
                    let shouldExpand = false;
                    const oldWsNode = oldWorkspaceFolderNodes.get(folder.uri.toString());
                    const oldFileNode = oldWsNode?.fileNodes.get(uri.toString());
                    if (!oldFileNode || oldFileNode.totalDiagnosticsInFile === 0) {
                        shouldExpand = true;
                        this.expandedFileUrisDueToNewErrors.add(uri.toString());
                    }
                    else if (this.expandedFileUrisDueToNewErrors.has(uri.toString())) {
                        shouldExpand = true;
                    }
                    // 1. Build File-based Tree Nodes
                    const fileNode = new FileNode(relativePath, uri, shouldExpand ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
                    let currentGroupDiagnostics = [];
                    let groupStartLine = -1, groupEndLine = -1;
                    const finalizeGroup = () => {
                        if (currentGroupDiagnostics.length > 0) {
                            const groupNode = new DiagnosticGroupNode(groupStartLine, groupEndLine, uri);
                            currentGroupDiagnostics.forEach(d => groupNode.addDiagnostic(d));
                            fileNode.addDiagnosticGroup(groupNode);
                        }
                    };
                    for (const diagInfo of filteredRawInfos) {
                        if (currentGroupDiagnostics.length === 0 || diagInfo.startLineZeroIndexed > groupEndLine + groupingThreshold) {
                            finalizeGroup();
                            currentGroupDiagnostics = [diagInfo];
                            groupStartLine = diagInfo.startLineZeroIndexed;
                            groupEndLine = diagInfo.endLineZeroIndexed;
                        }
                        else {
                            currentGroupDiagnostics.push(diagInfo);
                            groupEndLine = Math.max(groupEndLine, diagInfo.endLineZeroIndexed);
                        }
                    }
                    finalizeGroup();
                    if (fileNode.totalDiagnosticsInFile > 0) {
                        fileNode.updateSummary();
                        if (this.currentFilterText) {
                            fileNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                        }
                        wsNode.fileNodes.set(uri.toString(), fileNode);
                    }
                    // 2. Build Severity-based and Source/Rule-based Tree Nodes
                    for (const d of filteredRawInfos) {
                        // Populate Severity grouping
                        const sevGroup = this.severityNodes.get(d.severity);
                        if (sevGroup) {
                            let sevFileNode = sevGroup.fileNodes.get(uri.toString());
                            if (!sevFileNode) {
                                sevFileNode = new FileNode(relativePath, uri, vscode.TreeItemCollapsibleState.Expanded);
                                sevGroup.fileNodes.set(uri.toString(), sevFileNode);
                            }
                            sevFileNode.addDiagnostic(d);
                        }
                        // Populate Source / Rule grouping
                        const codeStr = d.code ? (typeof d.code === 'object' ? String(d.code.value) : String(d.code)) : '';
                        const ruleKey = [d.source || 'General', codeStr].filter(Boolean).join(': ');
                        let ruleGroup = this.sourceRuleNodes.get(ruleKey);
                        if (!ruleGroup) {
                            ruleGroup = new SourceRuleGroupNode(ruleKey, ruleKey);
                            this.sourceRuleNodes.set(ruleKey, ruleGroup);
                        }
                        let ruleFileNode = ruleGroup.fileNodes.get(uri.toString());
                        if (!ruleFileNode) {
                            ruleFileNode = new FileNode(relativePath, uri, vscode.TreeItemCollapsibleState.Expanded);
                            ruleGroup.fileNodes.set(uri.toString(), ruleFileNode);
                        }
                        ruleFileNode.addDiagnostic(d);
                    }
                }
            }
            if (wsNode.fileNodes.size > 0) {
                this.workspaceFolderNodes.set(folder.uri.toString(), wsNode);
            }
        }
        // Update descriptions of top-level severity buckets
        for (const sevNode of this.severityNodes.values()) {
            sevNode.description = `${sevNode.diagnosticCount} diagnostic(s)`;
        }
        // Update descriptions of top-level source/rule buckets
        for (const ruleNode of this.sourceRuleNodes.values()) {
            ruleNode.description = `${ruleNode.diagnosticCount} diagnostic(s)`;
        }
    }
}
exports.DiagnosticTreeDataProvider = DiagnosticTreeDataProvider;
//# sourceMappingURL=diagnosticTreeDataProvider.js.map