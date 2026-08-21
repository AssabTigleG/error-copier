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
exports.SEVERITY_TO_STRING_MAP = exports.SEVERITY_MAP = void 0;
const vscode = __importStar(require("vscode"));
exports.SEVERITY_MAP = {
    "Error": vscode.DiagnosticSeverity.Error,
    "Warning": vscode.DiagnosticSeverity.Warning,
    "Information": vscode.DiagnosticSeverity.Information,
    "Hint": vscode.DiagnosticSeverity.Hint
};
exports.SEVERITY_TO_STRING_MAP = {
    [vscode.DiagnosticSeverity.Error]: "Error",
    [vscode.DiagnosticSeverity.Warning]: "Warning",
    [vscode.DiagnosticSeverity.Information]: "Information",
    [vscode.DiagnosticSeverity.Hint]: "Hint"
};
//# sourceMappingURL=types.js.map