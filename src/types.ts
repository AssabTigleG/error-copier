import * as vscode from 'vscode';

/**
 * Diagnostic grouping mode in the sidebar TreeView.
 */
export type GroupingMode = 'file' | 'severity' | 'sourceRule';

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
    source?: string;
    severity: vscode.DiagnosticSeverity;
    range: vscode.Range;
}

/**
 * Individual diagnostic message within a formatted group.
 */
export interface FormattedDiagnosticMessage {
    message: string;
    originalStartLine: number;
    severity: string;
    code?: string | number;
    source?: string;
}

/**
 * Represents a formatted group of diagnostics with source code context lines.
 */
export interface FormattedReportGroup {
    filePath: string;
    fullPath: string;
    individualMessages: FormattedDiagnosticMessage[];
    contextDisplayStartLineNumber: number;
    linesBeforeGroupContent?: string[];
    groupCodeLines: string[];
    linesAfterGroupContent?: string[];
}

/**
 * Summary counts of active diagnostics in workspace.
 */
export interface DiagnosticSummaryStats {
    errors: number;
    warnings: number;
    information: number;
    hints: number;
    total: number;
}

export const SEVERITY_MAP: { [key: string]: vscode.DiagnosticSeverity } = {
    "Error": vscode.DiagnosticSeverity.Error,
    "Warning": vscode.DiagnosticSeverity.Warning,
    "Information": vscode.DiagnosticSeverity.Information,
    "Hint": vscode.DiagnosticSeverity.Hint
};

export const SEVERITY_TO_STRING_MAP: { [key: number]: string } = {
    [vscode.DiagnosticSeverity.Error]: "Error",
    [vscode.DiagnosticSeverity.Warning]: "Warning",
    [vscode.DiagnosticSeverity.Information]: "Information",
    [vscode.DiagnosticSeverity.Hint]: "Hint"
};
