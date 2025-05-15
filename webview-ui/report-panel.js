/**
 * @fileoverview Client-side script for the Error Context Copier interactive report panel.
 * Handles data rendering, user interactions (filtering, navigation, copying),
 * and communication with the VS Code extension.
 */
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const reportContainer = document.getElementById('report-container');
    const filterInput = document.getElementById('filter-input');
    const totalGroupsSpan = document.getElementById('total-groups');
    const totalDiagnosticsSpan = document.getElementById('total-diagnostics');
    const copyMarkdownButton = document.getElementById('copy-markdown-button');
    const expandAllButton = document.getElementById('expand-all-button');
    const collapseAllButton = document.getElementById('collapse-all-button');

    let currentReportData = [];

    /**
     * Handles messages received from the VS Code extension.
     * @param {MessageEvent} event - The message event.
     */
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'loadData':
                currentReportData = message.data;
                renderReport(message.data);
                break;
        }
    });

    vscode.postMessage({ command: 'webviewReady' });

    if (filterInput) {
        filterInput.addEventListener('input', (e) => {
            // @ts-ignore
            const filterText = e.target.value.toLowerCase();
            const groups = reportContainer.querySelectorAll('.report-group');
            groups.forEach(group => {
                // @ts-ignore
                const filePath = group.dataset.filePath.toLowerCase();
                // @ts-ignore
                const messages = group.dataset.messages.toLowerCase();
                if (filePath.includes(filterText) || messages.includes(filterText)) {
                    // @ts-ignore
                    group.style.display = '';
                    highlightText(group, filterText);
                } else {
                    // @ts-ignore
                    group.style.display = 'none';
                    removeHighlight(group);
                }
            });
        });
    }

    if (copyMarkdownButton) {
        copyMarkdownButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyMarkdownToClipboard', data: currentReportData });
        });
    }

    if (expandAllButton) {
        expandAllButton.addEventListener('click', () => {
            toggleAllGroups(false);
        });
    }

    if (collapseAllButton) {
        collapseAllButton.addEventListener('click', () => {
            toggleAllGroups(true);
        });
    }

    /**
     * Expands or collapses all diagnostic groups in the report.
     * @param {boolean} collapse - True to collapse all, false to expand all.
     */
    function toggleAllGroups(collapse) {
        const groups = reportContainer.querySelectorAll('.report-group');
        groups.forEach(groupElement => {
            if (collapse) {
                groupElement.classList.add('collapsed');
            } else {
                groupElement.classList.remove('collapsed');
            }
        });
    }

    /**
     * Highlights occurrences of text within an element.
     * @param {HTMLElement} element - The parent element to search within.
     * @param {string} text - The text to highlight.
     */
    function highlightText(element, text) {
        removeHighlight(element);
        if (!text) return;

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node;
        const regex = new RegExp(`(${escapeRegExpForHighlight(text)})`, 'gi');

        while (node = walker.nextNode()) {
            if (node.parentElement && node.parentElement.classList.contains('highlight')) continue;

            const matches = Array.from(node.nodeValue.matchAll(regex)); // Convert iterator to array
            if (matches.length === 0) continue;

            let lastIndex = 0;
            const fragment = document.createDocumentFragment();
            let replaced = false;

            for (const match of matches) {
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex, match.index)));
                }
                const span = document.createElement('span');
                span.className = 'highlight';
                span.textContent = match[0];
                fragment.appendChild(span);
                lastIndex = match.index + match[0].length;
                replaced = true;
            }
            if (lastIndex < node.nodeValue.length) {
                fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex)));
            }

            if (replaced && node.parentNode) {
                node.parentNode.replaceChild(fragment, node);
            }
        }
    }

    /**
     * Removes all text highlights from within an element.
     * @param {HTMLElement} element - The parent element from which to remove highlights.
     */
    function removeHighlight(element) {
        const highlights = element.querySelectorAll('span.highlight');
        highlights.forEach(span => {
            const parent = span.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(span.textContent), span);
                parent.normalize();
            }
        });
    }

    /**
     * Escapes special characters in a string for use in a regular expression.
     * @param {string} string - The input string.
     * @returns {string} The escaped string.
     */
    function escapeRegExpForHighlight(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Renders the diagnostic report groups into the report container.
     * @param {Array<Object>} reportGroups - An array of FormattedReportGroup objects.
     */
    function renderReport(reportGroups) {
        if (!reportContainer) return;
        if (!reportGroups || reportGroups.length === 0) {
            reportContainer.innerHTML = '<p class="placeholder">No diagnostics found.</p>';
            updateSummaryStats(0, 0);
            return;
        }

        reportContainer.innerHTML = '';
        let totalDiagnosticsCount = 0;

        reportGroups.forEach(group => {
            const groupElement = document.createElement('div');
            groupElement.className = 'report-group collapsed';
            groupElement.dataset.filePath = group.filePath;
            groupElement.dataset.messages = group.individualMessages.map(im => im.message).join(' ');

            const header = document.createElement('div');
            header.className = 'report-group-header';
            header.innerHTML = `
                <h3><a href="#" data-filepath="${group.fullPath}" data-line="${group.contextDisplayStartLineNumber}">${group.filePath}</a> (${group.individualMessages.length} ${group.individualMessages.length === 1 ? 'Diagnostic' : 'Diagnostics'})</h3>
                <span class="toggle-icon">▼</span>
            `;
            header.addEventListener('click', (e) => {
                // @ts-ignore
                if (e.target.tagName === 'A') return;
                groupElement.classList.toggle('collapsed');
            });

            const filePathLink = header.querySelector('a');
            if (filePathLink) {
                filePathLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    vscode.postMessage({
                        command: 'navigateTo',
                        // @ts-ignore
                        filePath: e.target.dataset.filepath,
                        // @ts-ignore
                        line: parseInt(e.target.dataset.line)
                    });
                });
            }

            const body = document.createElement('div');
            body.className = 'report-group-body';

            const messagesList = document.createElement('ul');
            messagesList.className = 'individual-diagnostics-list';
            group.individualMessages.forEach(diag => {
                totalDiagnosticsCount++;
                const listItem = document.createElement('li');
                listItem.innerHTML = `<span class="severity-${diag.severity}">${diag.severity} (L${diag.originalStartLine}):</span> ${escapeHtmlForDisplay(diag.message)} ${diag.code ? `(${escapeHtmlForDisplay(String(diag.code))})` : ''}`;
                messagesList.appendChild(listItem);
            });
            body.appendChild(messagesList);

            const codeContext = document.createElement('div');
            codeContext.className = 'code-context';
            const pre = document.createElement('pre');
            let codeHtml = '';

            if (group.linesBeforeGroupContent) {
                group.linesBeforeGroupContent.forEach((line, index) => {
                    const lineNumber = group.contextDisplayStartLineNumber - group.linesBeforeGroupContent.length + index;
                    codeHtml += `<span class="line-number">${lineNumber}</span><span class="line-content">${escapeHtmlForDisplay(line)}</span>\n`;
                });
            }
            group.groupCodeLines.forEach((line, index) => {
                const lineNumber = group.contextDisplayStartLineNumber + index;
                codeHtml += `<span class="line-number error-line-indicator">${lineNumber}</span><span class="line-content">${escapeHtmlForDisplay(line)}</span>\n`;
            });
            if (group.linesAfterGroupContent) {
                const firstLineAfterNumber = group.contextDisplayStartLineNumber + group.groupCodeLines.length;
                group.linesAfterGroupContent.forEach((line, index) => {
                    const lineNumber = firstLineAfterNumber + index;
                    codeHtml += `<span class="line-number">${lineNumber}</span><span class="line-content">${escapeHtmlForDisplay(line)}</span>\n`;
                });
            }
            pre.innerHTML = codeHtml;
            codeContext.appendChild(pre);
            body.appendChild(codeContext);

            groupElement.appendChild(header);
            groupElement.appendChild(body);
            reportContainer.appendChild(groupElement);
        });

        updateSummaryStats(reportGroups.length, totalDiagnosticsCount);
    }

    /**
     * Updates the summary statistics display in the toolbar.
     * @param {number} groupCount - The total number of diagnostic groups.
     * @param {number} diagnosticCount - The total number of individual diagnostics.
     */
    function updateSummaryStats(groupCount, diagnosticCount) {
        if (totalGroupsSpan) totalGroupsSpan.textContent = `Groups: ${groupCount}`;
        if (totalDiagnosticsSpan) totalDiagnosticsSpan.textContent = `Diagnostics: ${diagnosticCount}`;
    }

    /**
     * Escapes HTML special characters in a string for safe display in HTML.
     * @param {string | number | undefined} unsafe - The string or number to escape.
     * @returns {string} The escaped string.
     */
    function escapeHtmlForDisplay(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)

            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    }

}());