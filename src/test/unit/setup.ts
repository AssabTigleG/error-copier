const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
    if (request === 'vscode') {
        return {
            DiagnosticSeverity: {
                Error: 0,
                Warning: 1,
                Information: 2,
                Hint: 3
            },
            ThemeIcon: class {
                constructor(public id: string, public color?: any) {}
            },
            ThemeColor: class {
                constructor(public id: string) {}
            },
            MarkdownString: class {
                constructor(public value: string = '') {}
                appendText(text: string) { this.value += text; return this; }
                appendMarkdown(md: string) { this.value += md; return this; }
            },
            TreeItem: class {
                constructor(public label: string, public collapsibleState?: any) {}
            },
            TreeItemCollapsibleState: {
                None: 0,
                Collapsed: 1,
                Expanded: 2
            },
            EventEmitter: class {
                event = () => ({ dispose: () => {} });
                fire() {}
            },
            workspace: {
                getConfiguration: () => ({
                    get: (_key: string, def: any) => def
                }),
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
                asRelativePath: (uri: any) => uri?.fsPath || ''
            },
            window: {
                createStatusBarItem: () => ({
                    show: () => {},
                    hide: () => {},
                    dispose: () => {}
                }),
                createTreeView: () => ({ dispose: () => {} })
            },
            commands: {
                executeCommand: () => Promise.resolve(),
                registerCommand: () => ({ dispose: () => {} })
            },
            languages: {
                getDiagnostics: () => [],
                onDidChangeDiagnostics: () => ({ dispose: () => {} })
            },
            Uri: {
                file: (p: string) => ({ fsPath: p, toString: () => p, scheme: 'file' }),
                joinPath: (base: any, ...segments: string[]) => ({
                    fsPath: [base.fsPath, ...segments].join('/'),
                    toString: () => [base.fsPath, ...segments].join('/')
                })
            },
            Range: class {
                public start: { line: number; character: number };
                public end: { line: number; character: number };
                constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
                    this.start = { line: startLine, character: startChar };
                    this.end = { line: endLine, character: endChar };
                }
            },
            Position: class {
                constructor(public line: number, public character: number) {}
            },
            StatusBarAlignment: {
                Left: 1,
                Right: 2
            }
        };
    }
    return originalRequire.apply(this, arguments);
};
