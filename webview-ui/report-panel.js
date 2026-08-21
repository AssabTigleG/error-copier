/**
 * Modern Client-side script for Error Context Copier interactive report panel.
 */
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    const reportContainer = document.getElementById('report-container');
    const filterInput = document.getElementById('filter-input');
    const statErrors = document.getElementById('stat-errors');
    const statWarnings = document.getElementById('stat-warnings');
    const statGroups = document.getElementById('stat-groups');
    const copyMarkdownButton = document.getElementById('copy-markdown-button');
    const expandAllButton = document.getElementById('expand-all-button');
    const collapseAllButton = document.getElementById('collapse-all-button');

    let currentReportData = [];

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'loadData':
                currentReportData = message.data || [];
                renderReport(currentReportData);
                break;
        }
    });

    vscode.postMessage({ command: 'webviewReady' });

    if (filterInput) {
        filterInput.addEventListener('input', (e) => {
            // @ts-ignore
            const filterText = e.target.value.toLowerCase().trim();
            const groups = reportContainer.querySelectorAll('.report-group');
            let visibleCount = 0;

            groups.forEach(group => {
                // @ts-ignore
                const filePath = group.dataset.filePath.toLowerCase();
                // @ts-ignore
                const messages = group.dataset.messages.toLowerCase();
                if (!filterText || filePath.includes(filterText) || messages.includes(filterText)) {
                    // @ts-ignore
                    group.style.display = '';
                    visibleCount++;
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
        expandAllButton.addEventListener('click', () => toggleAllGroups(false));
    }

    if (collapseAllButton) {
        collapseAllButton.addEventListener('click', () => toggleAllGroups(true));
    }

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

    function highlightText(element, text) {
        removeHighlight(element);
        if (!text) return;

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
        let node;
        const regex = new RegExp(`(${escapeRegExp(text)})`, 'gi');

        while (node = walker.nextNode()) {
            if (node.parentElement && (node.parentElement.classList.contains('highlight') || node.parentElement.tagName === 'BUTTON')) {
                continue;
            }

            const matches = Array.from(node.nodeValue.matchAll(regex));
            if (matches.length === 0) continue;

            let lastIndex = 0;
            const fragment = document.createDocumentFragment();

            for (const match of matches) {
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex, match.index)));
                }
                const span = document.createElement('span');
                span.className = 'highlight';
                span.textContent = match[0];
                fragment.appendChild(span);
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < node.nodeValue.length) {
                fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex)));
            }

            if (node.parentNode) {
                node.parentNode.replaceChild(fragment, node);
            }
        }
    }

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

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function renderReport(reportGroups) {
        if (!reportContainer) return;
        if (!reportGroups || reportGroups.length === 0) {
            reportContainer.innerHTML = '<p class="placeholder">No diagnostics found in selected scope.</p>';
            updateSummaryStats(0, 0, 0);
            return;
        }

        reportContainer.innerHTML = '';
        let errorCount = 0;
        let warningCount = 0;

        reportGroups.forEach((group, groupIdx) => {
            const groupElement = document.createElement('div');
            groupElement.className = 'report-group';
            groupElement.dataset.filePath = group.filePath;
            groupElement.dataset.messages = group.individualMessages.map(im => `${im.message} ${im.code || ''} ${im.source || ''}`).join(' ');

            // Calculate severities in this group
            let groupHasError = false;
            let groupHasWarning = false;
            group.individualMessages.forEach(im => {
                if (im.severity === 'Error') { errorCount++; groupHasError = true; }
                else if (im.severity === 'Warning') { warningCount++; groupHasWarning = true; }
            });

            // Header
            const header = document.createElement('div');
            header.className = 'report-group-header';

            const severityBadge = groupHasError ? '<span class="diag-badge error">ERROR</span>' : (groupHasWarning ? '<span class="diag-badge warning">WARN</span>' : '<span class="diag-badge information">INFO</span>');

            header.innerHTML = `
                <div class="title-area">
                    ${severityBadge}
                    <h3><a href="#" data-filepath="${group.fullPath}" data-line="${group.contextDisplayStartLineNumber}">${group.filePath}</a></h3>
                </div>
                <div class="header-right">
                    <span class="diag-code">${group.individualMessages.length} issue(s)</span>
                    <span class="toggle-icon">▼</span>
                </div>
            `;

            header.addEventListener('click', (e) => {
                // @ts-ignore
                if (e.target.tagName === 'A' || e.target.closest('a')) return;
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

            // Body
            const body = document.createElement('div');
            body.className = 'report-group-body';

            // Diagnostic Messages List
            const messagesList = document.createElement('ul');
            messagesList.className = 'individual-diagnostics-list';
            group.individualMessages.forEach(diag => {
                const listItem = document.createElement('li');
                listItem.className = `sev-${diag.severity.toLowerCase()}`;
                const srcCode = [diag.source, diag.code].filter(Boolean).map(escapeHtml).join(': ');
                const badgeClass = diag.severity.toLowerCase();

                listItem.innerHTML = `
                    <span class="diag-badge ${badgeClass}">L${diag.originalStartLine}</span>
                    <span class="diag-msg">${escapeHtml(diag.message)}</span>
                    ${srcCode ? `<span class="diag-code">[${srcCode}]</span>` : ''}
                `;
                messagesList.appendChild(listItem);
            });
            body.appendChild(messagesList);

            // Code context with line numbers
            const codeContext = document.createElement('div');
            codeContext.className = 'code-context';
            const pre = document.createElement('pre');
            let codeHtml = '';

            if (group.linesBeforeGroupContent) {
                group.linesBeforeGroupContent.forEach((line, index) => {
                    const lineNo = group.contextDisplayStartLineNumber - group.linesBeforeGroupContent.length + index;
                    codeHtml += `<div class="code-row"><span class="line-number">${lineNo}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
                });
            }
            group.groupCodeLines.forEach((line, index) => {
                const lineNo = group.contextDisplayStartLineNumber + index;
                codeHtml += `<div class="code-row error-row"><span class="line-number">${lineNo}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
            });
            if (group.linesAfterGroupContent) {
                const firstLineAfter = group.contextDisplayStartLineNumber + group.groupCodeLines.length;
                group.linesAfterGroupContent.forEach((line, index) => {
                    const lineNo = firstLineAfter + index;
                    codeHtml += `<div class="code-row"><span class="line-number">${lineNo}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
                });
            }
            pre.innerHTML = codeHtml;
            codeContext.appendChild(pre);
            body.appendChild(codeContext);

            // Card Action Buttons
            const cardActions = document.createElement('div');
            cardActions.className = 'card-actions';

            const copyCardBtn = document.createElement('button');
            copyCardBtn.className = 'btn btn-secondary';
            copyCardBtn.textContent = 'Copy Snippet';
            copyCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                vscode.postMessage({
                    command: 'copyMarkdownToClipboard',
                    data: [group]
                });
            });

            cardActions.appendChild(copyCardBtn);
            body.appendChild(cardActions);

            groupElement.appendChild(header);
            groupElement.appendChild(body);
            reportContainer.appendChild(groupElement);
        });

        updateSummaryStats(errorCount, warningCount, reportGroups.length);
    }

    function updateSummaryStats(errors, warnings, groups) {
        if (statErrors) {
            statErrors.textContent = `${errors} Errors`;
            statErrors.style.display = errors > 0 ? '' : 'none';
        }
        if (statWarnings) {
            statWarnings.textContent = `${warnings} Warnings`;
            statWarnings.style.display = warnings > 0 ? '' : 'none';
        }
        if (statGroups) {
            statGroups.textContent = `${groups} Group${groups !== 1 ? 's' : ''}`;
        }
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

}());