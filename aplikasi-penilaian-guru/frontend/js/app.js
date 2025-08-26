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
        
        // Add event listener for bulk grade subject dropdown
        const bulkGradeSubject = document.getElementById('bulkGradeSubject');
        if (bulkGradeSubject) {
            console.log('Adding event listener to bulkGradeSubject');
            bulkGradeSubject.addEventListener('change', function() {
                console.log('bulkGradeSubject changed to:', this.value);
                loadTasksForBulkGrading();
            });
        } else {
            console.log('bulkGradeSubject element not found');
        }
    }, 1000);
    
    // Set up periodic session validation
    setInterval(() => {
        if (token && currentUser) {
            validateToken();
        }
    }, 30 * 60 * 1000); // Check every 30 minutes
    
    // Add page visibility listener to refresh data when user returns to tab
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && token && currentUser) {
            // Refresh data when user returns to the tab
            const currentSection = document.querySelector('.content-section:not([style*="display: none"])');
            if (currentSection && currentSection.id === 'grades') {
                // If we're on grades page, refresh grades data
                loadGrades();
                
                // If bulk grading form is visible, refresh that too
                const bulkForm = document.getElementById('bulkStudentsGradingForm');
                if (bulkForm && bulkForm.style.display !== 'none') {
                    const subjectId = document.getElementById('bulkGradeSubject').value;
                    const taskId = document.getElementById('bulkGradeTask').value;
                    const semester = document.getElementById('bulkGradeSemester').value;
                    const academicYear = document.getElementById('bulkGradeAcademicYear').value;
                    
                    if (subjectId && taskId && semester && academicYear) {
                        refreshCurrentGradingList();
                    }
                }
            }
        }
    });
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
    
    // Load welcome page as default
    showWelcome();
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
function showWelcome() {
    setActiveMenu('welcome');
    setActiveContent('welcomeContent');
}

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
    
    // Load data in parallel for better performance
    Promise.all([
        loadGrades(),
        loadGradeFormData(),
        loadTasksBySubject()
    ]).catch(error => {
        console.error('Error loading grades page data:', error);
        showNotification('Terjadi kesalahan saat memuat data penilaian', 'error');
    });
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
        'welcome': 0,
        'dashboard': 1,
        'students': 2,
        'subjects': 3,
        'tasks': 4,
        'grades': 5,
        'reports': 6
    };
    
    document.querySelectorAll('.menu-item')[menus[section]].classList.add('active');
}

function setActiveContent(contentId) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(contentId).classList.add('active');
}

function updateActiveMenu(functionName) {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Find menu item by onclick function
    const menuItem = document.querySelector(`[onclick="${functionName}"]`);
    if (menuItem) {
        menuItem.classList.add('active');
    }
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
        console.log('Loading subjects from API...');
        const response = await fetch(`${API_BASE}/grades/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            subjects = await response.json();
            console.log('Subjects loaded from API:', subjects);
        } else {
            console.error('Failed to load subjects, response status:', response.status);
            subjects = [];
        }
        
        // If no subjects exist, create default subjects
        if (subjects.length === 0) {
            console.log('No subjects found, creating default subjects...');
            await createDefaultSubjects();
        }
        
        renderSubjectsTable();
    } catch (error) {
        console.error('Error loading subjects:', error);
        showNotification('Gagal memuat data mata pelajaran', 'error');
        subjects = [];
    }
}

async function createDefaultSubjects() {
    const defaultSubjects = [
        'Pendidikan Pancasila',
        'Bahasa Indonesia', 
        'Matematika',
        'Ilmu Pengetahuan Alam',
        'Ilmu Pengetahuan Sosial',
        'Bahasa Inggris',
        'Seni Rupa',
        'Pendidikan Jasmani',
        'Muatan Lokal'
    ];
    
    try {
        for (const subjectName of defaultSubjects) {
            const response = await fetch(`${API_BASE}/grades/subjects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: subjectName })
            });
            
            if (response.ok) {
                console.log(`Created subject: ${subjectName}`);
            }
        }
        
        // Reload subjects after creating defaults
        const response = await fetch(`${API_BASE}/grades/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            subjects = await response.json();
            console.log('Subjects reloaded after creating defaults:', subjects);
        }
        
    } catch (error) {
        console.error('Error creating default subjects:', error);
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
        showLoading();
        
        const gradeType = document.getElementById('gradeTypeFilter').value;
        const subject = document.getElementById('subjectFilter').value;
        const semester = document.getElementById('semesterFilter').value;
        const academicYear = document.getElementById('academicYearFilter').value;
        
        console.log('Loading grades with filters:', { gradeType, subject, semester, academicYear });
        
        let url = `${API_BASE}/grades?`;
        if (gradeType) url += `grade_type=${gradeType}&`;
        if (subject) url += `subject_id=${subject}&`;
        if (semester) url += `semester=${semester}&`;
        if (academicYear) url += `academic_year=${academicYear}&`;
        
        console.log('Fetching grades from URL:', url);
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        grades = await response.json();
        console.log('Grades loaded:', grades.length, 'items');
        
        renderGradesTable();
        hideLoading();
        
        // Show success notification if filters are applied
        const hasFilters = gradeType || subject || semester || academicYear;
        if (hasFilters) {
            showNotification(`Ditemukan ${grades.length} data penilaian`, 'success');
        }
        
    } catch (error) {
        console.error('Error loading grades:', error);
        hideLoading();
        showNotification('Gagal memuat data nilai: ' + error.message, 'error');
    }
}

// Filter function that can be called from buttons
function filterGrades() {
    loadGrades();
}

// Clear filters function
function clearFilters() {
    document.getElementById('gradeTypeFilter').value = '';
    document.getElementById('subjectFilter').value = '';
    document.getElementById('semesterFilter').value = '';
    document.getElementById('academicYearFilter').value = '';
    loadGrades();
}

// Export grades to Excel
async function exportGradesToExcel() {
    try {
        showLoading();
        
        const gradeType = document.getElementById('gradeTypeFilter').value;
        const subject = document.getElementById('subjectFilter').value;
        const semester = document.getElementById('semesterFilter').value;
        const academicYear = document.getElementById('academicYearFilter').value;
        
        let url = `${API_BASE}/export/grades?`;
        if (gradeType) url += `grade_type=${gradeType}&`;
        if (subject) url += `subject_id=${subject}&`;
        if (semester) url += `semester=${semester}&`;
        if (academicYear) url += `academic_year=${academicYear}&`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error('Gagal mengekspor data');
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `data-penilaian-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        hideLoading();
        showNotification('Data berhasil diekspor ke Excel', 'success');
        
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        hideLoading();
        showNotification('Gagal mengekspor data: ' + error.message, 'error');
    }
}

// Edit grade function
function editGrade(gradeId) {
    const grade = grades.find(g => g.id === gradeId);
    if (!grade) {
        showNotification('Data nilai tidak ditemukan', 'error');
        return;
    }
    
    // Fill the form with existing data
    if (grade.grade_type === 'task') {
        showGradeTab('task');
        document.getElementById('bulkGradeSubject').value = grade.subject_id;
        loadTasksForBulkGrading().then(() => {
            document.getElementById('bulkGradeTask').value = grade.task_id;
            document.getElementById('bulkGradeSemester').value = grade.semester;
            document.getElementById('bulkGradeAcademicYear').value = grade.academic_year;
        });
    } else {
        showGradeTab('final');
        document.getElementById('finalGradeSubject').value = grade.subject_id;
        document.getElementById('finalGradeStudent').value = grade.student_id;
        document.getElementById('finalGradeSemester').value = grade.semester;
        document.getElementById('finalGradeAcademicYear').value = grade.academic_year;
        document.getElementById('finalGradeValue').value = grade.grade_value;
    }
    
    // Scroll to form section
    document.querySelector('.grade-input-section').scrollIntoView({ behavior: 'smooth' });
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
    // Set form values for bulk grading
    document.getElementById('bulkGradeSubject').value = subjectId;
    
    // Load tasks for the selected subject
    loadTasksForBulkGrading().then(() => {
        // Set the selected task
        document.getElementById('bulkGradeTask').value = taskId;
    });
    
    // Switch to grades content if not already there
    showGrades();
    
    // Scroll to form
    document.getElementById('gradeCriteriaForm').scrollIntoView({ behavior: 'smooth' });
    
    showNotification(`Siap memberi nilai untuk tugas: ${taskName}`, 'info');
}

async function loadTasksForBulkGrading() {
    const subjectId = document.getElementById('bulkGradeSubject').value;
    const taskSelect = document.getElementById('bulkGradeTask');
    
    console.log('loadTasksForBulkGrading called with subjectId:', subjectId);
    
    taskSelect.innerHTML = '<option value="">Pilih Tugas</option>';
    
    if (!subjectId) {
        console.log('No subject selected, returning');
        return;
    }
    
    try {
        console.log('Fetching tasks for subject:', subjectId);
        const response = await fetch(`${API_BASE}/tasks/by-subject/${subjectId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
            const tasks = await response.json();
            console.log('Tasks received:', tasks);
            
            // Clear existing options first to prevent duplicates
            taskSelect.innerHTML = '<option value="">Pilih Tugas</option>';
            
            if (tasks.length === 0) {
                const noTaskOption = document.createElement('option');
                noTaskOption.value = '';
                noTaskOption.textContent = 'Tidak ada tugas untuk mata pelajaran ini';
                noTaskOption.disabled = true;
                taskSelect.appendChild(noTaskOption);
            } else {
                // Use Set to track added task IDs and prevent duplicates
                const addedTaskIds = new Set();
                
                tasks.forEach(task => {
                    if (!addedTaskIds.has(task.id)) {
                        const option = document.createElement('option');
                        option.value = task.id;
                        option.textContent = task.name;
                        taskSelect.appendChild(option);
                        addedTaskIds.add(task.id);
                    }
                });
            }
        } else {
            console.error('Failed to fetch tasks:', response.statusText);
            taskSelect.innerHTML = '<option value="">Error loading tasks</option>';
        }
    } catch (error) {
        console.error('Error loading tasks for bulk grading:', error);
        taskSelect.innerHTML = '<option value="">Error loading tasks</option>';
    }
}

async function loadStudentsForBulkGrading() {
    const subjectId = document.getElementById('bulkGradeSubject').value;
    const taskId = document.getElementById('bulkGradeTask').value;
    const semester = document.getElementById('bulkGradeSemester').value;
    const academicYear = document.getElementById('bulkGradeAcademicYear').value;
    
    if (!subjectId || !taskId || !semester || !academicYear) {
        showNotification('Harap lengkapi semua kriteria terlebih dahulu', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        // Get task details
        const taskResponse = await fetch(`${API_BASE}/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!taskResponse.ok) {
            throw new Error('Failed to get task details');
        }
        
        const taskData = await taskResponse.json();
        
        // Get subject details
        const subject = subjects.find(s => s.id == subjectId);
        
        if (!subject) {
            throw new Error('Subject not found');
        }
        
        // Get existing grades for this task with fresh data
        const gradesResponse = await fetch(`${API_BASE}/grades?task_id=${taskId}&semester=${semester}&academic_year=${academicYear}&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!gradesResponse.ok) {
            throw new Error('Failed to get existing grades');
        }
        
        const existingGrades = await gradesResponse.json();
        
        // Show task info
        document.getElementById('gradingTaskInfo').innerHTML = `
            <strong>Mata Pelajaran:</strong> ${subject.name} |
            <strong>Tugas:</strong> ${taskData.name} |
            <strong>Semester:</strong> ${semester} |
            <strong>Tahun Akademik:</strong> ${academicYear}
        `;
        
        // Generate students list with clean default values
        const studentsListHtml = students.map((student, index) => {
            const existingGrade = existingGrades.find(g => g.student_id == student.id);
            // Always start with empty value - no pre-filled grades
            const gradeValue = '';
            // Show actual status based on database
            const gradeStatus = existingGrade ? 'existing' : 'new';
            const statusText = existingGrade ? 'Sudah dinilai' : 'Belum dinilai';
            
            return `
                <div class="student-grade-item">
                    <div class="student-info">
                        <div class="student-number">${index + 1}</div>
                        <div class="student-name">${student.name}</div>
                        <div class="grade-status ${gradeStatus}">${statusText}</div>
                    </div>
                    <div class="grade-input-wrapper">
                        <input type="number" 
                               class="grade-input auto-save-grade" 
                               name="grade_${student.id}" 
                               value=""
                               min="0" 
                               max="100" 
                               placeholder="Masukkan nilai 0-100"
                               data-student-id="${student.id}"
                               data-student-name="${student.name}"
                               data-existing-grade="${existingGrade ? existingGrade.grade_value : ''}"
                               data-saved-grade="${existingGrade ? existingGrade.grade_value : ''}">>
                        <button type="button" 
                                class="btn-mini save-individual" 
                                onclick="saveIndividualGrade(${student.id}, '${student.name.replace(/'/g, "\\'")}')"
                                title="Simpan nilai untuk ${student.name}">
                            💾
                        </button>
                        <div class="save-status" data-student-id="${student.id}"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('studentsGradingList').innerHTML = studentsListHtml;
        
        // Add auto-save event listeners to all grade inputs
        setupAutoSaveListeners();
        
        // Hide criteria form and show bulk form
        document.getElementById('gradeCriteriaForm').style.display = 'none';
        document.getElementById('bulkStudentsGradingForm').style.display = 'block';
        
        showNotification(`Menampilkan ${students.length} siswa untuk dinilai`, 'success');
        
    } catch (error) {
        showNotification('Terjadi kesalahan saat memuat data siswa', 'error');
        console.error('Load students for bulk grading error:', error);
    } finally {
        hideLoading();
    }
}

// Setup auto-save listeners for grade inputs
function setupAutoSaveListeners() {
    const gradeInputs = document.querySelectorAll('.auto-save-grade');
    
    gradeInputs.forEach(input => {
        let saveTimeout;
        let lastSavedValue = input.value; // Track last saved value
        
        // Remove any existing listeners to prevent duplicates
        input.removeEventListener('input', input.autoSaveInputHandler);
        input.removeEventListener('blur', input.autoSaveBlurHandler);
        
        // Create handler functions
        input.autoSaveInputHandler = function() {
            const studentId = this.dataset.studentId;
            const studentName = this.dataset.studentName;
            const gradeValue = this.value.trim();
            const statusDiv = document.querySelector(`[data-student-id="${studentId}"].save-status`);
            
            // Clear previous timeout
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            
            // Only show saving if value actually changed
            if (gradeValue !== lastSavedValue && gradeValue !== '') {
                if (statusDiv) {
                    statusDiv.innerHTML = '<span class="saving">💾 Menyimpan...</span>';
                }
                
                // Set timeout to save after 1 second of no typing
                saveTimeout = setTimeout(() => {
                    autoSaveGrade(studentId, studentName, gradeValue, statusDiv, input).then(() => {
                        lastSavedValue = gradeValue;
                    });
                }, 1000);
            }
        };
        
        input.autoSaveBlurHandler = function() {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            
            const studentId = this.dataset.studentId;
            const studentName = this.dataset.studentName;
            const gradeValue = this.value.trim();
            const statusDiv = document.querySelector(`[data-student-id="${studentId}"].save-status`);
            
            // Only save if value changed and is valid
            if (gradeValue && gradeValue !== '' && gradeValue !== lastSavedValue) {
                autoSaveGrade(studentId, studentName, gradeValue, statusDiv, input).then(() => {
                    lastSavedValue = gradeValue;
                });
            }
        };
        
        // Add event listeners
        input.addEventListener('input', input.autoSaveInputHandler);
        input.addEventListener('blur', input.autoSaveBlurHandler);
        
        console.log(`Auto-save listeners added for student ${input.dataset.studentName}`);
    });
}

// Auto-save individual grade
async function autoSaveGrade(studentId, studentName, gradeValue, statusDiv, inputElement) {
    console.log(`Auto-saving grade for ${studentName}: ${gradeValue}`);
    
    // Validate grade value
    if (!gradeValue || gradeValue === '') {
        if (statusDiv) {
            statusDiv.innerHTML = '';
        }
        console.log('Empty grade value, skipping save');
        return false;
    }
    
    const grade = parseFloat(gradeValue);
    if (isNaN(grade) || grade < 0 || grade > 100) {
        if (statusDiv) {
            statusDiv.innerHTML = '<span class="error">❌ Nilai tidak valid (0-100)</span>';
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 3000);
        }
        console.log('Invalid grade value:', gradeValue);
        return false;
    }
    
    // Get form data
    const subjectId = document.getElementById('bulkGradeSubject').value;
    const taskId = document.getElementById('bulkGradeTask').value;
    const semester = document.getElementById('bulkGradeSemester').value;
    const academicYear = document.getElementById('bulkGradeAcademicYear').value;
    
    console.log('Form data:', { subjectId, taskId, semester, academicYear });
    
    if (!subjectId || !taskId || !semester || !academicYear) {
        if (statusDiv) {
            statusDiv.innerHTML = '<span class="error">❌ Data form tidak lengkap</span>';
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 3000);
        }
        console.log('Incomplete form data');
        return false;
    }
    
    try {
        if (statusDiv) {
            statusDiv.innerHTML = '<span class="saving">💾 Menyimpan...</span>';
        }
        
        const payload = {
            student_id: parseInt(studentId),
            subject_id: parseInt(subjectId),
            task_id: parseInt(taskId),
            grade_value: grade,
            semester: semester,
            academic_year: academicYear,
            grade_type: 'task'
        };
        
        console.log('Sending payload:', payload);
        
        const response = await fetch(`${API_BASE}/grades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        console.log('Response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Save successful:', result);
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="success">✅ Tersimpan</span>';
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 2000);
            }
            
            // Update last saved value
            if (inputElement) {
                inputElement.dataset.lastSaved = gradeValue;
                inputElement.dataset.savedGrade = gradeValue; // Update saved grade for load function
                inputElement.dataset.existingGrade = gradeValue; // Update existing grade
            }
            
            // Update grade status in the UI
            const studentItem = document.querySelector(`input[data-student-id="${studentId}"]`).closest('.student-grade-item');
            const gradeStatusDiv = studentItem.querySelector('.grade-status');
            if (gradeStatusDiv) {
                gradeStatusDiv.className = 'grade-status existing';
                gradeStatusDiv.textContent = 'Sudah ada nilai';
            }
            
            // Refresh grades data to update main table
            setTimeout(() => {
                loadGrades();
                loadDashboardData();
            }, 500);
            
            console.log(`Grade saved successfully for student ${studentName}: ${grade}`);
            return true;
            
        } else {
            const errorData = await response.json();
            console.error('Save failed:', errorData);
            
            if (statusDiv) {
                statusDiv.innerHTML = '<span class="error">❌ Gagal menyimpan</span>';
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 3000);
            }
            return false;
        }
    } catch (error) {
        console.error('Auto-save error:', error);
        
        if (statusDiv) {
            statusDiv.innerHTML = '<span class="error">❌ Error koneksi</span>';
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 3000);
        }
        return false;
    }
}

// Manual save for individual grade
async function saveIndividualGrade(studentId, studentName) {
    const inputElement = document.querySelector(`input[data-student-id="${studentId}"]`);
    const statusDiv = document.querySelector(`[data-student-id="${studentId}"].save-status`);
    
    if (!inputElement) {
        console.error('Input element not found for student:', studentId);
        return;
    }
    
    const gradeValue = inputElement.value.trim();
    
    if (!gradeValue || gradeValue === '') {
        showNotification('Masukkan nilai terlebih dahulu', 'warning');
        return;
    }
    
    console.log(`Manual save triggered for ${studentName}: ${gradeValue}`);
    
    // Use the same auto-save function
    const success = await autoSaveGrade(studentId, studentName, gradeValue, statusDiv, inputElement);
    
    if (success) {
        showNotification(`Nilai ${gradeValue} berhasil disimpan untuk ${studentName}`, 'success');
    } else {
        showNotification(`Gagal menyimpan nilai untuk ${studentName}`, 'error');
    }
}

// Refresh current grading list to show updated data
async function refreshCurrentGradingList(savedStudentId, savedGrade) {
    try {
        // Get current form values
        const subjectId = document.getElementById('bulkGradeSubject').value;
        const taskId = document.getElementById('bulkGradeTask').value;
        const semester = document.getElementById('bulkGradeSemester').value;
        const academicYear = document.getElementById('bulkGradeAcademicYear').value;
        
        if (!subjectId || !taskId || !semester || !academicYear) {
            return; // Can't refresh without complete data
        }
        
        // Get fresh grades data
        const gradesResponse = await fetch(`${API_BASE}/grades?task_id=${taskId}&semester=${semester}&academic_year=${academicYear}&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (gradesResponse.ok) {
            const freshGrades = await gradesResponse.json();
            
            // Update all student grade displays
            students.forEach(student => {
                const existingGrade = freshGrades.find(g => g.student_id == student.id);
                const studentInput = document.querySelector(`input[data-student-id="${student.id}"]`);
                const studentItem = studentInput?.closest('.student-grade-item');
                const gradeStatusDiv = studentItem?.querySelector('.grade-status');
                
                if (studentInput && studentItem && gradeStatusDiv) {
                    // Update input value if it doesn't have focus (to avoid overwriting while user is typing)
                    if (document.activeElement !== studentInput) {
                        studentInput.value = existingGrade ? existingGrade.grade_value : '';
                    }
                    
                    // Update status
                    if (existingGrade) {
                        gradeStatusDiv.className = 'grade-status existing';
                        gradeStatusDiv.textContent = 'Sudah ada nilai';
                    } else {
                        gradeStatusDiv.className = 'grade-status new';
                        gradeStatusDiv.textContent = 'Belum dinilai';
                    }
                }
            });
            
            console.log('Grading list refreshed with fresh data');
        }
    } catch (error) {
        console.error('Error refreshing grading list:', error);
    }
}

async function handleBulkTaskGrade(event) {
    event.preventDefault();
    
    const subjectId = document.getElementById('bulkGradeSubject').value;
    const taskId = document.getElementById('bulkGradeTask').value;
    const semester = document.getElementById('bulkGradeSemester').value;
    const academicYear = document.getElementById('bulkGradeAcademicYear').value;
    
    const gradeInputs = document.querySelectorAll('#studentsGradingList .grade-input');
    const gradesToSave = [];
    
    gradeInputs.forEach(input => {
        const studentId = input.dataset.studentId;
        const gradeValue = input.value.trim();
        
        if (gradeValue && gradeValue !== '') {
            const grade = parseFloat(gradeValue);
            if (!isNaN(grade) && grade >= 0 && grade <= 100) {
                gradesToSave.push({
                    student_id: parseInt(studentId),
                    subject_id: parseInt(subjectId),
                    task_id: parseInt(taskId),
                    grade_value: grade,
                    semester: semester,
                    academic_year: academicYear,
                    grade_type: 'task'
                });
            }
        }
    });
    
    if (gradesToSave.length === 0) {
        showNotification('Tidak ada nilai yang valid untuk disimpan', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const savePromises = gradesToSave.map(grade => 
            fetch(`${API_BASE}/grades`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(grade)
            })
        );
        
        await Promise.all(savePromises);
        
        showNotification(`Berhasil menyimpan ${gradesToSave.length} nilai`, 'success');
        
        // Refresh data
        loadGrades();
        loadDashboardData();
        
        // Reset form
        document.getElementById('gradeCriteriaForm').style.display = 'block';
        document.getElementById('bulkStudentsGradingForm').style.display = 'none';
        document.getElementById('bulkGradeSubject').value = '';
        document.getElementById('bulkGradeTask').value = '';
        document.getElementById('bulkGradeSemester').value = '';
        document.getElementById('bulkGradeAcademicYear').value = '';
        
    } catch (error) {
        showNotification('Terjadi kesalahan saat menyimpan nilai', 'error');
        console.error('Bulk grade save error:', error);
    } finally {
        hideLoading();
    }
}

// Fungsi untuk memuat nilai tersimpan ke input fields
function loadExistingGrades() {
    const inputs = document.querySelectorAll('#bulk-grading-list input[type="number"], #studentsGradingList .grade-input');
    let loadedCount = 0;
    
    inputs.forEach(input => {
        const savedGrade = input.dataset.savedGrade;
        if (savedGrade && savedGrade !== '0') {
            input.value = savedGrade;
            loadedCount++;
        }
    });
    
    if (loadedCount > 0) {
        showNotification(`${loadedCount} nilai tersimpan telah dimuat`, 'success');
    } else {
        showNotification('Tidak ada nilai tersimpan untuk dimuat', 'info');
    }
}

function fillAllGrades() {
    const value = prompt('Masukkan nilai untuk semua siswa (0-100):');
    if (value === null) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        showNotification('Nilai harus berupa angka antara 0-100', 'error');
        return;
    }
    
    const gradeInputs = document.querySelectorAll('#studentsGradingList .grade-input');
    gradeInputs.forEach(input => {
        input.value = numValue;
    });
    
    showNotification(`Mengisi semua siswa dengan nilai ${numValue}`, 'success');
}

function clearAllGrades() {
    if (confirm('Apakah Anda yakin ingin mengosongkan semua nilai?')) {
        const gradeInputs = document.querySelectorAll('#studentsGradingList .grade-input');
        gradeInputs.forEach(input => {
            input.value = '';
        });
        showNotification('Semua nilai telah dikosongkan', 'info');
    }
}

function cancelBulkGrading() {
    // Reset forms
    document.getElementById('bulkGradeSubject').value = '';
    document.getElementById('bulkGradeTask').value = '';
    document.getElementById('bulkGradeSemester').value = '';
    document.getElementById('bulkGradeAcademicYear').value = '';
    
    // Show criteria form and hide bulk form
    document.getElementById('gradeCriteriaForm').style.display = 'block';
    document.getElementById('bulkStudentsGradingForm').style.display = 'none';
    
    // Clear students list
    document.getElementById('studentsGradingList').innerHTML = '';
    document.getElementById('gradingTaskInfo').innerHTML = '';
}

async function loadGradeFormData() {
    try {
        console.log('Loading grade form data...');
        
        // Load students for grade form
        if (!students.length) {
            console.log('Loading students...');
            await loadStudents();
        }
        console.log('Students loaded:', students.length);
        
        // Load subjects
        if (!subjects.length) {
            console.log('Loading subjects...');
            await loadSubjects();
        }
        console.log('Subjects loaded:', subjects.length, subjects);
        
        // Populate student selects
        const studentSelects = [
            'taskGradeStudent', 'finalGradeStudent'
        ];
        
        studentSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Pilih Siswa</option>';
                students.forEach(student => {
                    const option = document.createElement('option');
                    option.value = student.id;
                    option.textContent = student.name;
                    select.appendChild(option);
                });
            }
        });
        
        // Populate subject selects
        const subjectSelects = [
            'taskGradeSubject', 'finalGradeSubject', 'subjectFilter', 'bulkGradeSubject', 'bulkFinalGradeSubject'
        ];
        
        subjectSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            console.log(`Checking select: ${selectId}`, select ? 'found' : 'not found');
            
            if (!select) return; // Skip if element doesn't exist
            
            const isFilter = selectId === 'subjectFilter';
            select.innerHTML = isFilter ? '<option value="">Semua Mata Pelajaran</option>' : '<option value="">Pilih Mata Pelajaran</option>';
            
            console.log(`Populating ${selectId} with ${subjects.length} subjects`);
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                select.appendChild(option);
                console.log(`Added subject: ${subject.name} (${subject.id})`);
            });
        });
        
        console.log('Grade form data loaded successfully');
        
    } catch (error) {
        console.error('Error loading grade form data:', error);
    }
}

// Load subjects for final grading
function loadSubjectsForFinalGrading() {
    console.log('Loading subjects for final grading');
    
    const select = document.getElementById('bulkFinalGradeSubject');
    if (!select) {
        console.log('bulkFinalGradeSubject element not found');
        return;
    }
    
    select.innerHTML = '<option value="">Pilih Mata Pelajaran</option>';
    
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.id;
        option.textContent = subject.name;
        select.appendChild(option);
    });
    
    console.log(`Final grading subjects loaded: ${subjects.length} subjects`);
}

// Load subjects for bulk grading (tasks)
function loadSubjectsForBulkGrading() {
    console.log('Loading subjects for bulk grading');
    
    const select = document.getElementById('bulkGradeSubject');
    if (!select) {
        console.log('bulkGradeSubject element not found');
        return;
    }
    
    select.innerHTML = '<option value="">Pilih Mata Pelajaran</option>';
    
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.id;
        option.textContent = subject.name;
        select.appendChild(option);
    });
    
    console.log(`Bulk grading subjects loaded: ${subjects.length} subjects`);
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
            <td class="text-center">${index + 1}</td>
            <td class="font-weight-medium">${student.name}</td>
            <td class="text-center">${student.nis || '-'}</td>
            <td class="text-center">
                <div class="action-buttons">
                    <button onclick="editStudent(${student.id})" class="action-btn btn-edit" title="Edit Siswa">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="deleteStudent(${student.id})" class="action-btn btn-delete" title="Hapus Siswa">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </div>
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
            <td class="font-weight-medium">${task.name}</td>
            <td>${task.subject_name}</td>
            <td>${task.description || '-'}</td>
            <td class="text-center">${dueDate}</td>
            <td class="text-center">
                <div class="action-buttons">
                    <button onclick="viewTaskGrades(${task.id})" class="action-btn btn-view" title="Lihat Nilai">
                        <i class="fas fa-eye"></i> Lihat Nilai
                    </button>
                    <button onclick="editTask(${task.id})" class="action-btn btn-edit" title="Edit Tugas">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="deleteTask(${task.id})" class="action-btn btn-delete" title="Hapus Tugas">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderGradesTable() {
    const tbody = document.getElementById('gradesTableBody');
    const noDataMessage = document.getElementById('noGradesMessage');
    const tableContainer = document.querySelector('.table-responsive');
    
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (grades.length === 0) {
        tableContainer.style.display = 'none';
        noDataMessage.style.display = 'block';
        return;
    }
    
    tableContainer.style.display = 'block';
    noDataMessage.style.display = 'none';
    
    grades.forEach((grade, index) => {
        const row = document.createElement('tr');
        const gradeTypeClass = grade.grade_type || 'final';
        const gradeTypeText = grade.grade_type === 'task' ? 'Nilai Tugas' : 'Nilai Akhir';
        const taskName = grade.task_name || 'Nilai Akhir';
        const createdDate = grade.created_at ? new Date(grade.created_at).toLocaleDateString('id-ID') : '-';
        
        row.innerHTML = `
            <td class="text-center">${index + 1}</td>
            <td class="font-weight-medium">${grade.student_name}</td>
            <td>${grade.subject_name}</td>
            <td><span class="grade-type-badge ${gradeTypeClass}">${gradeTypeText}</span></td>
            <td>${taskName}</td>
            <td><span class="grade-value-display">${grade.grade_value}</span></td>
            <td class="text-center">Semester ${grade.semester}</td>
            <td class="text-center">${grade.academic_year}</td>
            <td class="text-center">${createdDate}</td>
            <td class="text-center">
                <div class="action-buttons">
                    <button onclick="editGrade(${grade.id})" class="action-btn btn-edit" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteGrade(${grade.id})" class="action-btn btn-delete" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Export grades to Excel
function exportGradesToExcel() {
    if (grades.length === 0) {
        showNotification('Tidak ada data untuk diekspor', 'warning');
        return;
    }
    
    // Prepare data for export
    const exportData = grades.map((grade, index) => ({
        'No': index + 1,
        'Nama Siswa': grade.student_name,
        'Mata Pelajaran': grade.subject_name,
        'Jenis Nilai': grade.grade_type === 'task' ? 'Nilai Tugas' : 'Nilai Akhir',
        'Tugas/Ujian': grade.task_name || 'Nilai Akhir',
        'Nilai': grade.grade_value,
        'Semester': `Semester ${grade.semester}`,
        'Tahun Akademik': grade.academic_year,
        'Tanggal Input': grade.created_at ? new Date(grade.created_at).toLocaleDateString('id-ID') : '-'
    }));
    
    // Create CSV content
    const headers = Object.keys(exportData[0]);
    const csvContent = [
        headers.join(','),
        ...exportData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `data_penilaian_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Data berhasil diekspor', 'success');
}

// Edit grade function
function editGrade(gradeId) {
    const grade = grades.find(g => g.id === gradeId);
    if (!grade) {
        showNotification('Data nilai tidak ditemukan', 'error');
        return;
    }
    
    // Switch to appropriate tab based on grade type
    if (grade.grade_type === 'task') {
        showGradeTab('task');
        // Populate task grade form
        document.getElementById('bulkGradeSubject').value = grade.subject_id;
        loadTasksForBulkGrading().then(() => {
            if (grade.task_id) {
                document.getElementById('bulkGradeTask').value = grade.task_id;
            }
        });
        document.getElementById('bulkGradeSemester').value = grade.semester;
        document.getElementById('bulkGradeAcademicYear').value = grade.academic_year;
    } else {
        showGradeTab('final');
        // Populate final grade form
        document.getElementById('bulkFinalGradeSubject').value = grade.subject_id;
        document.getElementById('bulkFinalGradeSemester').value = grade.semester;
        document.getElementById('bulkFinalGradeAcademicYear').value = grade.academic_year;
    }
    
    showNotification('Formulir penilaian telah diisi dengan data yang dipilih', 'info');
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
    
    // Load appropriate data based on tab type
    if (tabType === 'task') {
        // Load subjects for task grading (already handled in existing code)
        loadSubjectsForBulkGrading();
    } else if (tabType === 'final') {
        // Load subjects for final grading
        loadSubjectsForFinalGrading();
        
        // Reset final grading forms
        document.getElementById('finalGradeCriteriaForm').style.display = 'block';
        document.getElementById('bulkStudentsFinalGradingForm').style.display = 'none';
        
        // Clear form data
        document.getElementById('studentsFinalGradingList').innerHTML = '';
        document.getElementById('finalGradingInfo').innerHTML = '';
    }
}

async function loadTasksForSubject() {
    const subjectId = document.getElementById('taskGradeSubject').value;
    const taskSelect = document.getElementById('taskGradeTask');
    
    // Clear all options first to prevent duplicates
    taskSelect.innerHTML = '<option value="">Pilih Tugas</option>';
    
    if (!subjectId) return;
    
    try {
        const response = await fetch(`${API_BASE}/tasks?subject_id=${subjectId}`, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const subjectTasks = await response.json();
        
        // Clear again to be absolutely sure
        taskSelect.innerHTML = '<option value="">Pilih Tugas</option>';
        
        if (subjectTasks && subjectTasks.length > 0) {
            // Use Set to track added task IDs and prevent duplicates
            const addedTaskIds = new Set();
            
            subjectTasks.forEach(task => {
                if (!addedTaskIds.has(task.id)) {
                    const option = document.createElement('option');
                    option.value = task.id;
                    option.textContent = task.name;
                    taskSelect.appendChild(option);
                    addedTaskIds.add(task.id);
                }
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
        
        // Clear and show error message
        taskSelect.innerHTML = '<option value="">Pilih Tugas</option>';
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

// Delete Account Functions
function confirmDeleteAccount() {
    document.getElementById('confirmPassword').value = '';
    document.getElementById('confirmDeletion').checked = false;
    showModal('deleteAccountModal');
}

async function deleteAccount(event) {
    event.preventDefault();
    
    const password = document.getElementById('confirmPassword').value;
    const confirmed = document.getElementById('confirmDeletion').checked;
    
    if (!password) {
        showNotification('Password harus diisi', 'error');
        return;
    }
    
    if (!confirmed) {
        showNotification('Anda harus mencentang konfirmasi', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/auth/delete-account`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Akun berhasil dihapus. Anda akan dialihkan...', 'success');
            
            // Clear all data and redirect to login
            setTimeout(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                token = null;
                currentUser = null;
                window.location.href = '/';
            }, 2000);
            
        } else {
            throw new Error(data.error || 'Gagal menghapus akun');
        }
    } catch (error) {
        console.error('Delete account error:', error);
        showNotification('Terjadi kesalahan: ' + error.message, 'error');
    } finally {
        hideLoading();
        closeModal('deleteAccountModal');
    }
}

// Final Grade Bulk Functions
async function loadStudentsForBulkFinalGrading() {
    const subjectId = document.getElementById('bulkFinalGradeSubject').value;
    const semester = document.getElementById('bulkFinalGradeSemester').value;
    const academicYear = document.getElementById('bulkFinalGradeAcademicYear').value;
    
    if (!subjectId || !semester || !academicYear) {
        showNotification('Harap lengkapi semua kriteria terlebih dahulu', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        // Get subject details
        const subject = subjects.find(s => s.id == subjectId);
        
        if (!subject) {
            throw new Error('Subject not found');
        }
        
        // Get existing final grades with fresh data
        const gradesResponse = await fetch(`${API_BASE}/grades?subject_id=${subjectId}&semester=${semester}&academic_year=${academicYear}&grade_type=final&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
        
        if (!gradesResponse.ok) {
            throw new Error('Failed to get existing final grades');
        }
        
        const existingGrades = await gradesResponse.json();
        
        // Show final grading info
        document.getElementById('finalGradingInfo').innerHTML = `
            <strong>Mata Pelajaran:</strong> ${subject.name} |
            <strong>Semester:</strong> ${semester} |
            <strong>Tahun Akademik:</strong> ${academicYear}
        `;
        
        // Generate students list with clean default values
        const studentsListHtml = students.map((student, index) => {
            const existingGrade = existingGrades.find(g => g.student_id == student.id);
            // Always start with empty value - no pre-filled grades
            const gradeValue = '';
            // Show actual status based on database
            const gradeStatus = existingGrade ? 'existing' : 'new';
            const statusText = existingGrade ? 'Sudah dinilai' : 'Belum dinilai';
            
            return `
                <div class="student-grade-item">
                    <div class="student-info">
                        <div class="student-number">${index + 1}</div>
                        <div class="student-name">${student.name}</div>
                        <div class="grade-status ${gradeStatus}">${statusText}</div>
                    </div>
                    <div class="grade-input-wrapper">
                        <input type="number" 
                               class="grade-input auto-save-final-grade" 
                               name="final_grade_${student.id}" 
                               value=""
                               min="0" 
                               max="100" 
                               placeholder="Masukkan nilai 0-100"
                               data-student-id="${student.id}"
                               data-student-name="${student.name}"
                               data-existing-grade="${existingGrade ? existingGrade.grade_value : ''}"
                               data-saved-grade="${existingGrade ? existingGrade.grade_value : ''}">>
                        <button type="button" 
                                class="btn-mini save-individual" 
                                onclick="saveIndividualFinalGrade(${student.id}, '${student.name.replace(/'/g, "\\'")}')"
                                title="Simpan nilai untuk ${student.name}">
                            💾
                        </button>
                        <div class="save-status" data-student-id="${student.id}"></div>
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('studentsFinalGradingList').innerHTML = studentsListHtml;
        
        // Add auto-save event listeners to all final grade inputs
        setupAutoSaveFinalListeners();
        
        // Hide criteria form and show bulk form
        document.getElementById('finalGradeCriteriaForm').style.display = 'none';
        document.getElementById('bulkStudentsFinalGradingForm').style.display = 'block';
        
        showNotification(`Menampilkan ${students.length} siswa untuk dinilai`, 'success');
        
    } catch (error) {
        showNotification('Terjadi kesalahan saat memuat data siswa', 'error');
        console.error('Load students for bulk final grading error:', error);
    } finally {
        hideLoading();
    }
}

// Setup auto-save listeners for final grade inputs
function setupAutoSaveFinalListeners() {
    const gradeInputs = document.querySelectorAll('.auto-save-final-grade');
    
    gradeInputs.forEach(input => {
        let saveTimeout;
        let lastSavedValue = input.value; // Track last saved value
        
        // Remove any existing listeners to prevent duplicates
        input.removeEventListener('input', input.autoSaveInputHandler);
        input.removeEventListener('blur', input.autoSaveBlurHandler);
        
        // Create handler functions
        input.autoSaveInputHandler = function() {
            const studentId = this.dataset.studentId;
            const studentName = this.dataset.studentName;
            
            // Clear existing timeout
            clearTimeout(saveTimeout);
            
            // Set new timeout for auto-save
            saveTimeout = setTimeout(() => {
                if (this.value !== lastSavedValue && this.value.trim() !== '') {
                    saveIndividualFinalGrade(studentId, studentName, true);
                    lastSavedValue = this.value;
                }
            }, 2000); // Auto-save after 2 seconds of inactivity
        };
        
        input.autoSaveBlurHandler = function() {
            // Save immediately on blur if value changed
            if (this.value !== lastSavedValue && this.value.trim() !== '') {
                clearTimeout(saveTimeout);
                saveIndividualFinalGrade(this.dataset.studentId, this.dataset.studentName, true);
                lastSavedValue = this.value;
            }
        };
        
        // Add event listeners
        input.addEventListener('input', input.autoSaveInputHandler);
        input.addEventListener('blur', input.autoSaveBlurHandler);
    });
}

async function saveIndividualFinalGrade(studentId, studentName, isAutoSave = false) {
    const input = document.querySelector(`input[name="final_grade_${studentId}"]`);
    const statusDiv = document.querySelector(`div[data-student-id="${studentId}"]`);
    const gradeValue = input.value.trim();
    
    if (!gradeValue) {
        if (!isAutoSave) {
            showNotification('Harap masukkan nilai terlebih dahulu', 'warning');
        }
        return;
    }
    
    if (parseFloat(gradeValue) < 0 || parseFloat(gradeValue) > 100) {
        showNotification('Nilai harus antara 0-100', 'warning');
        return;
    }
    
    const subjectId = document.getElementById('bulkFinalGradeSubject').value;
    const semester = document.getElementById('bulkFinalGradeSemester').value;
    const academicYear = document.getElementById('bulkFinalGradeAcademicYear').value;
    
    try {
        // Show saving status
        if (statusDiv) {
            statusDiv.innerHTML = '<span style="color: orange;">💾 Menyimpan...</span>';
        }
        
        const response = await fetch(`${API_BASE}/grades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                student_id: studentId,
                subject_id: subjectId,
                grade_value: parseFloat(gradeValue),
                semester: semester,
                academic_year: academicYear,
                grade_type: 'final'
            })
        });
        
        if (response.ok) {
            // Update status
            if (statusDiv) {
                statusDiv.innerHTML = '<span style="color: green;">✓ Tersimpan</span>';
                setTimeout(() => {
                    statusDiv.innerHTML = '';
                }, 3000);
            }
            
            // Update status text in student info
            const gradeStatusDiv = input.closest('.student-grade-item').querySelector('.grade-status');
            if (gradeStatusDiv) {
                gradeStatusDiv.className = 'grade-status existing';
                gradeStatusDiv.textContent = 'Sudah dinilai';
            }
            
            // Update data attributes
            input.dataset.existingGrade = gradeValue;
            input.dataset.savedGrade = gradeValue;
            
            if (!isAutoSave) {
                showNotification(`Nilai untuk ${studentName} berhasil disimpan`, 'success');
            }
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Gagal menyimpan nilai');
        }
    } catch (error) {
        if (statusDiv) {
            statusDiv.innerHTML = '<span style="color: red;">✗ Gagal</span>';
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 3000);
        }
        
        if (!isAutoSave) {
            showNotification(`Gagal menyimpan nilai untuk ${studentName}: ${error.message}`, 'error');
        }
        console.error('Save individual final grade error:', error);
    }
}

async function handleBulkFinalGrade(event) {
    event.preventDefault();
    
    const inputs = document.querySelectorAll('#studentsFinalGradingList .grade-input');
    const grades = [];
    
    // Collect all grade data
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            const studentId = input.dataset.studentId;
            const gradeValue = parseFloat(value);
            
            if (gradeValue >= 0 && gradeValue <= 100) {
                grades.push({
                    student_id: studentId,
                    grade_value: gradeValue
                });
            }
        }
    });
    
    if (grades.length === 0) {
        showNotification('Harap masukkan minimal satu nilai', 'warning');
        return;
    }
    
    const subjectId = document.getElementById('bulkFinalGradeSubject').value;
    const semester = document.getElementById('bulkFinalGradeSemester').value;
    const academicYear = document.getElementById('bulkFinalGradeAcademicYear').value;
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/grades/bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                grades: grades.map(g => ({
                    ...g,
                    subject_id: subjectId,
                    semester: semester,
                    academic_year: academicYear,
                    grade_type: 'final'
                }))
            })
        });
        
        if (response.ok) {
            showNotification(`Berhasil menyimpan ${grades.length} nilai akhir`, 'success');
            
            // Update all status indicators
            grades.forEach(grade => {
                const gradeStatusDiv = document.querySelector(`input[data-student-id="${grade.student_id}"]`)
                    ?.closest('.student-grade-item')?.querySelector('.grade-status');
                if (gradeStatusDiv) {
                    gradeStatusDiv.className = 'grade-status existing';
                    gradeStatusDiv.textContent = 'Sudah dinilai';
                }
            });
            
            // Reload grades data
            loadGrades();
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Gagal menyimpan nilai');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan saat menyimpan nilai: ' + error.message, 'error');
        console.error('Bulk final grade error:', error);
    } finally {
        hideLoading();
    }
}

async function loadExistingFinalGrades() {
    const subjectId = document.getElementById('bulkFinalGradeSubject').value;
    const semester = document.getElementById('bulkFinalGradeSemester').value;
    const academicYear = document.getElementById('bulkFinalGradeAcademicYear').value;
    
    if (!subjectId || !semester || !academicYear) {
        showNotification('Kriteria penilaian belum lengkap', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`${API_BASE}/grades?subject_id=${subjectId}&semester=${semester}&academic_year=${academicYear}&grade_type=final&_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
        
        if (!response.ok) {
            throw new Error('Gagal memuat nilai tersimpan');
        }
        
        const existingGrades = await response.json();
        let loadedCount = 0;
        
        // Load existing grades into inputs
        existingGrades.forEach(grade => {
            const input = document.querySelector(`input[name="final_grade_${grade.student_id}"]`);
            if (input) {
                input.value = grade.grade_value;
                input.dataset.existingGrade = grade.grade_value;
                input.dataset.savedGrade = grade.grade_value;
                loadedCount++;
                
                // Update status
                const gradeStatusDiv = input.closest('.student-grade-item').querySelector('.grade-status');
                if (gradeStatusDiv) {
                    gradeStatusDiv.className = 'grade-status existing';
                    gradeStatusDiv.textContent = 'Sudah dinilai';
                }
            }
        });
        
        if (loadedCount > 0) {
            showNotification(`${loadedCount} nilai tersimpan telah dimuat`, 'success');
        } else {
            showNotification('Tidak ada nilai tersimpan untuk dimuat', 'info');
        }
        
    } catch (error) {
        showNotification('Terjadi kesalahan saat memuat nilai tersimpan', 'error');
        console.error('Load existing final grades error:', error);
    } finally {
        hideLoading();
    }
}

function fillAllFinalGrades() {
    const value = prompt('Masukkan nilai yang akan digunakan untuk semua siswa (0-100):');
    
    if (value === null) return; // User cancelled
    
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        showNotification('Nilai harus berupa angka antara 0-100', 'warning');
        return;
    }
    
    const inputs = document.querySelectorAll('#studentsFinalGradingList .grade-input');
    inputs.forEach(input => {
        input.value = numValue;
    });
    
    showNotification(`Semua nilai telah diisi dengan ${numValue}`, 'success');
}

function clearAllFinalGrades() {
    if (confirm('Apakah Anda yakin ingin mengosongkan semua nilai?')) {
        const inputs = document.querySelectorAll('#studentsFinalGradingList .grade-input');
        inputs.forEach(input => {
            input.value = '';
        });
        showNotification('Semua nilai telah dikosongkan', 'success');
    }
}

function cancelBulkFinalGrading() {
    // Show criteria form and hide bulk form
    document.getElementById('finalGradeCriteriaForm').style.display = 'block';
    document.getElementById('bulkStudentsFinalGradingForm').style.display = 'none';
    
    // Clear form data
    document.getElementById('studentsFinalGradingList').innerHTML = '';
    document.getElementById('finalGradingInfo').innerHTML = '';
}
