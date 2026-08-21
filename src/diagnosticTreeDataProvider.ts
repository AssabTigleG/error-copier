import * as vscode from 'vscode';
import * as path from 'path';
import {
    GroupingMode,
    RawDiagnosticInfo,
    DiagnosticSummaryStats,
    SEVERITY_MAP
} from './types';

/**
 * Cleans multi-line diagnostic messages and extracts fix hints for clean display.
 */
export function sanitizeDiagnosticMessage(msg: string): { title: string; hint?: string } {
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
export class DiagnosticNode extends vscode.TreeItem {
    constructor(
        public readonly rawInfo: RawDiagnosticInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        const lineNum = rawInfo.startLineZeroIndexed + 1;
        const { title, hint } = sanitizeDiagnosticMessage(rawInfo.message);
        const label = `L${lineNum}: ${title}`;
        super(label, collapsibleState);

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

    static getSeverityLabel(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return 'Error';
            case vscode.DiagnosticSeverity.Warning: return 'Warning';
            case vscode.DiagnosticSeverity.Information: return 'Information';
            case vscode.DiagnosticSeverity.Hint: return 'Hint';
            default: return 'Issue';
        }
    }

    static getIconForSeverity(severity: vscode.DiagnosticSeverity): vscode.ThemeIcon {
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

/**
 * Represents a group of related diagnostics clustered within a line range.
 */
export class DiagnosticGroupNode extends vscode.TreeItem {
    public individualDiagnostics: RawDiagnosticInfo[] = [];

    constructor(
        public readonly startLineZeroIndexed: number,
        public readonly endLineZeroIndexed: number,
        public readonly fileUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(`L${startLineZeroIndexed + 1} - L${endLineZeroIndexed + 1}`, collapsibleState);
        this.contextValue = 'diagnosticGroupItem';
    }

    addDiagnostic(diagnosticInfo: RawDiagnosticInfo) {
        this.individualDiagnostics.push(diagnosticInfo);
        this.updateHeader();
    }

    private updateHeader() {
        const count = this.individualDiagnostics.length;
        this.label = `L${this.startLineZeroIndexed + 1} - L${this.endLineZeroIndexed + 1} (${count} diagnostics)`;
        const first = this.individualDiagnostics[0];
        if (first) {
            const { title } = sanitizeDiagnosticMessage(first.message);
            this.description = `${title.substring(0, 40)}${title.length > 40 ? '...' : ''}`;
            const highestSeverity = Math.min(...this.individualDiagnostics.map(d => d.severity));
            this.iconPath = DiagnosticNode.getIconForSeverity(highestSeverity as vscode.DiagnosticSeverity);
        }
    }

    get diagnosticsCount(): number {
        return this.individualDiagnostics.length;
    }
}

/**
 * Represents a file containing diagnostics in the tree view.
 */
export class FileNode extends vscode.TreeItem {
    public diagnosticGroups: DiagnosticGroupNode[] = [];
    public individualDiagnostics: RawDiagnosticInfo[] = [];

    constructor(
        public readonly relativePath: string,
        public readonly fileUri: vscode.Uri,
        public collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        const baseName = path.basename(relativePath) || relativePath;
        super(baseName, collapsibleState);

        const dirName = path.dirname(relativePath);
        const displayDir = dirName && dirName !== '.' ? dirName : '';

        this.description = displayDir;
        this.resourceUri = fileUri;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'fileItem';
    }

    addDiagnosticGroup(groupNode: DiagnosticGroupNode) {
        this.diagnosticGroups.push(groupNode);
        this.updateSummary();
    }

    addDiagnostic(diagnostic: RawDiagnosticInfo) {
        this.individualDiagnostics.push(diagnostic);
        this.updateSummary();
    }

    public get highestSeverity(): vscode.DiagnosticSeverity {
        const allDiags = this.getAllDiagnostics();
        if (allDiags.length === 0) return vscode.DiagnosticSeverity.Hint;
        return Math.min(...allDiags.map(d => d.severity)) as vscode.DiagnosticSeverity;
    }

    public updateSummary() {
        const allDiags = this.getAllDiagnostics();
        const errors = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
        const warnings = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
        const info = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Information).length;
        const hints = allDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Hint).length;

        const parts: string[] = [];
        if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
        if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
        if (info > 0 && errors === 0 && warnings === 0) parts.push(`${info} info`);
        if (hints > 0 && errors === 0 && warnings === 0 && info === 0) parts.push(`${hints} hint${hints > 1 ? 's' : ''}`);

        const dirName = path.dirname(this.relativePath);
        const displayDir = dirName && dirName !== '.' ? dirName : '';
        const countsSummary = parts.join(', ') || `${allDiags.length} issue(s)`;

        this.description = displayDir ? `${displayDir} • ${countsSummary}` : countsSummary;
        this.tooltip = `${this.fileUri.fsPath}\n${countsSummary}`;

        // Accentuate file icon if errors exist
        if (errors > 0) {
            this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('editorError.foreground'));
        } else if (warnings > 0) {
            this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('editorWarning.foreground'));
        } else {
            this.iconPath = vscode.ThemeIcon.File;
        }
    }

    public getAllDiagnostics(): RawDiagnosticInfo[] {
        if (this.diagnosticGroups.length > 0) {
            const diags: RawDiagnosticInfo[] = [];
            this.diagnosticGroups.forEach(g => diags.push(...g.individualDiagnostics));
            return diags;
        }
        return this.individualDiagnostics;
    }

    get totalDiagnosticsInFile(): number {
        return this.getAllDiagnostics().length;
    }
}

/**
 * Represents a severity bucket (Errors, Warnings, Information, Hints) in the tree view.
 */
export class SeverityGroupNode extends vscode.TreeItem {
    public fileNodes: Map<string, FileNode> = new Map();

    constructor(
        public readonly severity: vscode.DiagnosticSeverity,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(label, collapsibleState);
        this.iconPath = DiagnosticNode.getIconForSeverity(severity);
        this.contextValue = 'severityGroupItem';
    }

    get diagnosticCount(): number {
        return Array.from(this.fileNodes.values()).reduce((sum, file) => sum + file.totalDiagnosticsInFile, 0);
    }
}

/**
 * Represents a diagnostic source / rule bucket in the tree view.
 */
export class SourceRuleGroupNode extends vscode.TreeItem {
    public fileNodes: Map<string, FileNode> = new Map();

    constructor(
        public readonly sourceRuleKey: string,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon('symbol-property');
        this.contextValue = 'sourceRuleGroupItem';
    }

    get diagnosticCount(): number {
        return Array.from(this.fileNodes.values()).reduce((sum, file) => sum + file.totalDiagnosticsInFile, 0);
    }
}

/**
 * Represents a workspace folder in the tree view.
 */
export class WorkspaceFolderNode extends vscode.TreeItem {
    public fileNodes: Map<string, FileNode> = new Map();

    constructor(
        public readonly label: string,
        public readonly folderUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(label, collapsibleState);
        this.tooltip = folderUri.fsPath;
        this.iconPath = vscode.ThemeIcon.Folder;
        this.contextValue = 'workspaceFolderItem';
    }

    get diagnosticCount(): number {
        return Array.from(this.fileNodes.values()).reduce((s, f) => s + f.totalDiagnosticsInFile, 0);
    }
}

/**
 * Provides data for the diagnostics tree view in the sidebar.
 */
export class DiagnosticTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _onDidChangeSummaryStats = new vscode.EventEmitter<DiagnosticSummaryStats>();
    readonly onDidChangeSummaryStats: vscode.Event<DiagnosticSummaryStats> = this._onDidChangeSummaryStats.event;

    private workspaceFolderNodes: Map<string, WorkspaceFolderNode> = new Map();
    private severityNodes: Map<vscode.DiagnosticSeverity, SeverityGroupNode> = new Map();
    private sourceRuleNodes: Map<string, SourceRuleGroupNode> = new Map();

    private currentGroupingMode: GroupingMode = 'file';
    private expandedFileUrisDueToNewErrors: Set<string> = new Set();
    private currentFilterText: string | undefined = undefined;
    private hideGeneratedFiles = false;

    private currentStats: DiagnosticSummaryStats = {
        errors: 0,
        warnings: 0,
        information: 0,
        hints: 0,
        total: 0
    };

    constructor() {
        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        this.currentGroupingMode = config.get<GroupingMode>('defaultGroupingMode', 'file');
        this.hideGeneratedFiles = config.get<boolean>('ignoreGeneratedFiles', false);

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('errorcontextcopier.includeSeverities') ||
                e.affectsConfiguration('errorcontextcopier.ignoredErrorCodes') ||
                e.affectsConfiguration('errorcontextcopier.ignoredErrorMessages') ||
                e.affectsConfiguration('errorcontextcopier.groupingLineThreshold') ||
                e.affectsConfiguration('errorcontextcopier.defaultGroupingMode') ||
                e.affectsConfiguration('errorcontextcopier.ignoreGeneratedFiles')) {
                const updatedConfig = vscode.workspace.getConfiguration('errorcontextcopier');
                this.currentGroupingMode = updatedConfig.get<GroupingMode>('defaultGroupingMode', this.currentGroupingMode);
                this.hideGeneratedFiles = updatedConfig.get<boolean>('ignoreGeneratedFiles', this.hideGeneratedFiles);
                this.refresh();
            }
        });
    }

    public getGroupingMode(): GroupingMode {
        return this.currentGroupingMode;
    }

    public setGroupingMode(mode: GroupingMode): void {
        this.currentGroupingMode = mode;
        this.refresh();
    }

    public cycleGroupingMode(): GroupingMode {
        const modes: GroupingMode[] = ['file', 'severity', 'sourceRule'];
        const nextIdx = (modes.indexOf(this.currentGroupingMode) + 1) % modes.length;
        const nextMode = modes[nextIdx];
        this.setGroupingMode(nextMode);
        return nextMode;
    }

    public toggleHideGeneratedFiles(): boolean {
        this.hideGeneratedFiles = !this.hideGeneratedFiles;
        vscode.commands.executeCommand('setContext', 'errorContextCopier.hideGeneratedFilesActive', this.hideGeneratedFiles);
        this.refresh();
        return this.hideGeneratedFiles;
    }

    public isHidingGeneratedFiles(): boolean {
        return this.hideGeneratedFiles;
    }

    public setFilterText(filterText: string | undefined): void {
        this.currentFilterText = filterText?.toLowerCase();
        vscode.commands.executeCommand('setContext', 'errorContextCopier.treeFilterActive', !!this.currentFilterText);
        this.refresh();
    }

    public clearFilterText(): void {
        this.setFilterText(undefined);
    }

    public getFilterText(): string | undefined {
        return this.currentFilterText;
    }

    public getSummaryStats(): DiagnosticSummaryStats {
        return this.currentStats;
    }

    public refresh(): void {
        this.expandedFileUrisDueToNewErrors.clear();
        this.fetchAndProcessWorkspaceDiagnostics();
        this._onDidChangeTreeData.fire();
        this._onDidChangeSummaryStats.fire(this.currentStats);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Sorts file nodes with errors first, then warnings, then infos, then alphabetically.
     */
    private sortFileNodes(files: Iterable<FileNode>): FileNode[] {
        return Array.from(files).sort((a, b) => {
            const sevDiff = a.highestSeverity - b.highestSeverity;
            if (sevDiff !== 0) return sevDiff;
            const countDiff = b.totalDiagnosticsInFile - a.totalDiagnosticsInFile;
            if (countDiff !== 0) return countDiff;
            return (a.label as string).localeCompare(b.label as string);
        });
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!vscode.workspace.workspaceFolders) return Promise.resolve([]);

        if (!element) {
            if (this.currentGroupingMode === 'file') {
                const wsArray = Array.from(this.workspaceFolderNodes.values());
                // If single workspace folder, auto-flatten to avoid redundant folder root
                if (wsArray.length === 1) {
                    return Promise.resolve(this.sortFileNodes(wsArray[0].fileNodes.values()));
                }
                return Promise.resolve(wsArray);
            } else if (this.currentGroupingMode === 'severity') {
                return Promise.resolve(Array.from(this.severityNodes.values()).filter(node => node.diagnosticCount > 0));
            } else {
                return Promise.resolve(
                    Array.from(this.sourceRuleNodes.values())
                        .filter(node => node.diagnosticCount > 0)
                        .sort((a, b) => (a.label as string).localeCompare(b.label as string))
                );
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
            const resultChildren: vscode.TreeItem[] = [];

            if (element.diagnosticGroups.length > 0) {
                for (const group of element.diagnosticGroups) {
                    if (group.diagnosticsCount === 1) {
                        resultChildren.push(new DiagnosticNode(group.individualDiagnostics[0]));
                    } else {
                        resultChildren.push(group);
                    }
                }
                return Promise.resolve(resultChildren);
            }

            return Promise.resolve(
                element.individualDiagnostics.map(d => new DiagnosticNode(d))
            );
        }

        if (element instanceof DiagnosticGroupNode) {
            return Promise.resolve(
                element.individualDiagnostics.map(d => new DiagnosticNode(d))
            );
        }

        return Promise.resolve([]);
    }

    private isGeneratedFile(fsPath: string): boolean {
        const lower = fsPath.toLowerCase();
        return lower.endsWith('.g.dart') ||
            lower.endsWith('.freezed.dart') ||
            lower.includes('.generated.') ||
            lower.endsWith('.min.js') ||
            lower.endsWith('.min.css') ||
            lower.endsWith('.map');
    }

    private fetchAndProcessWorkspaceDiagnostics(): void {
        const oldWorkspaceFolderNodes = new Map(this.workspaceFolderNodes);
        this.workspaceFolderNodes.clear();
        this.severityNodes.clear();
        this.sourceRuleNodes.clear();

        this.currentStats = { errors: 0, warnings: 0, information: 0, hints: 0, total: 0 };

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        const configuredSeverityStrings = config.get<string[]>('includeSeverities', ['Error', 'Warning']);
        const severitiesToInclude = configuredSeverityStrings.map(s => SEVERITY_MAP[s]).filter(s => s !== undefined);
        const ignoredErrorCodes = config.get<(string | number)[]>('ignoredErrorCodes', []);
        const ignoredMessagePatterns = config.get<string[]>('ignoredErrorMessages', []);
        const groupingThreshold = config.get<number>('groupingLineThreshold', 2);

        // Prepare Severity buckets
        const severityBucketNames: { [key: number]: string } = {
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
                        if (!d.code) return true;
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
                            } catch {
                                return false;
                            }
                        });
                    });
                }

                let filteredRawInfos: RawDiagnosticInfo[] = actionableDiagnostics.map(d => ({
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
                        if (info.severity === vscode.DiagnosticSeverity.Error) this.currentStats.errors++;
                        else if (info.severity === vscode.DiagnosticSeverity.Warning) this.currentStats.warnings++;
                        else if (info.severity === vscode.DiagnosticSeverity.Information) this.currentStats.information++;
                        else if (info.severity === vscode.DiagnosticSeverity.Hint) this.currentStats.hints++;
                    }

                    const relativePath = filteredRawInfos[0].filePath;
                    let shouldExpand = false;
                    const oldWsNode = oldWorkspaceFolderNodes.get(folder.uri.toString());
                    const oldFileNode = oldWsNode?.fileNodes.get(uri.toString());

                    if (!oldFileNode || oldFileNode.totalDiagnosticsInFile === 0) {
                        shouldExpand = true;
                        this.expandedFileUrisDueToNewErrors.add(uri.toString());
                    } else if (this.expandedFileUrisDueToNewErrors.has(uri.toString())) {
                        shouldExpand = true;
                    }

                    // 1. Build File-based Tree Nodes
                    const fileNode = new FileNode(
                        relativePath,
                        uri,
                        shouldExpand ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
                    );

                    let currentGroupDiagnostics: RawDiagnosticInfo[] = [];
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
                        } else {
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