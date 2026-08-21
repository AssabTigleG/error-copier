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
require("./setup");
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const diagnosticTreeDataProvider_1 = require("../../diagnosticTreeDataProvider");
suite('Unit Tests: TreeView Grouping & Nodes', () => {
    test('DiagnosticNode displays severity icon and formatted label', () => {
        const rawInfo = {
            filePath: 'index.ts',
            fileUri: vscode.Uri.file('/path/index.ts'),
            message: 'Variable unused',
            startLineZeroIndexed: 4,
            endLineZeroIndexed: 4,
            code: 'no-unused-vars',
            source: 'eslint',
            severity: vscode.DiagnosticSeverity.Warning,
            range: new vscode.Range(4, 0, 4, 15)
        };
        const node = new diagnosticTreeDataProvider_1.DiagnosticNode(rawInfo);
        assert.strictEqual(node.label, 'L5: Variable unused');
        const desc = typeof node.description === 'string' ? node.description : '';
        assert.ok(desc.includes('[eslint: no-unused-vars]'), 'Description should contain rule code');
    });
    test('SeverityGroupNode correctly aggregates diagnostics from files', () => {
        const sevNode = new diagnosticTreeDataProvider_1.SeverityGroupNode(vscode.DiagnosticSeverity.Error, 'Errors');
        const fileNode = new diagnosticTreeDataProvider_1.FileNode('index.ts', vscode.Uri.file('/path/index.ts'));
        const rawInfo = {
            filePath: 'index.ts',
            fileUri: vscode.Uri.file('/path/index.ts'),
            message: 'Syntax error',
            startLineZeroIndexed: 0,
            endLineZeroIndexed: 0,
            severity: vscode.DiagnosticSeverity.Error,
            range: new vscode.Range(0, 0, 0, 1)
        };
        fileNode.addDiagnostic(rawInfo);
        sevNode.fileNodes.set(fileNode.fileUri.toString(), fileNode);
        assert.strictEqual(sevNode.diagnosticCount, 1);
        assert.strictEqual(sevNode.label, 'Errors');
    });
    test('SourceRuleGroupNode correctly aggregates diagnostics for a rule key', () => {
        const ruleNode = new diagnosticTreeDataProvider_1.SourceRuleGroupNode('eslint: no-unused-vars', 'eslint: no-unused-vars');
        const fileNode = new diagnosticTreeDataProvider_1.FileNode('index.ts', vscode.Uri.file('/path/index.ts'));
        const rawInfo = {
            filePath: 'index.ts',
            fileUri: vscode.Uri.file('/path/index.ts'),
            message: 'Unused var',
            startLineZeroIndexed: 1,
            endLineZeroIndexed: 1,
            code: 'no-unused-vars',
            source: 'eslint',
            severity: vscode.DiagnosticSeverity.Warning,
            range: new vscode.Range(1, 0, 1, 10)
        };
        fileNode.addDiagnostic(rawInfo);
        ruleNode.fileNodes.set(fileNode.fileUri.toString(), fileNode);
        assert.strictEqual(ruleNode.diagnosticCount, 1);
        assert.strictEqual(ruleNode.label, 'eslint: no-unused-vars');
    });
    test('DiagnosticTreeDataProvider mode switching cycles correctly', () => {
        const provider = new diagnosticTreeDataProvider_1.DiagnosticTreeDataProvider();
        provider.setGroupingMode('file');
        assert.strictEqual(provider.getGroupingMode(), 'file');
        const next1 = provider.cycleGroupingMode();
        assert.strictEqual(next1, 'severity');
        assert.strictEqual(provider.getGroupingMode(), 'severity');
        const next2 = provider.cycleGroupingMode();
        assert.strictEqual(next2, 'sourceRule');
        assert.strictEqual(provider.getGroupingMode(), 'sourceRule');
        const next3 = provider.cycleGroupingMode();
        assert.strictEqual(next3, 'file');
        assert.strictEqual(provider.getGroupingMode(), 'file');
    });
    test('DiagnosticTreeDataProvider filter setting and clearing', () => {
        const provider = new diagnosticTreeDataProvider_1.DiagnosticTreeDataProvider();
        provider.setFilterText('myFilter');
        assert.strictEqual(provider.getFilterText(), 'myfilter');
        provider.clearFilterText();
        assert.strictEqual(provider.getFilterText(), undefined);
    });
});
//# sourceMappingURL=treeGrouping.test.js.map