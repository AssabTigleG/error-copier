import * as vscode from 'vscode';

/**
 * Interface for holding raw, unprocessed diagnostic information.
 */
export interface RawDiagnosticInfo {
    filePath: string;
    fileUri: vscode.Uri;
    message: string;
    startLineZeroIndexed: number;
    endLineZeroIndexed: number;
    code?: string | number | { value: string | number; target: vscode.Uri };
    severity: vscode.DiagnosticSeverity;
    range: vscode.Range;
}

/**
 * Represents an individual diagnostic item in the tree view.
 */
export class DiagnosticNode extends vscode.TreeItem {
    /**
     * Creates an instance of DiagnosticNode.
     * @param {string} label - The primary display label for the tree item.
     * @param {RawDiagnosticInfo} rawInfo - The raw diagnostic data associated with this node.
     * @param {vscode.TreeItemCollapsibleState} [collapsibleState=vscode.TreeItemCollapsibleState.None] - The collapsible state.
     */
    constructor(
        public readonly label: string,
        public readonly rawInfo: RawDiagnosticInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        this.tooltip = `${rawInfo.message}`;
        this.description = `L${rawInfo.startLineZeroIndexed + 1}: ${rawInfo.message.substring(0, 60)}${rawInfo.message.length > 60 ? '...' : ''}`;
        this.command = {
            command: 'errorcontextcopier.tree.goToDiagnostic',
            title: 'Go to Diagnostic',
            arguments: [this.rawInfo]
        };
        this.iconPath = DiagnosticNode.getIconForSeverity(rawInfo.severity);
        this.contextValue = 'diagnosticItem';
    }

    /**
     * Gets a ThemeIcon corresponding to the diagnostic severity.
     * @param {vscode.DiagnosticSeverity} severity - The severity of the diagnostic.
     * @returns {vscode.ThemeIcon} The icon representing the severity.
     */
    static getIconForSeverity(severity: vscode.DiagnosticSeverity): vscode.ThemeIcon {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
            case vscode.DiagnosticSeverity.Warning: return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
            case vscode.DiagnosticSeverity.Information: return new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
            case vscode.DiagnosticSeverity.Hint: return new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('editorHint.foreground'));
            default: return new vscode.ThemeIcon('issue-opened');
        }
    }
}

/**
 * Represents a group of related diagnostics within a single file in the tree view.
 */
export class DiagnosticGroupNode extends vscode.TreeItem {
    public individualDiagnostics: RawDiagnosticInfo[] = [];

    /**
     * Creates an instance of DiagnosticGroupNode.
     * @param {string} label - The display label for the group (e.g., "Group (L10-L15)").
     * @param {vscode.Uri} fileUri - The URI of the file this diagnostic group belongs to.
     * @param {vscode.TreeItemCollapsibleState} [collapsibleState=vscode.TreeItemCollapsibleState.Collapsed] - Initial collapsible state.
     */
    constructor(
        public readonly label: string,
        public readonly fileUri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, collapsibleState);
        this.iconPath = new vscode.ThemeIcon('issues');
        this.contextValue = 'diagnosticGroupItem';
    }

    /**
     * Adds a raw diagnostic information object to this group.
     * @param {RawDiagnosticInfo} diagnosticInfo - The diagnostic information to add.
     */
    addDiagnostic(diagnosticInfo: RawDiagnosticInfo) { this.individualDiagnostics.push(diagnosticInfo); }

    /**
     * Gets the count of individual diagnostics within this group.
     * @returns {number} The number of diagnostics.
     */
    get diagnosticsCount(): number { return this.individualDiagnostics.length; }
}

/**
 * Represents a file containing diagnostics in the tree view.
 */
export class FileNode extends vscode.TreeItem {
    public diagnosticGroups: DiagnosticGroupNode[] = [];

    /**
     * Creates an instance of FileNode.
     * @param {string} label - The file name (short path).
     * @param {vscode.Uri} fileUri - The URI of the file.
     * @param {vscode.TreeItemCollapsibleState} [collapsibleState=vscode.TreeItemCollapsibleState.Collapsed] - Initial collapsible state.
     */
    constructor(
        public readonly label: string,
        public readonly fileUri: vscode.Uri,
        public collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(label, collapsibleState);
        this.tooltip = `${fileUri.fsPath}`;
        this.description = vscode.workspace.asRelativePath(fileUri, true);
        this.resourceUri = fileUri;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'fileItem';
    }

    /**
     * Adds a diagnostic group to this file node.
     * @param {DiagnosticGroupNode} groupNode - The diagnostic group to add.
     */
    addDiagnosticGroup(groupNode: DiagnosticGroupNode) { this.diagnosticGroups.push(groupNode); }

    /**
     * Gets the total number of individual diagnostics contained within all groups in this file.
     * @returns {number} The total count of diagnostics.
     */
    get totalDiagnosticsInFile(): number { return this.diagnosticGroups.reduce((sum, group) => sum + group.diagnosticsCount, 0); }
}

/**
 * Represents a workspace folder in the tree view.
 */
export class WorkspaceFolderNode extends vscode.TreeItem {
    public fileNodes: Map<string, FileNode> = new Map();

    /**
     * Creates an instance of WorkspaceFolderNode.
     * @param {string} label - The name of the workspace folder.
     * @param {vscode.Uri} folderUri - The URI of the workspace folder.
     * @param {vscode.TreeItemCollapsibleState} [collapsibleState=vscode.TreeItemCollapsibleState.Expanded] - Initial collapsible state.
     */
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

    /**
     * Gets the total number of diagnostics across all files in this workspace folder.
     * @returns {number} The total count of diagnostics.
     */
    get diagnosticCount(): number { return Array.from(this.fileNodes.values()).reduce((s, f) => s + f.totalDiagnosticsInFile, 0); }
}

/**
 * Provides data for the diagnostics tree view in the sidebar.
 * Manages fetching, filtering, grouping, and refreshing diagnostic data.
 */
export class DiagnosticTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private workspaceFolderNodes: Map<string, WorkspaceFolderNode> = new Map();
    private SEVERITY_MAP_LOCAL: { [key: string]: vscode.DiagnosticSeverity };
    private expandedFileUrisDueToNewErrors: Set<string> = new Set();
    private currentFilterText: string | undefined = undefined;

    /**
     * Creates an instance of DiagnosticTreeDataProvider.
     * Initializes severity mapping and listens for configuration changes.
     */
    constructor() {
        this.SEVERITY_MAP_LOCAL = { "Error": vscode.DiagnosticSeverity.Error, "Warning": vscode.DiagnosticSeverity.Warning, "Information": vscode.DiagnosticSeverity.Information, "Hint": vscode.DiagnosticSeverity.Hint };
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('errorcontextcopier.includeSeverities') ||
                e.affectsConfiguration('errorcontextcopier.ignoredErrorCodes') ||
                e.affectsConfiguration('errorcontextcopier.ignoredErrorMessages') ||
                e.affectsConfiguration('errorcontextcopier.groupingLineThreshold')) {
                this.refresh();
            }
        });
    }

    /**
     * Sets the filter text to be applied to the diagnostics tree and refreshes the view.
     * @param {string | undefined} filterText - The text to filter by. Undefined or empty string clears the filter.
     */
    public setFilterText(filterText: string | undefined): void {
        this.currentFilterText = filterText?.toLowerCase();
        vscode.commands.executeCommand('setContext', 'errorContextCopier.treeFilterActive', !!this.currentFilterText);
        this.refresh();
    }

    /**
     * Clears any active filter text and refreshes the tree view.
     */
    public clearFilterText(): void {
        this.setFilterText(undefined);
    }

    /**
     * Gets the current filter text.
     * @returns {string | undefined} The current filter text, or undefined if no filter is active.
     */
    public getFilterText(): string | undefined {
        return this.currentFilterText;
    }

    /**
     * Refreshes the entire diagnostics tree by re-fetching and processing all data.
     */
    public refresh(): void {
        this.expandedFileUrisDueToNewErrors.clear();
        this.fetchAndProcessWorkspaceDiagnostics();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Gets the TreeItem representation for the given element.
     * @param {vscode.TreeItem} element - The element for which to get the TreeItem.
     * @returns {vscode.TreeItem} The TreeItem.
     */
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    /**
     * Gets the children of the given element or root elements if no element is provided.
     * @param {vscode.TreeItem} [element] - The element for which to get children.
     * @returns {Thenable<vscode.TreeItem[]>} A promise that resolves to an array of children TreeItems.
     */
    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!vscode.workspace.workspaceFolders) return Promise.resolve([]);
        if (element instanceof WorkspaceFolderNode) return Promise.resolve(Array.from(element.fileNodes.values()).sort((a, b) => a.label.localeCompare(b.label)));
        if (element instanceof FileNode) return Promise.resolve(element.diagnosticGroups);
        if (element instanceof DiagnosticGroupNode) return Promise.resolve(element.individualDiagnostics.map(d => new DiagnosticNode(`L${d.startLineZeroIndexed + 1}`, d)));
        return Promise.resolve(Array.from(this.workspaceFolderNodes.values()));
    }

    /**
     * Fetches all diagnostics from VS Code, filters them based on settings and the current text filter,
     * groups them by file and proximity, and populates the internal tree structure.
     */
    private fetchAndProcessWorkspaceDiagnostics(): void {
        const oldWorkspaceFolderNodes = new Map(this.workspaceFolderNodes);
        this.workspaceFolderNodes.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        const configuredSeverityStrings = config.get<string[]>('includeSeverities', ['Error']);
        const severitiesToInclude = configuredSeverityStrings.map(s => this.SEVERITY_MAP_LOCAL[s]).filter(s => s !== undefined);
        const ignoredErrorCodes = config.get<(string | number)[]>('ignoredErrorCodes', []);
        const ignoredMessagePatterns = config.get<string[]>('ignoredErrorMessages', []);
        const groupingThreshold = config.get<number>('groupingLineThreshold', 2);

        for (const folder of workspaceFolders) {
            const wsNode = new WorkspaceFolderNode(folder.name, folder.uri);
            const allDiagnosticsInVscode = vscode.languages.getDiagnostics();
            const diagnosticsForCurrentFolder = allDiagnosticsInVscode.filter(([uri]) => uri.fsPath.startsWith(folder.uri.fsPath));

            for (const [uri, diags] of diagnosticsForCurrentFolder) {
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
                            } catch { return false; }
                        });
                    });
                }

                let filteredRawInfos: RawDiagnosticInfo[] = actionableDiagnostics.map(d => ({
                    filePath: vscode.workspace.asRelativePath(uri, false), fileUri: uri, message: d.message,
                    startLineZeroIndexed: d.range.start.line, endLineZeroIndexed: d.range.end.line,
                    code: d.code, severity: d.severity, range: d.range
                }));

                if (this.currentFilterText) {
                    const filter = this.currentFilterText;
                    filteredRawInfos = filteredRawInfos.filter(info =>
                        info.filePath.toLowerCase().includes(filter) ||
                        info.message.toLowerCase().includes(filter)
                    );
                }

                if (filteredRawInfos.length > 0) {
                    filteredRawInfos.sort((a, b) => a.startLineZeroIndexed - b.startLineZeroIndexed);
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

                    const fileNode = new FileNode(relativePath, uri,
                        shouldExpand ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
                    );

                    let currentGroupDiagnostics: RawDiagnosticInfo[] = [];
                    let groupStartLine = -1, groupEndLine = -1;

                    const finalizeGroup = () => {
                        if (currentGroupDiagnostics.length > 0) {
                            const label = `Group (${currentGroupDiagnostics.length} items, L${groupStartLine + 1} - L${groupEndLine + 1})`;
                            const description = `Diagnostics from L${groupStartLine + 1} to L${groupEndLine + 1}`;
                            const groupNode = new DiagnosticGroupNode(label, uri);
                            groupNode.description = description;
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

                    if (fileNode.diagnosticGroups.length > 0) {
                        fileNode.description = `${fileNode.diagnosticGroups.length} group(s), ${fileNode.totalDiagnosticsInFile} diagnostic(s) - ${vscode.workspace.asRelativePath(fileNode.fileUri, true)}`;
                        if (this.currentFilterText && fileNode.totalDiagnosticsInFile > 0) {
                            fileNode.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                        }
                        wsNode.fileNodes.set(uri.toString(), fileNode);
                    }
                }
            }
            if (wsNode.fileNodes.size > 0) {
                this.workspaceFolderNodes.set(folder.uri.toString(), wsNode);
            }
        }
    }
}