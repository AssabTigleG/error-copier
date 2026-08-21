import { FormattedReportGroup } from '../types';

/**
 * Messages sent from Extension Host to Webview Panel.
 */
export type ExtensionToWebviewMessage =
    | { command: 'loadData'; data: FormattedReportGroup[] }
    | { command: 'setFilter'; filter: string };

/**
 * Messages sent from Webview Panel to Extension Host.
 */
export type WebviewToExtensionMessage =
    | { command: 'webviewReady' }
    | { command: 'navigateTo'; filePath: string; line: number }
    | { command: 'autoFix'; filePath: string; line: number }
    | { command: 'fixAllInFile'; filePath: string }
    | { command: 'fixAllInScope'; filePaths: string[] }
    | { command: 'copyMarkdownToClipboard'; data: FormattedReportGroup[] }
    | { command: 'openFile'; filePath: string };
