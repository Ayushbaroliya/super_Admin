// Initialize Lucide Icons
lucide.createIcons();

// --- State ---
let config = {
    token: localStorage.getItem('gh_token') || '',
    owner: localStorage.getItem('gh_owner') || '',
    repo: localStorage.getItem('gh_repo') || '',
    path: localStorage.getItem('gh_path') || 'status.json'
};

let currentFileSha = null;
let projectsData = null;

// --- DOM Elements ---
const modal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const emptySettingsBtn = document.getElementById('emptySettingsBtn');
const refreshBtn = document.getElementById('refreshBtn');
const refreshIcon = document.getElementById('refreshIcon');
const searchInput = document.getElementById('searchInput');

const projectsGrid = document.getElementById('projectsGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');

// Add Project Elements
const addProjectModal = document.getElementById('addProjectModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeAddProjectBtn = document.getElementById('closeAddProjectBtn');
const confirmAddProjectBtn = document.getElementById('confirmAddProjectBtn');
const newProjectNameInput = document.getElementById('newProjectName');

// Config Inputs
const ghTokenInput = document.getElementById('ghToken');
const ghOwnerInput = document.getElementById('ghOwner');
const ghRepoInput = document.getElementById('ghRepo');
const ghPathInput = document.getElementById('ghPath');

// --- Event Listeners ---
settingsBtn.addEventListener('click', openSettings);
emptySettingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
saveSettingsBtn.addEventListener('click', saveSettings);
refreshBtn.addEventListener('click', fetchProjects);
searchInput.addEventListener('input', renderProjects);

if (addProjectBtn) addProjectBtn.addEventListener('click', openAddProject);
if (closeAddProjectBtn) closeAddProjectBtn.addEventListener('click', closeAddProject);
if (confirmAddProjectBtn) confirmAddProjectBtn.addEventListener('click', addNewProject);

// Close modal on outside click
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSettings();
});
if (addProjectModal) {
    addProjectModal.addEventListener('click', (e) => {
        if (e.target === addProjectModal) closeAddProject();
    });
}

// --- Modal Functions ---
function openSettings() {
    ghTokenInput.value = config.token;
    ghOwnerInput.value = config.owner;
    ghRepoInput.value = config.repo;
    ghPathInput.value = config.path;
    modal.classList.remove('hidden');
}

function closeSettings() {
    modal.classList.add('hidden');
}

function saveSettings() {
    const token = ghTokenInput.value.trim();
    const owner = ghOwnerInput.value.trim();
    const repo = ghRepoInput.value.trim();
    const path = ghPathInput.value.trim();

    if (!token || !owner || !repo || !path) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    config = { token, owner, repo, path };
    
    localStorage.setItem('gh_token', token);
    localStorage.setItem('gh_owner', owner);
    localStorage.setItem('gh_repo', repo);
    localStorage.setItem('gh_path', path);

    closeSettings();
    showToast('Settings saved successfully', 'success');
    fetchProjects();
}

function openAddProject() {
    newProjectNameInput.value = '';
    addProjectModal.classList.remove('hidden');
}

function closeAddProject() {
    addProjectModal.classList.add('hidden');
}

async function addNewProject() {
    if (!projectsData || !currentFileSha) {
        showToast('Please wait for projects to load first.', 'error');
        return;
    }

    const newName = newProjectNameInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    if (!newName) {
        showToast('Invalid project name. Use lowercase and underscores.', 'error');
        return;
    }
    if (projectsData[newName]) {
        showToast('Project already exists.', 'error');
        return;
    }

    // Add to local state
    projectsData[newName] = { isActive: true };
    closeAddProject();
    
    // Show saving toast
    showToast(`Adding ${formatName(newName)}...`, 'info');

    try {
        const updatedJsonString = JSON.stringify(projectsData, null, 2);
        const encodedContent = btoa(unescape(encodeURIComponent(updatedJsonString)));

        const response = await fetch(getApiUrl(), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Add new project ${newName}`,
                content: encodedContent,
                sha: currentFileSha
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`GitHub Error: ${errData.message || 'Failed to update'}`);
        }

        const data = await response.json();
        currentFileSha = data.content.sha;
        
        showToast(`Project added successfully!`, 'success');
        renderProjects();
        
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Failed to add project.', 'error');
        delete projectsData[newName]; // Revert
        renderProjects();
    }
}

// --- GitHub API Integration ---

function hasValidConfig() {
    return config.token && config.owner && config.repo && config.path;
}

function getApiUrl() {
    return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
}

async function fetchProjects() {
    if (!hasValidConfig()) {
        showEmptyState();
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(getApiUrl(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            throw new Error(`File not found: ${config.path}`);
        }
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to fetch repository');
        }

        const data = await response.json();
        currentFileSha = data.sha;
        
        // Decode base64 content
        // using decodeURIComponent/escape handles UTF-8 chars safely
        const jsonString = decodeURIComponent(escape(atob(data.content)));
        projectsData = JSON.parse(jsonString);

        renderProjects();
        showToast('Projects synced successfully', 'success');
        
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
        showEmptyState();
    } finally {
        setLoading(false);
    }
}

async function updateProjectStatus(projectId, newStatus) {
    if (!projectsData || !currentFileSha) return;

    // Optimistic UI update
    projectsData[projectId].isActive = newStatus;
    
    const toggleInput = document.getElementById(`toggle-${projectId}`);
    if (toggleInput) toggleInput.disabled = true;

    try {
        const updatedJsonString = JSON.stringify(projectsData, null, 2);
        const encodedContent = btoa(unescape(encodeURIComponent(updatedJsonString)));

        const response = await fetch(getApiUrl(), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Update ${projectId} status to ${newStatus ? 'active' : 'inactive'}`,
                content: encodedContent,
                sha: currentFileSha
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`GitHub Error: ${errData.message || 'Failed to update'}`);
        }

        const data = await response.json();
        currentFileSha = data.content.sha; // Update SHA for next edit
        
        showToast(`${projectId} updated successfully`, 'success');
        renderProjects(); // Re-render to update badges
        
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Failed to save changes. Please refresh.', 'error');
        // Revert optimistic update
        projectsData[projectId].isActive = !newStatus;
        if (toggleInput) {
            toggleInput.checked = !newStatus;
            toggleInput.disabled = false;
        }
        renderProjects();
    }
}

async function deleteProject(projectId) {
    if (!projectsData || !currentFileSha) return;
    
    if (!confirm(`Are you sure you want to delete ${formatName(projectId)}?`)) {
        return;
    }
    
    // Save backup just in case
    const backupData = { ...projectsData };
    
    delete projectsData[projectId];
    
    showToast(`Deleting ${formatName(projectId)}...`, 'info');
    renderProjects(); // Optimistic update
    lucide.createIcons();
    
    try {
        const updatedJsonString = JSON.stringify(projectsData, null, 2);
        const encodedContent = btoa(unescape(encodeURIComponent(updatedJsonString)));

        const response = await fetch(getApiUrl(), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Delete project ${projectId}`,
                content: encodedContent,
                sha: currentFileSha
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`GitHub Error: ${errData.message || 'Failed to delete'}`);
        }

        const data = await response.json();
        currentFileSha = data.content.sha;
        showToast('Project deleted successfully', 'success');
        
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Failed to delete. Please refresh.', 'error');
        // Revert
        projectsData = backupData;
        renderProjects();
        lucide.createIcons();
    }
}

// --- UI Rendering ---

function renderProjects() {
    if (!projectsData || Object.keys(projectsData).length === 0) {
        showEmptyState();
        return;
    }

    emptyState.classList.add('hidden');
    loadingState.classList.add('hidden');
    projectsGrid.innerHTML = '';

    const searchTerm = searchInput.value.toLowerCase();
    let hasMatches = false;

    Object.entries(projectsData).forEach(([key, project]) => {
        // Filter by search
        if (key.toLowerCase().includes(searchTerm)) {
            hasMatches = true;
            const card = document.createElement('div');
            card.className = 'project-card glass-panel';
            
            const isActive = project.isActive;
            
            card.innerHTML = `
                <div class="card-header">
                    <div class="project-info">
                        <h3>${formatName(key)}</h3>
                        <span class="project-key">${key}</span>
                    </div>
                    <div class="status-badge ${isActive ? 'active' : 'inactive'}">
                        <div class="status-dot"></div>
                        ${isActive ? 'Active' : 'Locked'}
                    </div>
                </div>
                
                <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                    <button class="icon-button" id="delete-${key}" style="color: var(--danger); opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'" title="Delete Project">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 0.9rem; color: var(--text-secondary)">App Access</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-${key}" ${isActive ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `;

            projectsGrid.appendChild(card);

            // Add listener for toggle
            const toggle = card.querySelector(`#toggle-${key}`);
            toggle.addEventListener('change', (e) => {
                updateProjectStatus(key, e.target.checked);
            });
            
            // Add listener for delete
            const deleteBtn = card.querySelector(`#delete-${key}`);
            deleteBtn.addEventListener('click', () => {
                deleteProject(key);
            });
        }
    });

    if (!hasMatches) {
        projectsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-secondary)">
                No projects found matching "${searchTerm}"
            </div>
        `;
    }
}

function formatName(key) {
    // Converts "jp_software" to "Jp Software"
    return key
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function setLoading(isLoading) {
    if (isLoading) {
        refreshIcon.classList.add('spin');
        projectsGrid.innerHTML = '';
        loadingState.classList.remove('hidden');
        emptyState.classList.add('hidden');
    } else {
        refreshIcon.classList.remove('spin');
        loadingState.classList.add('hidden');
    }
}

function showEmptyState() {
    loadingState.classList.add('hidden');
    projectsGrid.innerHTML = '';
    emptyState.classList.remove('hidden');
}

// --- Toast System ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons({ root: toast });

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// --- Initialization ---
if (hasValidConfig()) {
    fetchProjects();
} else {
    showEmptyState();
    // Auto open settings on first load if no config
    setTimeout(openSettings, 500);
}
