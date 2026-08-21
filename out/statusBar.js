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
exports.StatusBarController = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Manages the Error Copier status bar item.
 */
class StatusBarController {
    constructor(treeDataProvider) {
        this.treeDataProvider = treeDataProvider;
        this.disposables = [];
        this.enabled = true;
        this.statusBarItem = vscode.window.createStatusBarItem('errorCopierStatusBar', vscode.StatusBarAlignment.Left, 50);
        this.statusBarItem.command = 'errorcontextcopier.focusDiagnosticsView';
        this.statusBarItem.name = 'Error Copier Diagnostics';
        this.updateSettings();
        // Listen for stats updates from TreeDataProvider
        this.disposables.push(this.treeDataProvider.onDidChangeSummaryStats(stats => {
            this.updateStats(stats);
        }));
        // Listen for configuration changes
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('errorcontextcopier.statusBar.enabled')) {
                this.updateSettings();
                this.updateStats(this.treeDataProvider.getSummaryStats());
            }
        }));
        // Initial render
        this.updateStats(this.treeDataProvider.getSummaryStats());
    }
    updateSettings() {
        const config = vscode.workspace.getConfiguration('errorcontextcopier');
        this.enabled = config.get('statusBar.enabled', true);
        if (this.enabled) {
            this.statusBarItem.show();
        }
        else {
            this.statusBarItem.hide();
        }
    }
    updateStats(stats) {
        if (!this.enabled) {
            this.statusBarItem.hide();
            return;
        }
        const { errors, warnings, information, hints, total } = stats;
        if (total === 0) {
            this.statusBarItem.text = '$(check) 0 Errors';
            this.statusBarItem.tooltip = 'Error Copier: No matching diagnostics. Click to open Diagnostics Tree.';
            this.statusBarItem.backgroundColor = undefined;
        }
        else {
            const parts = [];
            if (errors > 0)
                parts.push(`$(error) ${errors}`);
            if (warnings > 0)
                parts.push(`$(warning) ${warnings}`);
            if (information > 0)
                parts.push(`$(info) ${information}`);
            if (hints > 0)
                parts.push(`$(lightbulb) ${hints}`);
            this.statusBarItem.text = parts.length > 0 ? parts.join(' ') : '$(check) 0 Errors';
            this.statusBarItem.tooltip = `Error Copier: ${errors} Error(s), ${warnings} Warning(s), ${information} Info, ${hints} Hint(s). Click to view.`;
            if (errors > 0) {
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            }
            else if (warnings > 0) {
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            }
            else {
                this.statusBarItem.backgroundColor = undefined;
            }
        }
        this.statusBarItem.show();
    }
    dispose() {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
exports.StatusBarController = StatusBarController;
//# sourceMappingURL=statusBar.js.map