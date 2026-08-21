import './setup';
import * as assert from 'assert';
import { FormattedReportGroup } from '../../types';
import {
    generateMarkdownReport,
    generateJsonReport,
    generateHtmlFileReport,
    generateCsvReport,
    generateAiPrompt,
    escapeHtml,
    escapeCsvField,
    yieldToEventLoop
} from '../../diagnosticScanner';

suite('Unit Tests: Diagnostic Formatters & Helpers', () => {
    const mockReportData: FormattedReportGroup[] = [
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
        const md = generateMarkdownReport(mockReportData);
        assert.ok(md.includes('## Diagnostic Report'), 'Markdown should contain header');
        assert.ok(md.includes('src/app.ts'), 'Markdown should contain file path');
        assert.ok(md.includes("Cannot find name 'foo'."), 'Markdown should contain error message');
        assert.ok(md.includes('ts: 2304'), 'Markdown should contain source/code');
        assert.ok(md.includes('const b = foo();'), 'Markdown should contain context line');
    });

    test('generateJsonReport outputs valid JSON with correct structure', () => {
        const jsonStr = generateJsonReport(mockReportData);
        const parsed = JSON.parse(jsonStr) as FormattedReportGroup[];
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].filePath, 'src/app.ts');
        assert.strictEqual(parsed[0].individualMessages.length, 2);
        assert.strictEqual(parsed[0].individualMessages[0].code, '2304');
    });

    test('generateHtmlFileReport generates complete HTML document with styles and escaped content', () => {
        const html = generateHtmlFileReport(mockReportData);
        assert.ok(html.includes('<!DOCTYPE html>'), 'HTML should contain doctype');
        assert.ok(html.includes('src/app.ts'), 'HTML should contain file path');
        assert.ok(html.includes('severity-Error'), 'HTML should contain severity class');
        assert.ok(html.includes('const b = foo();'), 'HTML should contain snippet');
    });

    test('generateCsvReport generates properly escaped CSV rows', () => {
        const csv = generateCsvReport(mockReportData);
        assert.ok(csv.startsWith('"File Path","Severity","Line Number"'), 'CSV should start with header row');
        assert.ok(csv.includes('"src/app.ts","Error","10","Cannot find name \'foo\'.","2304","ts"'));
    });

    test('escapeHtml handles special characters correctly', () => {
        assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        assert.strictEqual(escapeHtml('foo & bar'), 'foo &amp; bar');
        assert.strictEqual(escapeHtml(undefined), '');
    });

    test('escapeCsvField handles commas, quotes, and newlines', () => {
        assert.strictEqual(escapeCsvField('simple'), '"simple"');
        assert.strictEqual(escapeCsvField('has, comma'), '"has, comma"');
        assert.strictEqual(escapeCsvField('has "quotes"'), '"has ""quotes"""');
        assert.strictEqual(escapeCsvField("has\nnewline"), '"has\nnewline"');
    });

    test('generateAiPrompt generates prompt with instructions, diagnostics and snippets', () => {
        const prompt = generateAiPrompt(mockReportData);
        assert.ok(prompt.includes('Please fix the following issue(s)'), 'Prompt should have header instruction');
        assert.ok(prompt.includes('### File: `src/app.ts`'), 'Prompt should have file name');
        assert.ok(prompt.includes("Cannot find name 'foo'."), 'Prompt should list the error');
        assert.ok(prompt.includes('const b = foo();'), 'Prompt should include code snippet');
        assert.ok(prompt.includes('Please provide the corrected code'), 'Prompt should have footer instruction');
    });

    test('yieldToEventLoop executes asynchronously without blocking', async () => {
        let reached = false;
        const promise = yieldToEventLoop().then(() => {
            reached = true;
        });
        assert.strictEqual(reached, false);
        await promise;
        assert.strictEqual(reached, true);
    });
});
