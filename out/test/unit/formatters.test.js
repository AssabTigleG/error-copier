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
const diagnosticScanner_1 = require("../../diagnosticScanner");
suite('Unit Tests: Diagnostic Formatters & Helpers', () => {
    const mockReportData = [
        {
            filePath: 'src/app.ts',
            fullPath: '/workspace/src/app.ts',
            individualMessages: [
                {
                    message: "Cannot find name 'foo'.",
                    originalStartLine: 10,
                    severity: 'Error',
                    code: '2304',
                    source: 'ts'
                },
                {
                    message: 'Unexpected any. Specify a different type.',
                    originalStartLine: 11,
                    severity: 'Warning',
                    code: 'no-explicit-any',
                    source: 'eslint'
                }
            ],
            contextDisplayStartLineNumber: 10,
            linesBeforeGroupContent: ['const a = 1;'],
            groupCodeLines: ['const b = foo();', 'const c: any = b;'],
            linesAfterGroupContent: ['return c;']
        }
    ];
    test('generateMarkdownReport includes header, file name, severities, and code context', () => {
        const md = (0, diagnosticScanner_1.generateMarkdownReport)(mockReportData);
        assert.ok(md.includes('## Diagnostic Report'), 'Markdown should contain header');
        assert.ok(md.includes('src/app.ts'), 'Markdown should contain file path');
        assert.ok(md.includes("Cannot find name 'foo'."), 'Markdown should contain error message');
        assert.ok(md.includes('ts: 2304'), 'Markdown should contain source/code');
        assert.ok(md.includes('const b = foo();'), 'Markdown should contain context line');
    });
    test('generateJsonReport outputs valid JSON with correct structure', () => {
        const jsonStr = (0, diagnosticScanner_1.generateJsonReport)(mockReportData);
        const parsed = JSON.parse(jsonStr);
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].filePath, 'src/app.ts');
        assert.strictEqual(parsed[0].individualMessages.length, 2);
        assert.strictEqual(parsed[0].individualMessages[0].code, '2304');
    });
    test('generateHtmlFileReport generates complete HTML document with styles and escaped content', () => {
        const html = (0, diagnosticScanner_1.generateHtmlFileReport)(mockReportData);
        assert.ok(html.includes('<!DOCTYPE html>'), 'HTML should contain doctype');
        assert.ok(html.includes('src/app.ts'), 'HTML should contain file path');
        assert.ok(html.includes('severity-Error'), 'HTML should contain severity class');
        assert.ok(html.includes('const b = foo();'), 'HTML should contain snippet');
    });
    test('generateCsvReport generates properly escaped CSV rows', () => {
        const csv = (0, diagnosticScanner_1.generateCsvReport)(mockReportData);
        assert.ok(csv.startsWith('"File Path","Severity","Line Number"'), 'CSV should start with header row');
        assert.ok(csv.includes('"src/app.ts","Error","10","Cannot find name \'foo\'.","2304","ts"'));
    });
    test('escapeHtml handles special characters correctly', () => {
        assert.strictEqual((0, diagnosticScanner_1.escapeHtml)('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        assert.strictEqual((0, diagnosticScanner_1.escapeHtml)('foo & bar'), 'foo &amp; bar');
        assert.strictEqual((0, diagnosticScanner_1.escapeHtml)(undefined), '');
    });
    test('escapeCsvField handles commas, quotes, and newlines', () => {
        assert.strictEqual((0, diagnosticScanner_1.escapeCsvField)('simple'), '"simple"');
        assert.strictEqual((0, diagnosticScanner_1.escapeCsvField)('has, comma'), '"has, comma"');
        assert.strictEqual((0, diagnosticScanner_1.escapeCsvField)('has "quotes"'), '"has ""quotes"""');
        assert.strictEqual((0, diagnosticScanner_1.escapeCsvField)("has\nnewline"), '"has\nnewline"');
    });
    test('generateAiPrompt generates prompt with instructions, diagnostics and snippets', () => {
        const prompt = (0, diagnosticScanner_1.generateAiPrompt)(mockReportData);
        assert.ok(prompt.includes('Please fix the following issue(s)'), 'Prompt should have header instruction');
        assert.ok(prompt.includes('### File: `src/app.ts`'), 'Prompt should have file name');
        assert.ok(prompt.includes("Cannot find name 'foo'."), 'Prompt should list the error');
        assert.ok(prompt.includes('const b = foo();'), 'Prompt should include code snippet');
        assert.ok(prompt.includes('Please provide the corrected code'), 'Prompt should have footer instruction');
    });
    test('yieldToEventLoop executes asynchronously without blocking', async () => {
        let reached = false;
        const promise = (0, diagnosticScanner_1.yieldToEventLoop)().then(() => {
            reached = true;
        });
        assert.strictEqual(reached, false);
        await promise;
        assert.strictEqual(reached, true);
    });
});
//# sourceMappingURL=formatters.test.js.map