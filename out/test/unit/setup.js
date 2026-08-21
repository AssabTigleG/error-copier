"use strict";
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (request) {
    if (request === 'vscode') {
        return {
            DiagnosticSeverity: {
                Error: 0,
                Warning: 1,
                Information: 2,
                Hint: 3
            },
            ThemeIcon: class {
                constructor(id, color) {
                    this.id = id;
                    this.color = color;
                }
            },
            ThemeColor: class {
                constructor(id) {
                    this.id = id;
                }
            },
            MarkdownString: class {
                constructor(value = '') {
                    this.value = value;
                }
                appendText(text) { this.value += text; return this; }
                appendMarkdown(md) { this.value += md; return this; }
            },
            TreeItem: class {
                constructor(label, collapsibleState) {
                    this.label = label;
                    this.collapsibleState = collapsibleState;
                }
            },
            TreeItemCollapsibleState: {
                None: 0,
                Collapsed: 1,
                Expanded: 2
            },
            EventEmitter: class {
                constructor() {
                    this.event = () => ({ dispose: () => { } });
                }
                fire() { }
            },
            workspace: {
                getConfiguration: () => ({
                    get: (_key, def) => def
                }),
                onDidChangeConfiguration: () => ({ dispose: () => { } }),
                asRelativePath: (uri) => uri?.fsPath || ''
            },
            window: {
                createStatusBarItem: () => ({
                    show: () => { },
                    hide: () => { },
                    dispose: () => { }
                }),
                createTreeView: () => ({ dispose: () => { } })
            },
            commands: {
                executeCommand: () => Promise.resolve(),
                registerCommand: () => ({ dispose: () => { } })
            },
            languages: {
                getDiagnostics: () => [],
                onDidChangeDiagnostics: () => ({ dispose: () => { } })
            },
            Uri: {
                file: (p) => ({ fsPath: p, toString: () => p, scheme: 'file' }),
                joinPath: (base, ...segments) => ({
                    fsPath: [base.fsPath, ...segments].join('/'),
                    toString: () => [base.fsPath, ...segments].join('/')
                })
            },
            Range: class {
                constructor(startLine, startChar, endLine, endChar) {
                    this.start = { line: startLine, character: startChar };
                    this.end = { line: endLine, character: endChar };
                }
            },
            Position: class {
                constructor(line, character) {
                    this.line = line;
                    this.character = character;
                }
            },
            StatusBarAlignment: {
                Left: 1,
                Right: 2
            }
        };
    }
    return originalRequire.apply(this, arguments);
};
//# sourceMappingURL=setup.js.map