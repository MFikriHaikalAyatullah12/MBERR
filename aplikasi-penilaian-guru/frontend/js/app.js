// Global variables
let currentUser = null;
let token = localStorage.getItem('token');
let students = [];
let subjects = [];
let tasks = [];
let grades = [];
let currentGradeTab = 'task';

// Session management with minimal localStorage usage
const SESSION_KEY = 'app_session';
const SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours

// Memory cache for application data
const appCache = {
    students: { data: null, timestamp: null },
    subjects: { data: null, timestamp: null },
    tasks: { data: null, timestamp: null },
    dashboard: { data: null, timestamp: null }
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// API Base URL
const API_BASE = '/api';

// Cache management functions
function getCachedData(key) {
    const cached = appCache[key];
    if (cached && cached.timestamp && 
        (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
    }
    return null;
}

function setCachedData(key, data) {
    appCache[key] = {
        data: data,
        timestamp: Date.now()
    };
}

function clearCache() {
    Object.keys(appCache).forEach(key => {
        appCache[key] = { data: null, timestamp: null };
    });
}

// Session management
function saveSession(userData, authToken) {
    const sessionData = {
        user: userData,
        token: authToken,
        timestamp: Date.now()
    };
    
    // Store only minimal data in localStorage
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: authToken,
        timestamp: Date.now(),
        userId: userData.id
    }));
    
    // Keep full user data in memory
    currentUser = userData;
    token = authToken;
}

function getStoredSession() {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return null;
        
        const session = JSON.parse(stored);
        const now = Date.now();
        
        // Check if session expired
        if (now - session.timestamp > SESSION_TIMEOUT) {
            clearSession();
            return null;
        }
        
        return session;
    } catch (error) {
        console.error('Error reading session:', error);
        clearSession();
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('token'); // Remove old token format
    localStorage.removeItem('app_session'); // Remove old session format
    
    currentUser = null;
    token = null;
    clearCache();
}

// Token validation
async function validateToken() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showDashboardPage();
        } else {
            // Token expired or invalid
            clearSession();
            showLoginPage();
        }
    } catch (error) {
        console.error('Token validation error:', error);
        logout();
    }
}

// Password validation functions
function validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    // Removed special character requirement
    
    const requirements = {
        length: password.length >= minLength,
        upperCase: hasUpperCase,
        lowerCase: hasLowerCase,
        numbers: hasNumbers
    };
    
    const isValid = Object.values(requirements).every(req => req);
    
    return {
        isValid,
        requirements,
        score: Object.values(requirements).filter(req => req).length
    };
}

function showPasswordStrength(password, elementId) {
    const validation = validatePassword(password);
    const strengthElement = document.getElementById(elementId);
    
    if (!strengthElement) return;
    
    const strengthTexts = {
        0: { text: 'Sangat Lemah', class: 'very-weak' },
        1: { text: 'Lemah', class: 'weak' },
        2: { text: 'Sedang', class: 'fair' },
        3: { text: 'Baik', class: 'good' },
        4: { text: 'Kuat', class: 'strong' }
    };
    
    const strength = strengthTexts[validation.score];
    
    strengthElement.innerHTML = `
        <div class="password-strength ${strength.class}">
            <div class="strength-bar">
                <div class="strength-fill" style="width: ${(validation.score / 4) * 100}%"></div>
            </div>
            <span class="strength-text">${strength.text}</span>
        </div>
        <div class="password-requirements">
            <div class="req ${validation.requirements.length ? 'met' : ''}">
                <i class="fas ${validation.requirements.length ? 'fa-check' : 'fa-times'}"></i>
                Minimal 8 karakter
            </div>
            <div class="req ${validation.requirements.upperCase ? 'met' : ''}">
                <i class="fas ${validation.requirements.upperCase ? 'fa-check' : 'fa-times'}"></i>
                Huruf besar (A-Z)
            </div>
            <div class="req ${validation.requirements.lowerCase ? 'met' : ''}">
                <i class="fas ${validation.requirements.lowerCase ? 'fa-check' : 'fa-times'}"></i>
                Huruf kecil (a-z)
            </div>
            <div class="req ${validation.requirements.numbers ? 'met' : ''}">
                <i class="fas ${validation.requirements.numbers ? 'fa-check' : 'fa-times'}"></i>
                Angka (0-9)
            </div>
        </div>
    `;
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Check if user has valid session
    const session = getStoredSession();
    if (session && session.token) {
        token = session.token;
        validateToken();
    } else {
        showLoginPage();
    }
    
    // Load available classes for registration
    loadAvailableClasses();
    
    // Add event listener for task grade subject dropdown
    setTimeout(() => {
        const taskGradeSubject = document.getElementById('taskGradeSubject');
        if (taskGradeSubject) {
            taskGradeSubject.addEventListener('change', loadTasksForSubject);
        }
    }, 1000);
    
    // Set up periodic session validation
    setInterval(() => {
        if (token && currentUser) {
            validateToken();
        }
    }, 30 * 60 * 1000); // Check every 30 minutes
});

// Authentication Functions
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showNotification('Username dan password harus diisi', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Clear password fields immediately for security
            document.getElementById('loginPassword').value = '';
            
            // Save session securely
            saveSession(data.user, data.token);
            currentUser = data.user;
            
            showNotification('Login berhasil!', 'success');
            setTimeout(() => {
                showDashboardPage();
            }, 1000);
        } else {
            showNotification(data.error || 'Login gagal', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Login error:', error);
    } finally {
        hideLoading();
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const class_id = document.getElementById('registerClass').value;
    
    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
        showNotification('Password tidak memenuhi syarat keamanan. Pastikan password minimal 8 karakter dengan kombinasi huruf besar, huruf kecil, angka, dan karakter khusus.', 'error');
        return;
    }
    
    if (!name || !username || !password || !class_id) {
        showNotification('Semua field harus diisi', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, username, password, class_id: parseInt(class_id) })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Clear password field immediately for security
            document.getElementById('registerPassword').value = '';
            document.getElementById('passwordStrength').innerHTML = '';
            
            showNotification('Registrasi berhasil! Silakan login dengan akun Anda.', 'success');
            setTimeout(() => {
                showLoginForm();
                // Clear other form fields
                document.getElementById('registerName').value = '';
                document.getElementById('registerUsername').value = '';
                document.getElementById('registerClass').value = '';
            }, 1500);
        } else {
            showNotification(data.error || 'Registrasi gagal', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Register error:', error);
    } finally {
        hideLoading();
    }
}

async function validateToken() {
    try {
        const response = await fetch(`${API_BASE}/classes/my-class`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // If we don't have currentUser data, fetch it
            if (!currentUser) {
                const userResponse = await fetch(`${API_BASE}/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    currentUser = userData.user;
                }
            }
            
            showDashboardPage();
        } else {
            logout();
        }
    } catch (error) {
        console.error('Token validation error:', error);
        logout();
    }
}

function logout() {
    // Clear session data
    clearSession();
    
    // Clear application cache
    clearCache();
    
    showLoginPage();
    showNotification('Anda telah keluar', 'success');
}

// Page Management
function showLoginPage() {
    document.getElementById('loginPage').classList.add('active');
    document.getElementById('dashboardPage').classList.remove('active');
}

function showDashboardPage() {
    document.getElementById('loginPage').classList.remove('active');
    document.getElementById('dashboardPage').classList.add('active');
    
    // Update user info
    document.getElementById('userName').textContent = currentUser.name;
    
    // Load dashboard data
    loadDashboardData();
    showDashboard();
}

function showLoginForm() {
    document.querySelector('.tab-btn').classList.add('active');
    document.querySelectorAll('.tab-btn')[1].classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');
}

function showRegisterForm() {
    document.querySelector('.tab-btn').classList.remove('active');
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('registerForm').classList.add('active');
}

// Navigation Functions
function showDashboard() {
    setActiveMenu('dashboard');
    setActiveContent('dashboardContent');
    loadDashboardData();
}

function showStudents() {
    setActiveMenu('students');
    setActiveContent('studentsContent');
    loadStudents();
}

function showSubjects() {
    setActiveMenu('subjects');
    setActiveContent('subjectsContent');
    loadSubjects();
}

function showTasks() {
    setActiveMenu('tasks');
    setActiveContent('tasksContent');
    loadTasks();
    loadTasksFormData();
}

function showGrades() {
    setActiveMenu('grades');
    setActiveContent('gradesContent');
    loadGrades();
    loadGradeFormData();
    loadTasksBySubject(); // Load tasks grouped by subject
}

function showReports() {
    setActiveMenu('reports');
    setActiveContent('reportsContent');
}

function setActiveMenu(section) {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    const menus = {
        'dashboard': 0,
        'students': 1,
        'subjects': 2,
        'tasks': 3,
        'grades': 4,
        'reports': 5
    };
    
    document.querySelectorAll('.menu-item')[menus[section]].classList.add('active');
}

function setActiveContent(contentId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(contentId).classList.add('active');
}

// Data Loading Functions
async function loadAvailableClasses() {
    try {
        const response = await fetch(`${API_BASE}/auth/classes`);
        const classes = await response.json();
        
        const select = document.getElementById('registerClass');
        select.innerHTML = '<option value="">Pilih Kelas</option>';
        
        // Show all classes regardless of assignment status
        classes.forEach(cls => {
            const option = document.createElement('option');
            option.value = cls.id;
            option.textContent = cls.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading classes:', error);
    }
}

async function loadDashboardData() {
    try {
        // Check cache first
        const cachedData = getCachedData('dashboard');
        if (cachedData) {
            updateDashboardUI(cachedData);
            return;
        }
        
        // Load class info
        const classResponse = await fetch(`${API_BASE}/classes/my-class`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const classData = await classResponse.json();
        
        // Load stats
        const statsResponse = await fetch(`${API_BASE}/classes/my-class/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const statsData = await statsResponse.json();
        
        // Load tasks count
        const tasksResponse = await fetch(`${API_BASE}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tasksData = await tasksResponse.json();
        
        // Load subjects count
        const subjectsResponse = await fetch(`${API_BASE}/grades/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const subjectsData = await subjectsResponse.json();
        
        const dashboardData = {
            className: classData.name,
            totalStudents: statsData.student_count,
            totalTasks: tasksData.length,
            totalSubjects: subjectsData.length
        };
        
        // Cache the data
        setCachedData('dashboard', dashboardData);
        updateDashboardUI(dashboardData);
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showNotification('Gagal memuat data dashboard', 'error');
    }
}

function updateDashboardUI(data) {
    document.getElementById('className').textContent = data.className;
    document.getElementById('totalStudents').textContent = data.totalStudents;
    document.getElementById('totalTasks').textContent = data.totalTasks;
    document.getElementById('totalSubjects').textContent = data.totalSubjects;
}

async function loadStudents() {
    try {
        // Check cache first
        const cachedStudents = getCachedData('students');
        if (cachedStudents) {
            students = cachedStudents;
            renderStudentsTable();
            return;
        }
        
        const response = await fetch(`${API_BASE}/students`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        students = await response.json();
        
        // Cache the data
        setCachedData('students', students);
        
        renderStudentsTable();
    } catch (error) {
        console.error('Error loading students:', error);
        showNotification('Gagal memuat data siswa', 'error');
    }
}

async function loadSubjects() {
    try {
        const response = await fetch(`${API_BASE}/grades/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        subjects = await response.json();
        renderSubjectsTable();
    } catch (error) {
        console.error('Error loading subjects:', error);
        showNotification('Gagal memuat data mata pelajaran', 'error');
    }
}

async function loadTasks() {
    try {
        const subject_id = document.getElementById('taskSubjectFilter').value;
        let url = `${API_BASE}/tasks`;
        if (subject_id) {
            url += `?subject_id=${subject_id}`;
        }
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        tasks = await response.json();
        renderTasksTable();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Gagal memuat data tugas', 'error');
    }
}

async function loadTasksFormData() {
    try {
        // Load subjects for task filter and form
        if (!subjects.length) {
            await loadSubjects();
        }
        
        const taskSubjectFilter = document.getElementById('taskSubjectFilter');
        taskSubjectFilter.innerHTML = '<option value="">Semua Mata Pelajaran</option>';
        
        const taskSubject = document.getElementById('taskSubject');
        taskSubject.innerHTML = '<option value="">Pilih Mata Pelajaran</option>';
        
        subjects.forEach(subject => {
            const filterOption = document.createElement('option');
            filterOption.value = subject.id;
            filterOption.textContent = subject.name;
            taskSubjectFilter.appendChild(filterOption);
            
            const formOption = document.createElement('option');
            formOption.value = subject.id;
            formOption.textContent = subject.name;
            taskSubject.appendChild(formOption);
        });
        
    } catch (error) {
        console.error('Error loading tasks form data:', error);
    }
}

async function loadGrades() {
    try {
        const gradeType = document.getElementById('gradeTypeFilter').value;
        const subject = document.getElementById('subjectFilter').value;
        const semester = document.getElementById('semesterFilter').value;
        const academicYear = document.getElementById('academicYearFilter').value;
        
        let url = `${API_BASE}/grades?`;
        if (gradeType) url += `grade_type=${gradeType}&`;
        if (subject) url += `subject_id=${subject}&`;
        if (semester) url += `semester=${semester}&`;
        if (academicYear) url += `academic_year=${academicYear}&`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        grades = await response.json();
        renderGradesTable();
    } catch (error) {
        console.error('Error loading grades:', error);
        showNotification('Gagal memuat data nilai', 'error');
    }
}

async function loadTasksBySubject() {
    try {
        const response = await fetch(`${API_BASE}/grades/tasks-by-subject`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const subjectsTasks = await response.json();
        renderTasksBySubject(subjectsTasks);
    } catch (error) {
        console.error('Error loading tasks by subject:', error);
        showNotification('Gagal memuat tugas per mata pelajaran', 'error');
    }
}

function renderTasksBySubject(subjectsTasks) {
    const container = document.getElementById('tasksBySubjectContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (subjectsTasks.length === 0) {
        container.innerHTML = '<p class="text-center">Belum ada mata pelajaran atau tugas</p>';
        return;
    }
    
    subjectsTasks.forEach(subject => {
        const subjectCard = document.createElement('div');
        subjectCard.className = 'subject-card';
        
        let tasksHtml = '';
        if (subject.tasks.length === 0) {
            tasksHtml = '<p class="no-tasks">Belum ada tugas untuk mata pelajaran ini</p>';
        } else {
            tasksHtml = subject.tasks.map(task => `
                <div class="task-item">
                    <div class="task-info">
                        <h5>${task.name}</h5>
                        ${task.description ? `<p class="task-desc">${task.description}</p>` : ''}
                        ${task.due_date ? `<p class="task-due">Deadline: ${new Date(task.due_date).toLocaleDateString('id-ID')}</p>` : ''}
                    </div>
                    <div class="task-actions">
                        <button onclick="startGradingTask(${task.id}, '${task.name}', ${subject.subject_id})" class="btn btn-primary">
                            <i class="fas fa-edit"></i> Beri Nilai
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        subjectCard.innerHTML = `
            <div class="subject-header">
                <h4><i class="fas fa-book"></i> ${subject.subject_name}</h4>
                <span class="task-count">${subject.tasks.length} tugas</span>
            </div>
            <div class="tasks-list">
                ${tasksHtml}
            </div>
        `;
        
        container.appendChild(subjectCard);
    });
}

function startGradingTask(taskId, taskName, subjectId) {
    // Set form values for task grading
    document.getElementById('taskGradeSubject').value = subjectId;
    document.getElementById('taskGradeTask').innerHTML = `<option value="${taskId}">${taskName}</option>`;
    document.getElementById('taskGradeTask').value = taskId;
    
    // Switch to task grading tab
    showGradeTab('task');
    
    // Scroll to form
    document.getElementById('taskGradeForm').scrollIntoView({ behavior: 'smooth' });
    
    showNotification(`Siap memberi nilai untuk tugas: ${taskName}`, 'info');
}

async function loadGradeFormData() {
    try {
        // Load students for grade form
        if (!students.length) {
            await loadStudents();
        }
        
        // Load subjects
        if (!subjects.length) {
            await loadSubjects();
        }
        
        // Populate student selects
        const studentSelects = [
            'taskGradeStudent', 'finalGradeStudent'
        ];
        
        studentSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Pilih Siswa</option>';
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.id;
                option.textContent = student.name;
                select.appendChild(option);
            });
        });
        
        // Populate subject selects
        const subjectSelects = [
            'taskGradeSubject', 'finalGradeSubject', 'subjectFilter'
        ];
        
        subjectSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            const isFilter = selectId === 'subjectFilter';
            select.innerHTML = isFilter ? '<option value="">Semua Mata Pelajaran</option>' : '<option value="">Pilih Mata Pelajaran</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                select.appendChild(option);
            });
        });
        
    } catch (error) {
        console.error('Error loading grade form data:', error);
    }
}

// Render Functions
function renderStudentsTable() {
    const tbody = document.getElementById('studentsTableBody');
    tbody.innerHTML = '';
    
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada data siswa</td></tr>';
        return;
    }
    
    students.forEach((student, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${student.name}</td>
            <td>${student.nis || '-'}</td>
            <td>
                <button onclick="editStudent(${student.id})" class="action-btn btn-edit">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button onclick="deleteStudent(${student.id})" class="action-btn btn-delete">
                    <i class="fas fa-trash"></i> Hapus
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderSubjectsTable() {
    const tbody = document.getElementById('subjectsTableBody');
    tbody.innerHTML = '';
    
    if (subjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Belum ada data mata pelajaran</td></tr>';
        return;
    }
    
    subjects.forEach((subject, index) => {
        const row = document.createElement('tr');
        const statusClass = subject.is_custom ? 'custom' : 'default';
        const statusText = subject.is_custom ? 'Kustom' : 'Default';
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${subject.name}</td>
            <td><span class="subject-status ${statusClass}">${statusText}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function renderTasksTable() {
    const tbody = document.getElementById('tasksTableBody');
    tbody.innerHTML = '';
    
    if (tasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada tugas</td></tr>';
        return;
    }
    
    tasks.forEach(task => {
        const row = document.createElement('tr');
        const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('id-ID') : '-';
        
        row.innerHTML = `
            <td>${task.name}</td>
            <td>${task.subject_name}</td>
            <td>${task.description || '-'}</td>
            <td>${dueDate}</td>
            <td>
                <button onclick="viewTaskGrades(${task.id})" class="action-btn btn-info">
                    <i class="fas fa-eye"></i> Lihat Nilai
                </button>
                <button onclick="editTask(${task.id})" class="action-btn btn-edit">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button onclick="deleteTask(${task.id})" class="action-btn btn-delete">
                    <i class="fas fa-trash"></i> Hapus
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderGradesTable() {
    const tbody = document.getElementById('gradesTableBody');
    tbody.innerHTML = '';
    
    if (grades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Belum ada data nilai</td></tr>';
        return;
    }
    
    grades.forEach(grade => {
        const row = document.createElement('tr');
        const gradeTypeClass = grade.grade_type || 'final';
        const gradeTypeText = grade.grade_type === 'task' ? 'Tugas' : 'Akhir';
        const taskName = grade.task_name || '-';
        
        row.innerHTML = `
            <td>${grade.student_name}</td>
            <td>${grade.subject_name}</td>
            <td><span class="grade-type ${gradeTypeClass}">${gradeTypeText}</span></td>
            <td>${taskName}</td>
            <td><span class="grade-value">${grade.grade_value}</span></td>
            <td>Semester ${grade.semester}</td>
            <td>${grade.academic_year}</td>
            <td>
                <button onclick="deleteGrade(${grade.id})" class="action-btn btn-delete">
                    <i class="fas fa-trash"></i> Hapus
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Student Management
function showAddStudentModal() {
    document.getElementById('studentModalTitle').textContent = 'Tambah Siswa';
    document.getElementById('studentId').value = '';
    document.getElementById('studentName').value = '';
    document.getElementById('studentNis').value = '';
    showModal('studentModal');
}

function editStudent(studentId) {
    const student = students.find(s => s.id === studentId);
    if (student) {
        document.getElementById('studentModalTitle').textContent = 'Edit Siswa';
        document.getElementById('studentId').value = student.id;
        document.getElementById('studentName').value = student.name;
        document.getElementById('studentNis').value = student.nis || '';
        showModal('studentModal');
    }
}

async function handleStudentForm(event) {
    event.preventDefault();
    showLoading();
    
    const studentId = document.getElementById('studentId').value;
    const name = document.getElementById('studentName').value.trim();
    const nis = document.getElementById('studentNis').value.trim();
    
    // Validasi input
    if (!name) {
        showNotification('Nama siswa harus diisi', 'error');
        hideLoading();
        return;
    }
    
    try {
        const method = studentId ? 'PUT' : 'POST';
        const url = studentId ? `${API_BASE}/students/${studentId}` : `${API_BASE}/students`;
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, nis: nis || null })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            closeModal('studentModal');
            
            // Clear cache to force refresh
            appCache.students = { data: null, timestamp: null };
            appCache.dashboard = { data: null, timestamp: null };
            
            loadStudents();
            loadDashboardData(); // Update stats
        } else {
            // Tampilkan pesan error yang spesifik
            let errorMessage = data.error || 'Terjadi kesalahan';
            
            // Perbaiki pesan error untuk user yang lebih friendly
            if (errorMessage.includes('Nama siswa sudah ada di kelas ini')) {
                errorMessage = 'Nama siswa sudah ada di kelas ini. Silakan gunakan nama yang berbeda.';
            } else if (errorMessage.includes('NIS sudah digunakan')) {
                errorMessage = 'NIS sudah digunakan oleh siswa lain. Silakan gunakan NIS yang berbeda.';
            } else if (errorMessage.includes('Nama siswa sudah ada di kelas lain')) {
                errorMessage = 'Nama siswa sudah ada di kelas lain. NIS harus diisi untuk membedakan siswa.';
            }
            
            showNotification(errorMessage, 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Student form error:', error);
    } finally {
        hideLoading();
    }
}

async function deleteStudent(studentId) {
    if (!confirm('Apakah Anda yakin ingin menghapus siswa ini? Semua nilai siswa juga akan terhapus.')) {
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/students/${studentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            loadStudents();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Gagal menghapus siswa', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Delete student error:', error);
    } finally {
        hideLoading();
    }
}

// Grade Management
async function handleAddGrade(event) {
    event.preventDefault();
    showLoading();
    
    const student_id = document.getElementById('gradeStudent').value;
    const subject_id = document.getElementById('gradeSubject').value;
    const grade_value = document.getElementById('gradeValue').value;
    const semester = document.getElementById('gradeSemester').value;
    const academic_year = document.getElementById('gradeAcademicYear').value;
    
    try {
        const response = await fetch(`${API_BASE}/grades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                student_id: parseInt(student_id),
                subject_id: parseInt(subject_id),
                grade_value: parseFloat(grade_value),
                semester: parseInt(semester),
                academic_year
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            // Clear form
            document.getElementById('gradeStudent').value = '';
            document.getElementById('gradeSubject').value = '';
            document.getElementById('gradeValue').value = '';
            document.getElementById('gradeSemester').value = '';
            document.getElementById('gradeAcademicYear').value = '';
            
            loadGrades();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Gagal menyimpan nilai', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Add grade error:', error);
    } finally {
        hideLoading();
    }
}

async function deleteGrade(gradeId) {
    if (!confirm('Apakah Anda yakin ingin menghapus nilai ini?')) {
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/grades/${gradeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            loadGrades();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Gagal menghapus nilai', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Delete grade error:', error);
    } finally {
        hideLoading();
    }
}

function filterGrades() {
    loadGrades();
}

// Subject Management
async function cleanupDuplicateSubjects() {
    if (!confirm('Apakah Anda yakin ingin membersihkan duplikasi mata pelajaran? Ini akan menghapus mata pelajaran yang duplikat.')) {
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/grades/subjects/cleanup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            loadSubjects(); // Reload subjects
        } else {
            showNotification(data.error || 'Gagal membersihkan duplikasi', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Cleanup subjects error:', error);
    } finally {
        hideLoading();
    }
}

async function updateSeniSubject() {
    const seniType = document.getElementById('seniType').value;
    
    if (!seniType) {
        showNotification('Pilih jenis seni terlebih dahulu', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/grades/subjects/update-seni`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ seni_type: seniType })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            loadSubjects();
            loadGradeFormData(); // Refresh grade form data
        } else {
            showNotification(data.error || 'Gagal mengupdate mata pelajaran seni', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Update seni subject error:', error);
    } finally {
        hideLoading();
    }
}

// Task Management
function showAddTaskModal() {
    document.getElementById('taskModalTitle').textContent = 'Buat Tugas Baru';
    document.getElementById('taskId').value = '';
    document.getElementById('taskName').value = '';
    document.getElementById('taskSubject').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskDueDate').value = '';
    showModal('taskModal');
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        document.getElementById('taskModalTitle').textContent = 'Edit Tugas';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskName').value = task.name;
        document.getElementById('taskSubject').value = task.subject_id;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskDueDate').value = task.due_date || '';
        showModal('taskModal');
    }
}

async function handleTaskForm(event) {
    event.preventDefault();
    showLoading();
    
    const taskId = document.getElementById('taskId').value;
    const name = document.getElementById('taskName').value;
    const subject_id = document.getElementById('taskSubject').value;
    const description = document.getElementById('taskDescription').value;
    const due_date = document.getElementById('taskDueDate').value;
    
    try {
        const method = taskId ? 'PUT' : 'POST';
        const url = taskId ? `${API_BASE}/tasks/${taskId}` : `${API_BASE}/tasks`;
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                subject_id: parseInt(subject_id),
                description,
                due_date: due_date || null
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            closeModal('taskModal');
            loadTasks();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Terjadi kesalahan', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Task form error:', error);
    } finally {
        hideLoading();
    }
}

async function deleteTask(taskId) {
    if (!confirm('Apakah Anda yakin ingin menghapus tugas ini? Semua nilai tugas juga akan terhapus.')) {
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            loadTasks();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Gagal menghapus tugas', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Delete task error:', error);
    } finally {
        hideLoading();
    }
}

async function viewTaskGrades(taskId) {
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}/grades`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('taskGradesModalTitle').textContent = `Nilai Tugas: ${data.task.name}`;
            renderTaskGradesModal(data);
            showModal('taskGradesModal');
        } else {
            showNotification(data.error || 'Gagal memuat data nilai tugas', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('View task grades error:', error);
    } finally {
        hideLoading();
    }
}

function renderTaskGradesModal(data) {
    const content = document.getElementById('taskGradesContent');
    
    let html = `
        <div class="task-info">
            <h4>${data.task.name}</h4>
            <p><strong>Mata Pelajaran:</strong> ${data.task.subject_name}</p>
            ${data.task.description ? `<p><strong>Deskripsi:</strong> ${data.task.description}</p>` : ''}
            ${data.task.due_date ? `<p><strong>Tenggat:</strong> ${new Date(data.task.due_date).toLocaleDateString('id-ID')}</p>` : ''}
        </div>
        
        <table class="task-grades-table">
            <thead>
                <tr>
                    <th>Siswa</th>
                    <th>NIS</th>
                    <th>Nilai</th>
                    <th>Semester</th>
                    <th>Tahun Akademik</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    data.students.forEach(student => {
        const hasGrade = student.grade_value !== null;
        const gradeValue = hasGrade ? student.grade_value : '-';
        const semester = hasGrade ? student.semester : '-';
        const academicYear = hasGrade ? student.academic_year : '-';
        const status = hasGrade ? 'Sudah dinilai' : 'Belum dinilai';
        const statusClass = hasGrade ? 'graded' : 'not-graded';
        
        html += `
            <tr>
                <td>${student.student_name}</td>
                <td>${student.nis || '-'}</td>
                <td>${gradeValue}</td>
                <td>${semester}</td>
                <td>${academicYear}</td>
                <td><span class="grade-status ${statusClass}">${status}</span></td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    content.innerHTML = html;
}

function filterTasks() {
    loadTasks();
}

// Grade Management Enhancement
function showGradeTab(tabType) {
    currentGradeTab = tabType;
    
    // Update tab buttons
    document.querySelectorAll('.grade-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update form visibility
    document.querySelectorAll('.grade-form-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(`${tabType}GradeForm`).classList.add('active');
}

async function loadTasksForSubject() {
    const subjectId = document.getElementById('taskGradeSubject').value;
    const taskSelect = document.getElementById('taskGradeTask');
    
    taskSelect.innerHTML = '<option value="">Pilih Tugas</option>';
    
    if (!subjectId) return;
    
    try {
        const response = await fetch(`${API_BASE}/tasks?subject_id=${subjectId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const subjectTasks = await response.json();
        
        if (subjectTasks && subjectTasks.length > 0) {
            subjectTasks.forEach(task => {
                const option = document.createElement('option');
                option.value = task.id;
                option.textContent = task.name;
                taskSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Tidak ada tugas untuk mata pelajaran ini';
            option.disabled = true;
            taskSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading tasks for subject:', error);
        showNotification('Gagal memuat tugas untuk mata pelajaran ini', 'error');
        
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Error memuat tugas';
        option.disabled = true;
        taskSelect.appendChild(option);
    }
}

async function handleAddTaskGrade(event) {
    event.preventDefault();
    showLoading();
    
    const student_id = document.getElementById('taskGradeStudent').value;
    const subject_id = document.getElementById('taskGradeSubject').value;
    const task_id = document.getElementById('taskGradeTask').value;
    const grade_value = document.getElementById('taskGradeValue').value;
    const semester = document.getElementById('taskGradeSemester').value;
    const academic_year = document.getElementById('taskGradeAcademicYear').value;
    
    try {
        const response = await fetch(`${API_BASE}/grades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                student_id: parseInt(student_id),
                subject_id: parseInt(subject_id),
                task_id: parseInt(task_id),
                grade_value: parseFloat(grade_value),
                grade_type: 'task',
                semester: parseInt(semester),
                academic_year
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            // Clear form
            document.getElementById('taskGradeStudent').value = '';
            document.getElementById('taskGradeSubject').value = '';
            document.getElementById('taskGradeTask').value = '';
            document.getElementById('taskGradeValue').value = '';
            document.getElementById('taskGradeSemester').value = '';
            document.getElementById('taskGradeAcademicYear').value = '';
            
            loadGrades();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Gagal menyimpan nilai tugas', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Add task grade error:', error);
    } finally {
        hideLoading();
    }
}

async function handleAddFinalGrade(event) {
    event.preventDefault();
    showLoading();
    
    const student_id = document.getElementById('finalGradeStudent').value;
    const subject_id = document.getElementById('finalGradeSubject').value;
    const grade_value = document.getElementById('finalGradeValue').value;
    const semester = document.getElementById('finalGradeSemester').value;
    const academic_year = document.getElementById('finalGradeAcademicYear').value;
    
    try {
        const response = await fetch(`${API_BASE}/grades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                student_id: parseInt(student_id),
                subject_id: parseInt(subject_id),
                grade_value: parseFloat(grade_value),
                grade_type: 'final',
                semester: parseInt(semester),
                academic_year
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(data.message, 'success');
            // Clear form
            document.getElementById('finalGradeStudent').value = '';
            document.getElementById('finalGradeSubject').value = '';
            document.getElementById('finalGradeValue').value = '';
            document.getElementById('finalGradeSemester').value = '';
            document.getElementById('finalGradeAcademicYear').value = '';
            
            loadGrades();
            loadDashboardData(); // Update stats
        } else {
            showNotification(data.error || 'Gagal menyimpan nilai akhir', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi', 'error');
        console.error('Add final grade error:', error);
    } finally {
        hideLoading();
    }
}

// Export Functions
async function exportGrades() {
    showLoading();
    
    try {
        const semester = document.getElementById('exportSemester').value;
        const academicYear = document.getElementById('exportYear').value;
        
        let url = `${API_BASE}/export/excel?`;
        if (semester) url += `semester=${semester}&`;
        if (academicYear) url += `academic_year=${academicYear}&`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const contentType = response.headers.get('Content-Type');
            
            // Check if response is actually Excel file
            if (contentType && contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                
                // Get filename from Content-Disposition header
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = `nilai_${new Date().toISOString().slice(0,10)}.xlsx`;
                if (contentDisposition) {
                    const matches = /filename="([^"]*)"/.exec(contentDisposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1];
                    }
                }
                
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);
                
                showNotification('File berhasil didownload', 'success');
            } else {
                // Response is JSON error
                const errorData = await response.json();
                throw new Error(errorData.error || 'Format response tidak valid');
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Gagal mengekspor data');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan: ' + error.message, 'error');
        console.error('Export error:', error);
    } finally {
        hideLoading();
    }
}

async function exportStudents() {
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/export/students/excel`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const contentType = response.headers.get('Content-Type');
            
            // Check if response is actually Excel file
            if (contentType && contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                
                // Get filename from Content-Disposition header
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = `daftar_siswa_${new Date().toISOString().slice(0,10)}.xlsx`;
                if (contentDisposition) {
                    const matches = /filename="([^"]*)"/.exec(contentDisposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1];
                    }
                }
                
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);
                
                showNotification('File berhasil didownload', 'success');
            } else {
                // Response is JSON error
                const errorData = await response.json();
                throw new Error(errorData.error || 'Format response tidak valid');
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Gagal mengekspor data');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan: ' + error.message, 'error');
        console.error('Export error:', error);
    } finally {
        hideLoading();
    }
}

// Utility Functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

function showLoading() {
    document.getElementById('loading').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('show');
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const messageElement = notification.querySelector('.notification-message');
    const iconElement = notification.querySelector('.notification-icon');
    
    messageElement.textContent = message;
    
    // Reset classes
    notification.className = 'notification';
    notification.classList.add(type);
    
    // Set icon based on type
    switch (type) {
        case 'success':
            iconElement.className = 'notification-icon fas fa-check-circle';
            break;
        case 'error':
            iconElement.className = 'notification-icon fas fa-exclamation-circle';
            break;
        case 'warning':
            iconElement.className = 'notification-icon fas fa-exclamation-triangle';
            break;
        default:
            iconElement.className = 'notification-icon fas fa-info-circle';
    }
    
    // Show notification
    notification.classList.add('show');
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

// Event Listeners
document.addEventListener('click', function(event) {
    // Close modal when clicking outside
    if (event.target.classList.contains('modal')) {
        const modal = event.target;
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
});

// Handle escape key to close modals
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
            closeModal(openModal.id);
        }
    }
});

// Auto-refresh token before expiration (23 hours)
setInterval(() => {
    if (token && currentUser) {
        validateToken();
    }
}, 23 * 60 * 60 * 1000);
