import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    DiagnosticNode,
    FileNode,
    SeverityGroupNode,
    SourceRuleGroupNode,
    DiagnosticTreeDataProvider
} from '../../diagnosticTreeDataProvider';
import { RawDiagnosticInfo } from '../../types';

suite('TreeView Grouping & Nodes Test Suite', () => {
    test('DiagnosticNode displays severity icon and formatted label', () => {
        const rawInfo: RawDiagnosticInfo = {
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

        const node = new DiagnosticNode(rawInfo);
        assert.strictEqual(node.label, 'L5: Variable unused');
        const desc = typeof node.description === 'string' ? node.description : '';
        assert.ok(desc.includes('[eslint: no-unused-vars]'), 'Description should contain rule code');
    });

    test('SeverityGroupNode correctly aggregates diagnostics from files', () => {
        const sevNode = new SeverityGroupNode(vscode.DiagnosticSeverity.Error, 'Errors');
        const fileNode = new FileNode('index.ts', vscode.Uri.file('/path/index.ts'));

        const rawInfo: RawDiagnosticInfo = {
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
        const ruleNode = new SourceRuleGroupNode('eslint: no-unused-vars', 'eslint: no-unused-vars');
        const fileNode = new FileNode('index.ts', vscode.Uri.file('/path/index.ts'));

        const rawInfo: RawDiagnosticInfo = {
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
        const provider = new DiagnosticTreeDataProvider();
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
        const provider = new DiagnosticTreeDataProvider();
        provider.setFilterText('myFilter');
        assert.strictEqual(provider.getFilterText(), 'myfilter');

        provider.clearFilterText();
        assert.strictEqual(provider.getFilterText(), undefined);
    });
});
