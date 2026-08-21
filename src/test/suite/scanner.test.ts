import * as assert from 'assert';
import * as vscode from 'vscode';
import { RawDiagnosticInfo } from '../../types';
import {
    processDiagnosticsForReportGrouping,
    yieldToEventLoop
} from '../../diagnosticScanner';

suite('Diagnostic Scanner & Grouping Test Suite', () => {
    test('yieldToEventLoop executes asynchronously without blocking', async () => {
        let reached = false;
        const promise = yieldToEventLoop().then(() => {
            reached = true;
        });
        assert.strictEqual(reached, false);
        await promise;
        assert.strictEqual(reached, true);
    });

    test('processDiagnosticsForReportGrouping groups adjacent diagnostics within threshold', () => {
        const fileUri = vscode.Uri.file('/test/file.ts');
        const docLinesCache = new Map<string, string[]>([
            [
                fileUri.toString(),
                [
                    'line 1',
                    'line 2',
                    'line 3: error 1',
                    'line 4: error 2',
                    'line 5',
                    'line 6',
                    'line 7',
                    'line 8',
                    'line 9',
                    'line 10: error 3'
                ]
            ]
        ]);

        const diags: RawDiagnosticInfo[] = [
            {
                filePath: 'file.ts',
                fileUri,
                message: 'First error',
                startLineZeroIndexed: 2,
                endLineZeroIndexed: 2,
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(2, 0, 2, 10)
            },
            {
                filePath: 'file.ts',
                fileUri,
                message: 'Second error close to first',
                startLineZeroIndexed: 3,
                endLineZeroIndexed: 3,
                severity: vscode.DiagnosticSeverity.Warning,
                range: new vscode.Range(3, 0, 3, 10)
            },
            {
                filePath: 'file.ts',
                fileUri,
                message: 'Third distant error',
                startLineZeroIndexed: 9,
                endLineZeroIndexed: 9,
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(9, 0, 9, 10)
            }
        ];

        const groups = processDiagnosticsForReportGrouping(diags, docLinesCache, {
            linesBefore: 1,
            linesAfter: 1,
            threshold: 2
        });

        assert.strictEqual(groups.length, 2, 'Should split into 2 groups (adjacent vs distant)');
        assert.strictEqual(groups[0].individualMessages.length, 2, 'First group should contain 2 messages');
        assert.strictEqual(groups[1].individualMessages.length, 1, 'Second group should contain 1 message');
        assert.strictEqual(groups[0].groupCodeLines.length, 2);
    });
});
