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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const diagnosticScanner_1 = require("../../diagnosticScanner");
suite('Diagnostic Scanner & Grouping Test Suite', () => {
    test('yieldToEventLoop executes asynchronously without blocking', async () => {
        let reached = false;
        const promise = (0, diagnosticScanner_1.yieldToEventLoop)().then(() => {
            reached = true;
        });
        assert.strictEqual(reached, false);
        await promise;
        assert.strictEqual(reached, true);
    });
    test('processDiagnosticsForReportGrouping groups adjacent diagnostics within threshold', () => {
        const fileUri = vscode.Uri.file('/test/file.ts');
        const docLinesCache = new Map([
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
        const diags = [
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
        const groups = (0, diagnosticScanner_1.processDiagnosticsForReportGrouping)(diags, docLinesCache, {
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
//# sourceMappingURL=scanner.test.js.map