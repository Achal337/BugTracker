// ===================================================================
// BugLens AI — Main Application Logic
// 4-Step Flow: Configure → Describe Bug → Review Report → Create Bug
// ===================================================================

// support up to 4 screenshots
let uploadedFiles = [];
let uploadedBase64s = []; // parallel base64 strings
let pendingUploads = 0; // number of files currently being read


let isAnalyzing = false;
let isPushingJira = false;
let currentStep = 1;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    initStep1();
    initStep2();
    initStep3();
    initStep4();
    goToStep(1);
});

// ===================================================================
// STEP NAVIGATION
// ===================================================================
function goToStep(step) {
    currentStep = step;

    // Update panels
    $$('.step-panel').forEach((p) => p.classList.remove('active-panel'));
    $(`#step-${step}-panel`).classList.add('active-panel');

    // Update stepper
    $$('.stepper .step').forEach((s, i) => {
        const stepNum = i + 1;
        s.classList.remove('active', 'done');
        if (stepNum === step) s.classList.add('active');
        else if (stepNum < step) s.classList.add('done');
    });

    // Update step lines
    $$('.stepper .step-line').forEach((line, i) => {
        line.classList.remove('done');
        if (i + 1 < step) line.classList.add('done');
    });
}

// ===================================================================
// STEP 1: CONFIGURATION
// ===================================================================
function initStep1() {
    $('#btn-save-config').addEventListener('click', saveConfig);
    $('#btn-validate-groq').addEventListener('click', validateGroqKey);
    $('#btn-validate-jira').addEventListener('click', validateJiraConnection);

    // Toggle visibility buttons
    $$('.btn-toggle-vis').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = $(`#${btn.dataset.target}`);
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    });
}

// ---- GROQ VALIDATION ----
async function validateGroqKey() {
    const key = $('#cfg-groq-key').value.trim();
    if (!key) { showToast('Enter your Groq API key first.', 'warning'); return; }

    const btn = $('#btn-validate-groq');
    const btnText = btn.querySelector('span');
    const loader = btn.querySelector('.btn-loader');
    const statusEl = $('#groq-status');

    btnText.textContent = 'Validating...';
    loader.classList.remove('hidden');
    btn.disabled = true;
    statusEl.classList.add('hidden');

    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });

        if (res.ok) {
            const data = await res.json();
            const modelNames = (data.data || []).map(m => m.id);
            const hasVision = modelNames.some(n => n.includes('llama-4-scout'));
            showValidateStatus('groq-status', true,
                hasVision ? 'Valid — Llama 4 Scout available ✓' : 'Valid — but Llama 4 Scout model not found');
        } else if (res.status === 401) {
            showValidateStatus('groq-status', false, 'Invalid API key');
        } else {
            showValidateStatus('groq-status', false, `API error: ${res.status}`);
        }
    } catch (err) {
        showValidateStatus('groq-status', false, `Connection failed: ${err.message}`);
    } finally {
        btnText.textContent = 'Validate Key';
        loader.classList.add('hidden');
        btn.disabled = false;
    }
}

// ---- JIRA VALIDATION ----
async function validateJiraConnection() {
    const url = $('#cfg-jira-url').value.trim();
    const email = $('#cfg-jira-email').value.trim();
    const token = $('#cfg-jira-token').value.trim();
    const project = $('#cfg-jira-project').value.trim();

    if (!url || !email || !token || !project) {
        showToast('Fill in all required Jira fields first.', 'warning');
        return;
    }

    const btn = $('#btn-validate-jira');
    const btnText = btn.querySelector('span');
    const loader = btn.querySelector('.btn-loader');
    const statusEl = $('#jira-status');

    btnText.textContent = 'Validating...';
    loader.classList.remove('hidden');
    btn.disabled = true;
    statusEl.classList.add('hidden');

    try {
        const baseUrl = url.replace(/\/+$/, '');
        const auth = btoa(`${email}:${token}`);

        const res = await jiraProxy(
            `${baseUrl}/rest/api/3/project/${project}`,
            'GET',
            { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        );

        if (res.ok) {
            const data = await res.json();
            showValidateStatus('jira-status', true,
                `Connected — Project "${data.name}" (${data.key})`);
        } else if (res.status === 401) {
            showValidateStatus('jira-status', false, 'Invalid email or API token');
        } else if (res.status === 404) {
            showValidateStatus('jira-status', false, `Project "${project}" not found`);
        } else {
            showValidateStatus('jira-status', false, `Jira error: ${res.status}`);
        }
    } catch (err) {
        showValidateStatus('jira-status', false, `Connection failed — check URL`);
    } finally {
        btnText.textContent = 'Validate Connection';
        loader.classList.add('hidden');
        btn.disabled = false;
    }
}

function showValidateStatus(elementId, success, message) {
    const el = $(`#${elementId}`);
    el.classList.remove('hidden', 'success', 'error');
    el.classList.add(success ? 'success' : 'error');
    el.querySelector('.validate-msg').textContent = message;
}

// ---- JIRA PROXY HELPER (avoids CORS) ----
async function jiraProxy(targetUrl, method, headers, requestBody) {
    const res = await fetch('/api/jira-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl, method, headers, requestBody })
    });
    return res;
}

function saveConfig() {
    const groqKey = $('#cfg-groq-key').value.trim();
    const jiraUrl = $('#cfg-jira-url').value.trim();
    const jiraEmail = $('#cfg-jira-email').value.trim();
    const jiraToken = $('#cfg-jira-token').value.trim();
    const jiraProject = $('#cfg-jira-project').value.trim();
    const jiraIssueType = $('#cfg-jira-issuetype').value.trim() || 'Bug';
    const jiraStatus = $('#cfg-jira-status').value.trim() || 'To Do';

    // Validate required fields
    if (!groqKey) { showToast('Groq API Key is required.', 'error'); return; }
    if (!jiraUrl) { showToast('Jira Connection URL is required.', 'error'); return; }
    if (!jiraEmail) { showToast('Jira Email is required.', 'error'); return; }
    if (!jiraToken) { showToast('Jira API Token is required.', 'error'); return; }
    if (!jiraProject) { showToast('Jira Project Key is required.', 'error'); return; }

    localStorage.setItem('buglens_groq_key', groqKey);
    localStorage.setItem('buglens_jira_url', jiraUrl);
    localStorage.setItem('buglens_jira_email', jiraEmail);
    localStorage.setItem('buglens_jira_token', jiraToken);
    localStorage.setItem('buglens_jira_project', jiraProject);
    localStorage.setItem('buglens_jira_issuetype', jiraIssueType);
    localStorage.setItem('buglens_jira_status', jiraStatus);

    // Update connection status
    updateConnectionStatus(true);

    showToast('Configuration saved!', 'success');
    goToStep(2);
}

function loadConfig() {
    const fields = {
        'cfg-groq-key': 'buglens_groq_key',
        'cfg-jira-url': 'buglens_jira_url',
        'cfg-jira-email': 'buglens_jira_email',
        'cfg-jira-token': 'buglens_jira_token',
        'cfg-jira-project': 'buglens_jira_project',
        'cfg-jira-issuetype': 'buglens_jira_issuetype',
        'cfg-jira-status': 'buglens_jira_status'
    };

    let hasConfig = true;
    for (const [elemId, key] of Object.entries(fields)) {
        const val = localStorage.getItem(key);
        if (val) $(`#${elemId}`).value = val;
        if (['buglens_groq_key', 'buglens_jira_url', 'buglens_jira_email', 'buglens_jira_token', 'buglens_jira_project'].includes(key) && !val) {
            hasConfig = false;
        }
    }

    updateConnectionStatus(hasConfig);
}

function updateConnectionStatus(connected) {
    const status = $('#connection-status');
    if (connected) {
        status.classList.remove('disconnected');
        status.classList.add('connected');
        status.querySelector('.status-text').textContent = 'Connected';
    } else {
        status.classList.remove('connected');
        status.classList.add('disconnected');
        status.querySelector('.status-text').textContent = 'Not Configured';
    }
}

// ===================================================================
// STEP 2: DESCRIBE BUG (Upload + Description)
// ===================================================================
function initStep2() {
    const dropZone = $('#drop-zone');
    const fileInput = $('#file-input');
    const btnRemove = $('#btn-remove-image');
    const btnAnalyze = $('#btn-analyze');
    const description = $('#issue-description');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            for (const f of e.target.files) {
                handleFile(f);
                if (uploadedFiles.length + pendingUploads >= 4) break;
            }
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            for (const f of e.dataTransfer.files) {
                handleFile(f);
                if (uploadedFiles.length + pendingUploads >= 4) break;
            }
        }
    });

    // btnRemove is no longer a single-button; individual previews have their own remove button.

    btnAnalyze.addEventListener('click', () => analyzeWithAI());

    // Enable analyze button when both screenshot and description are present
    const checkReady = () => {
        btnAnalyze.disabled = !(uploadedBase64s.length > 0 && description.value.trim());
    };
    description.addEventListener('input', checkReady);

    // Back button
    $('#btn-back-to-1').addEventListener('click', () => goToStep(1));
}

function handleFile(file) {
    // reserve slot including pending
    if (uploadedFiles.length + pendingUploads >= 4) {
        showToast('Maximum of 4 screenshots allowed.', 'warning');
        return;
    }
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file (PNG, JPG, WEBP)', 'error');
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        showToast('File too large. Maximum size is 20MB.', 'error');
        return;
    }

    pendingUploads++;
    const reader = new FileReader();
    reader.onload = (e) => {
        pendingUploads--;
        uploadedFiles.push(file);
        uploadedBase64s.push(e.target.result);
        showPreview();
    };
    reader.onerror = () => {
        pendingUploads--;
        showToast('Failed to read image.', 'error');
    };
    reader.readAsDataURL(file);
}

function showPreview() {
    const container = $('#preview-container');
    container.innerHTML = '';

    if (uploadedBase64s.length === 0) {
        // nothing left, show drop zone again
        $('#drop-zone').classList.remove('hidden');
        container.classList.add('hidden');
        $('#btn-analyze').disabled = true;
        return;
    }

    uploadedBase64s.forEach((url, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'preview-item';
        wrapper.innerHTML = `
            <img src="${url}" alt="Screenshot ${idx + 1}" />
            <button type="button" class="btn-remove" data-index="${idx}" title="Remove image">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        `;
        container.appendChild(wrapper);
    });

    $('#drop-zone').classList.add('hidden');
    container.classList.remove('hidden');

    // attach remove handlers
    container.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.index, 10);
            removeFile(idx);
        });
    });

    // Check if analyze should be enabled
    const desc = $('#issue-description').value.trim();
    $('#btn-analyze').disabled = !(desc && uploadedBase64s.length);
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    uploadedBase64s.splice(index, 1);
    showPreview();
    $('#file-input').value = ''; // allow reselecting same files
}

function resetUpload() {
    uploadedFiles = [];
    uploadedBase64s = [];
    $('#preview-container').innerHTML = '';
    $('#preview-container').classList.add('hidden');
    $('#drop-zone').classList.remove('hidden');
    $('#btn-analyze').disabled = true;
    $('#file-input').value = '';
}

// ===================================================================
// AI ANALYSIS (GROQ VISION — Llama 4 Scout)
// ===================================================================
async function analyzeWithAI() {
    const groqKey = localStorage.getItem('buglens_groq_key');
    if (!groqKey) {
        showToast('Groq API key not configured. Go back to Step 1.', 'error');
        return;
    }
    if (uploadedBase64s.length === 0) { showToast('Upload at least one screenshot first.', 'warning'); return; }

    const userDescription = $('#issue-description').value.trim();
    if (!userDescription) { showToast('Provide a brief description of the issue.', 'warning'); return; }

    if (isAnalyzing) return;
    isAnalyzing = true;

    const btnAnalyze = $('#btn-analyze');
    const btnText = btnAnalyze.querySelector('span');
    const btnLoader = btnAnalyze.querySelector('.btn-loader');
    const uploadSection = $('#step-2-panel');

    btnText.textContent = 'Analyzing...';
    btnLoader.classList.remove('hidden');
    btnAnalyze.disabled = true;
    uploadSection.classList.add('analyzing');

    try {
        const systemPrompt = `You are a Senior QA Engineer with 8+ years of experience analyzing bug screenshots.
You will receive a bug screenshot AND a brief description from the tester.
Carefully analyze BOTH the screenshot and the description to generate a thorough, professional bug report.

You MUST respond with valid JSON and NOTHING else. No markdown, no explanation, only the JSON object.

JSON format:
{
  "title": "Clear bug title describing the issue",
  "severity": "Critical|Major|Minor|Trivial",
  "priority": "P1-Urgent|P2-High|P3-Medium|P4-Low",
  "environment": "Detected from screenshot (browser, OS, resolution, URL if visible, etc)",
  "steps_to_reproduce": ["Step 1", "Step 2", "Step 3"],
  "expected_result": "What should happen",
  "actual_result": "What actually happened (describe what you see in the screenshot combined with the user's description)",
  "additional_notes": "Any extra observations from the screenshot and description analysis"
}`;

        // build image blocks for each screenshot
        const imageBlocks = uploadedBase64s.map(url => ({ type: 'image_url', image_url: { url } }));
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [
                    { role: 'system', content: systemPrompt },
                    {
                        role: 'user',
                        content: [
                            ...imageBlocks,
                            { type: 'text', text: `Here is my brief description of the bug:\n\n"${userDescription}"\n\nAnalyze the screenshot(s) along with this description and generate the structured bug report JSON.` }
                        ]
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData?.error?.message || `Groq API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('No response from AI model');

        // Parse JSON (handle potential markdown wrapping)
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const report = JSON.parse(jsonStr);
        populateBugReport(report);
        showToast('Bug report generated! Review it below.', 'success');
        goToStep(3);

    } catch (err) {
        console.error('AI Analysis Error:', err);
        showToast(`Analysis failed: ${err.message}`, 'error');
    } finally {
        isAnalyzing = false;
        btnText.textContent = 'Analyze with AI';
        btnLoader.classList.add('hidden');
        btnAnalyze.disabled = false;
        uploadSection.classList.remove('analyzing');
    }
}

// ===================================================================
// STEP 3: REVIEW BUG REPORT
// ===================================================================
function initStep3() {
    $('#btn-add-step').addEventListener('click', () => addStepRow());
    $('#btn-copy-report').addEventListener('click', () => copyReport());
    $('#btn-create-bug').addEventListener('click', () => pushToJira());
    $('#btn-back-to-2').addEventListener('click', () => goToStep(2));

    // Delegate step removal
    $('#steps-container').addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.btn-remove-step');
        if (removeBtn) {
            const row = removeBtn.closest('.step-row');
            if ($('#steps-container').children.length > 1) {
                row.remove();
                renumberSteps();
            } else {
                showToast('At least one step is required.', 'info');
            }
        }
    });
}

function populateBugReport(report) {
    $('#bug-title').value = report.title || '';
    $('#bug-severity').value = report.severity || 'Minor';
    $('#bug-priority').value = report.priority || 'P3-Medium';
    $('#bug-environment').value = report.environment || '';
    $('#bug-expected').value = report.expected_result || '';
    $('#bug-actual').value = report.actual_result || '';
    $('#bug-notes').value = report.additional_notes || '';

    const stepsContainer = $('#steps-container');
    stepsContainer.innerHTML = '';
    const steps = report.steps_to_reproduce || [''];
    steps.forEach((step) => addStepRow(step));
}

function addStepRow(value = '') {
    const container = $('#steps-container');
    const stepNum = container.children.length + 1;
    const row = document.createElement('div');
    row.className = 'step-row';
    row.innerHTML = `
    <span class="step-number">${stepNum}.</span>
    <input type="text" class="step-input" placeholder="Step ${stepNum}..." value="${escapeHtml(value)}" />
    <button type="button" class="btn-remove-step" title="Remove step">×</button>
  `;
    container.appendChild(row);
}

function renumberSteps() {
    $$('#steps-container .step-row').forEach((row, i) => {
        row.querySelector('.step-number').textContent = `${i + 1}.`;
        row.querySelector('.step-input').placeholder = `Step ${i + 1}...`;
    });
}

function getReportData() {
    const steps = [];
    $$('#steps-container .step-input').forEach((input) => {
        if (input.value.trim()) steps.push(input.value.trim());
    });
    return {
        title: $('#bug-title').value.trim(),
        severity: $('#bug-severity').value,
        priority: $('#bug-priority').value,
        environment: $('#bug-environment').value.trim(),
        steps_to_reproduce: steps,
        expected_result: $('#bug-expected').value.trim(),
        actual_result: $('#bug-actual').value.trim(),
        additional_notes: $('#bug-notes').value.trim()
    };
}

function formatReportText(report) {
    let text = `## Bug Report\n\n`;
    text += `**Title:** ${report.title}\n`;
    text += `**Severity:** ${report.severity}\n`;
    text += `**Priority:** ${report.priority}\n`;
    text += `**Environment:** ${report.environment}\n\n`;
    text += `### Steps to Reproduce\n`;
    report.steps_to_reproduce.forEach((s, i) => text += `${i + 1}. ${s}\n`);
    text += `\n**Expected Result:** ${report.expected_result}\n`;
    text += `**Actual Result:** ${report.actual_result}\n`;
    if (report.additional_notes) text += `\n**Additional Notes:** ${report.additional_notes}\n`;
    return text;
}

async function copyReport() {
    const report = getReportData();
    if (!report.title) { showToast('No report to copy.', 'warning'); return; }
    try {
        await navigator.clipboard.writeText(formatReportText(report));
        showToast('Report copied to clipboard!', 'success');
    } catch {
        showToast('Failed to copy.', 'error');
    }
}

// ===================================================================
// STEP 4: PUSH TO JIRA
// ===================================================================
async function pushToJira() {
    const jiraBaseUrl = localStorage.getItem('buglens_jira_url');
    const email = localStorage.getItem('buglens_jira_email');
    const token = localStorage.getItem('buglens_jira_token');
    const projectKey = localStorage.getItem('buglens_jira_project');
    const issueType = localStorage.getItem('buglens_jira_issuetype') || 'Bug';
    const targetStatus = localStorage.getItem('buglens_jira_status') || 'To Do';
    const linkedWorkItem = $('#linked-work-item').value.trim();

    if (!jiraBaseUrl || !email || !token || !projectKey) {
        showToast('Jira not configured. Go back to Step 1.', 'error');
        return;
    }

    const report = getReportData();
    if (!report.title) { showToast('No report to push.', 'warning'); return; }

    if (isPushingJira) return;
    isPushingJira = true;

    const btn = $('#btn-create-bug');
    const btnText = btn.querySelector('span');
    const btnLoader = btn.querySelector('.btn-loader');
    btnText.textContent = 'Creating...';
    btnLoader.classList.remove('hidden');
    btn.disabled = true;

    try {
        // Normalize base URL
        const baseUrl = jiraBaseUrl.replace(/\/+$/, '');
        const auth = btoa(`${email}:${token}`);

        // Build ADF description
        const description = buildJiraDescription(report, linkedWorkItem);

        // ---- 1. Create issue ----
        const createRes = await jiraProxy(
            `${baseUrl}/rest/api/3/issue`,
            'POST',
            {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            },
            {
                fields: {
                    project: { key: projectKey },
                    summary: report.title,
                    description: description,
                    issuetype: { name: issueType },
                    priority: { name: mapPriorityToJira(report.priority) }
                }
            }
        );

        if (!createRes.ok) {
            const errData = await createRes.json().catch(() => ({}));
            const errMsg = errData?.errors
                ? Object.values(errData.errors).join(', ')
                : errData?.errorMessages?.join(', ') || `HTTP ${createRes.status}`;
            throw new Error(errMsg);
        }

        const issueData = await createRes.json();
        const issueKey = issueData.key;

        // ---- 2. Transition to selected status ----
        try {
            await transitionIssue(baseUrl, auth, issueKey, targetStatus);
        } catch (e) {
            console.warn('Status transition failed:', e.message);
        }

        // ---- 3. Link to work item ----
        if (linkedWorkItem) {
            try {
                const linkedKey = extractIssueKey(linkedWorkItem);
                if (linkedKey) {
                    await linkIssues(baseUrl, auth, issueKey, linkedKey);
                }
            } catch (e) {
                console.warn('Issue linking failed:', e.message);
            }
        }

        // ---- 4. Attach screenshots ----
        if (uploadedFiles.length) {
            try {
                const formData = new FormData();
                uploadedFiles.forEach((f) => {
                    formData.append('file', f, f.name);
                });

                await fetch('/api/jira-upload', {
                    method: 'POST',
                    headers: {
                        'X-Target-URL': `${baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
                        'X-Jira-Auth': `Basic ${auth}`
                    },
                    body: formData
                });
            } catch (e) {
                console.warn('Attachment failed:', e);
            }
        }

        // Show success
        const ticketUrl = `${baseUrl}/browse/${issueKey}`;
        $('#jira-ticket-link').textContent = issueKey;
        $('#jira-ticket-link').href = ticketUrl;
        $('#btn-open-ticket').href = ticketUrl;

        showToast(`Bug ${issueKey} created successfully!`, 'success');
        goToStep(4);

    } catch (err) {
        console.error('Jira Error:', err);
        showToast(`Failed: ${err.message}`, 'error');
    } finally {
        isPushingJira = false;
        btnText.textContent = 'Create Bug in Jira';
        btnLoader.classList.add('hidden');
        btn.disabled = false;
    }
}

// ---- TRANSITION ISSUE TO TARGET STATUS ----
async function transitionIssue(baseUrl, auth, issueKey, targetStatus) {
    // Get available transitions
    const transRes = await jiraProxy(
        `${baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
        'GET',
        { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
    );

    if (!transRes.ok) return;

    const transData = await transRes.json();
    const transitions = transData.transitions || [];

    // Find the transition whose target matches the desired status (case-insensitive)
    const match = transitions.find(t =>
        t.to?.name?.toLowerCase() === targetStatus.toLowerCase()
    );

    if (!match) {
        console.warn(`No transition found to status "${targetStatus}". Available:`,
            transitions.map(t => t.to?.name));
        return;
    }

    // Execute the transition
    await jiraProxy(
        `${baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
        'POST',
        { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        { transition: { id: match.id } }
    );
}

// ---- LINK TWO ISSUES ----
async function linkIssues(baseUrl, auth, fromKey, toKey) {
    await jiraProxy(
        `${baseUrl}/rest/api/3/issueLink`,
        'POST',
        { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        {
            type: { name: 'Relates' },
            inwardIssue: { key: fromKey },
            outwardIssue: { key: toKey }
        }
    );
}

// ---- EXTRACT ISSUE KEY FROM URL OR PLAIN KEY ----
function extractIssueKey(input) {
    if (!input) return null;
    input = input.trim();
    // If it looks like a plain key: PROJ-123
    const keyMatch = input.match(/^([A-Z][A-Z0-9]+-\d+)$/i);
    if (keyMatch) return keyMatch[1].toUpperCase();
    // Extract from URL: .../browse/PROJ-123 or .../PROJ-123
    const urlMatch = input.match(/([A-Z][A-Z0-9]+-\d+)/i);
    if (urlMatch) return urlMatch[1].toUpperCase();
    return null;
}

function buildJiraDescription(report, linkedUrl) {
    const nodes = [];

    nodes.push({
        type: 'paragraph',
        content: [
            { type: 'text', text: 'Severity: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: report.severity },
            { type: 'text', text: '  |  ' },
            { type: 'text', text: 'Priority: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: report.priority }
        ]
    });

    if (report.environment) {
        nodes.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Environment: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: report.environment }
            ]
        });
    }

    nodes.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Steps to Reproduce' }]
    });

    if (report.steps_to_reproduce.length > 0) {
        nodes.push({
            type: 'orderedList',
            content: report.steps_to_reproduce.map(step => ({
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: step }] }]
            }))
        });
    }

    nodes.push({
        type: 'paragraph',
        content: [
            { type: 'text', text: 'Expected Result: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: report.expected_result }
        ]
    });

    nodes.push({
        type: 'paragraph',
        content: [
            { type: 'text', text: 'Actual Result: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: report.actual_result }
        ]
    });

    if (report.additional_notes) {
        nodes.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Additional Notes: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: report.additional_notes }
            ]
        });
    }

    if (linkedUrl) {
        nodes.push({
            type: 'paragraph',
            content: [
                { type: 'text', text: 'Linked Work Item: ', marks: [{ type: 'strong' }] },
                {
                    type: 'text',
                    text: linkedUrl,
                    marks: [{ type: 'link', attrs: { href: linkedUrl } }]
                }
            ]
        });
    }

    return { version: 1, type: 'doc', content: nodes };
}

function mapPriorityToJira(priority) {
    return { 'P1-Urgent': 'Highest', 'P2-High': 'High', 'P3-Medium': 'Medium', 'P4-Low': 'Low' }[priority] || 'Medium';
}

// ===================================================================
// STEP 4: REPORT ANOTHER BUG
// ===================================================================
function initStep4() {
    $('#btn-new-bug').addEventListener('click', () => {
        resetUpload();
        $('#issue-description').value = '';
        $('#report-form').querySelectorAll('input, textarea').forEach(el => el.value = '');
        $('#steps-container').innerHTML = '';
        addStepRow();
        goToStep(2);
    });
}

// ===================================================================
// TOAST NOTIFICATIONS
// ===================================================================
function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const icons = {
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
