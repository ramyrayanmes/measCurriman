// ============================================================
//  CURRIMAN v4.6.3 — MEAS Curriculum Manager
//  Google Apps Script Backend
//
//  NEW IN v4.2:
//  - Department emoji icons (hardcoded, one-time)
//  - Department archiving (dedicated archive folder)
//  - Grade management: add, remove (archive), rename
//  - Department renaming (persisted in _dept_config tab)
//  - Improved Access Denied screen with admin contact info
//  - _dept_config tab drives runtime dept listing
// ============================================================

// ── CONFIG ────────────────────────────────────────────────────────────────
var VERSION         = 'v4.6.3';
const CONFIG = {
  ROLES_SHEET_ID: '1FCN-9nq6sWu3idhkSmiKHO3LUmSyTR0YcLobMDWMrAU',

  ELECTIVES_SHEET_ID:         '1jVcMS7K4aUs09J1LGXQIVoRxAGq-fWC-zUpsbtt3SmU',
  ELECTIVES_ARCHIVE_SHEET_ID: '1DM9qiYmvaLVug69Xnvje1Ootpcv5WEJ0CKMM0YHRTbc',

  TEMPLATE_DOC_ID: '1tOH773RGDv7iy_qgDpuGNYkr4pqmT5AOICtcDdEeJvc',

  // CurriMan sandbox folder:
  // https://drive.google.com/drive/folders/1Ql0_n-RwDFEi1QpbWeMpYKrd-i_X_4P-
  PARENT_FOLDER_ID: '1Ql0_n-RwDFEi1QpbWeMpYKrd-i_X_4P-',

  // Department archive folder (created by user):
  // https://drive.google.com/drive/folders/19PpiVOvMukrEjkz9Y48zOKyGEnlZgyfB
  DEPT_ARCHIVE_FOLDER_ID: '19PpiVOvMukrEjkz9Y48zOKyGEnlZgyfB',

  // Fallback department sheets — used only if _dept_config tab is missing.
  // Runtime config is read from _dept_config tab in the Roles sheet.
  DEPARTMENT_SHEETS: {
    'Arabic':             '11ZiTuQnq-abNZ7h_fk3NV4e83joteaZtbYmW9vvhpbg',
    'Art':                '16zMDOk51azI1PF7t-iEyn_yANSFW0Q3KyQpgQtS3-KU',
    'Computer':           '1ZotttiLQzdWiA3OKJFaKFJq6UXmm1-L7FrWNwItlL6o',
    'English':            '1JgNgb_m6yGm05itbvZxZ3mvcw2fFMnJ8PKrxUssM_nQ',
    'French':             '18z9uuDv-NdsFrkt_snabrTnQ3RJLEmXolOj8jKk-fFI',
    'German':             '1kyMyEA4APOP3CJHetjRiz-qJyjxkXnssIowYTG588LE',
    'Mathematics':        '1hP2W9pxok7xqTKrqtD1BsV5DOJthnsk6GwF3hSyGO6w',
    'Music':              '1y_pcBGa1Tm-dh6abC2egJ3RBHIeXh81hae32OnYqOO0',
    'P.E.':               '14cJ6nHYpSlLB2SGdl7oyOy3v7ckb1jBjHVNFqFtMnX4',
    'Religion Islamic':   '1mTNm7zYcIckoZ9H0f89IcSqrzCLsqfpVu36QVlQpIOg',
    'Religion Christian': '1sh3sM6B8mVrBVy0FoCLyuje2HD0bLzHcp-O-DCHOVEc',
    'Science':            '1ZASE22USZICduvUSVqwDMn6ZuHbbEObzZ9f7aB671sk',
    'SS Arabic':          '1zMpZsCFGPLy3HfCqZ1uAHh3otbGuFdE0NgrxNwK1gKI',
    'SS English':         '1eXyPowdAlsXjF85vsHjBBPJ7umlvrI33-0zD6zzIFV8',
  },

  // Department emoji icons — one-time, fixed
  DEPT_ICONS: {
    'Arabic':             '🌙',
    'Art':                '🎨',
    'Computer':           '💻',
    'English':            '📖',
    'French':             '🇫🇷',
    'German':             '🇩🇪',
    'Mathematics':        '📐',
    'Music':              '🎵',
    'P.E.':               '⚽',
    'Religion Islamic':   '☪️',
    'Religion Christian': '✝️',
    'Science':            '🔬',
    'SS Arabic':          '🗺️',
    'SS English':         '📚',
  },

  GRADES: [
    'Grade K','Grade 1','Grade 2','Grade 3','Grade 4','Grade 5',
    'Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'
  ],

  MAX_VERSIONS:    5,
  HISTORY_ROW_KEY: 'HISTORY_LOG',
  META_ROW_KEY:    'META_DATA',
};

// ── ENTRY POINT ───────────────────────────────────────────────────────────
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('CurriMan — MEAS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── ROUTER ────────────────────────────────────────────────────────────────
function handleRequest(action, payload) {
  try {
    if (action === 'getInitialData') return getInitialData();

    var user = null;
    try { user = getCurrentUser(); }
    catch (e) { return { success: false, error: 'Auth error: ' + e.message }; }
    if (!user) return { success: false, error: 'ACCESS_DENIED', message: 'Your account is not registered.' };

    switch (action) {
      case 'getCurriculum':        return getCurriculum(payload, user);
      case 'saveDraft':            return saveDraft(payload, user);
      case 'saveCurriculum':       return saveCurriculum(payload, user);
      case 'submitForReview':      return submitForReview(payload, user);
      case 'getVersions':          return getVersions(payload, user);
      case 'saveVersion':          return saveVersion(payload, user);
      case 'restoreVersion':       return restoreVersion(payload, user);
      case 'pinVersion':           return pinVersion(payload, user);
      case 'deleteVersion':        return deleteVersion(payload, user);
      case 'getNotifications':     return getNotifications(user);
      case 'reviewSubmission':     return reviewSubmission(payload, user);
      case 'exportDocument':       return exportDocument(payload, user);
      case 'getElectives':         return getElectives(user);
      case 'getArchivedElectives': return getArchivedElectives(user);
      case 'addElective':          return addElective(payload, user);
      case 'archiveElective':      return archiveElective(payload, user);
      case 'restoreElective':      return restoreElective(payload, user);
      case 'getRoles':             return getRoles(user);
      case 'saveRoles':            return saveRoles(payload, user);
      case 'autoArchiveAndSave':   return autoArchiveAndSave(payload, user);
      // ── Dept / Grade management (v4.6.3) ──
      case 'getDeptConfig':        return getDeptConfig(user);
      case 'addGrade':             return addGrade(payload, user);
      case 'removeGrade':          return removeGrade(payload, user);
      case 'renameGrade':          return renameGrade(payload, user);
      case 'renameDept':           return renameDept(payload, user);
      case 'archiveDept':          return archiveDept(payload, user);
      case 'restoreDept':          return restoreDept(payload, user);
      case 'updateDeptEmoji':      return updateDeptEmoji(payload, user);
      case 'getArchivedGrades':    return getArchivedGrades(payload, user);
      case 'restoreGrade':         return restoreGrade(payload, user);
      case 'trashGrade':           return trashGrade(payload, user);
      case 'deleteGradePermanently': return deleteGradePermanently(payload, user);
      case 'reorderGrades':        return reorderGrades(payload, user);
      case 'renameElective':       return renameElective(payload, user);
      default: return { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    console.error('handleRequest [' + action + '] uncaught:', err.message);
    return { success: false, error: err.message };
  }
}

// ── INITIAL DATA ──────────────────────────────────────────────────────────
// PERFORMANCE: Opens the Roles sheet exactly ONCE and reads all data in
// one batch. Electives and notifications are loaded lazily by the frontend
// after boot to avoid slowing down the initial page load.
function getInitialData() {
  var email = getEmail();

  // ── Single Roles sheet open — read everything in one pass ──
  var ss = null;
  try { ss = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID); }
  catch(e) { return { success: true, accessDenied: true, email: email, errorDetail: e.message }; }

  // Auth
  var user = null;
  try { user = _getUserFromSheet(ss, email); }
  catch(e) { return { success: true, accessDenied: true, email: email, errorDetail: e.message }; }
  if (!user) return { success: true, accessDenied: true, email: email };

  // Dept config (same Roles sheet, different tab)
  var deptConfig = _loadDeptConfigFromSheet(ss);
  var activeDepts  = deptConfig.filter(function(d){ return !d.archived; });
  var archivedDepts = user.isAdmin ? deptConfig.filter(function(d){ return d.archived; }) : [];

  // Pending notifications count (same Roles sheet, _notifications tab)
  var pendingCount = 0;
  if (user.isAdmin || user.isHod) {
    try {
      var notifTab = ss.getSheetByName('_notifications');
      if (notifTab && notifTab.getLastRow() > 1) {
        var nrows = notifTab.getRange(2,1,notifTab.getLastRow()-1,6).getValues();
        pendingCount = nrows.filter(function(r){
          if (String(r[5]).trim() !== 'pending') return false;
          if (user.isAdmin) return true;
          return user.isHod && user.hodDepartments.indexOf(String(r[3]).trim()) !== -1;
        }).length;
      }
    } catch(e) {}
  }

  // Dept meta + grades from cache (no extra sheet opens)
  var departments = activeDepts.map(function(d){ return d.name; });
  var deptMeta = {}, deptGrades = {};
  deptConfig.forEach(function(d){
    deptMeta[d.name] = {
      displayName: d.displayName || d.name,
      icon: CONFIG.DEPT_ICONS[d.name] || CONFIG.DEPT_ICONS[d.displayName] || '📁',
      archived: d.archived
    };
  });
  activeDepts.forEach(function(d) {
    var grades = d.gradesCache && d.gradesCache.length ? d.gradesCache : CONFIG.GRADES;
    if (d.gradeOrder && d.gradeOrder.length) {
      var ordered = d.gradeOrder.filter(function(g){ return grades.indexOf(g) !== -1; });
      var rest    = grades.filter(function(g){ return ordered.indexOf(g) === -1; });
      grades = ordered.concat(rest);
    }
    deptGrades[d.name] = grades;
  });

  // Electives loaded lazily — return empty arrays, frontend fetches separately
  // This saves 2 SpreadsheetApp.openById calls from boot time.
  var electives = [], archivedElectives = [];
  try { electives = getElectiveTabs(CONFIG.ELECTIVES_SHEET_ID); } catch(e) {}

  return {
    success: true, accessDenied: false, user: user,
    departments: departments,
    archivedDepts: archivedDepts,
    deptMeta: deptMeta,
    deptGrades: deptGrades,
    grades: CONFIG.GRADES,
    electives: electives,
    archivedElectives: [],
    pendingCount: pendingCount
  };
}

// Read user from an already-open Roles spreadsheet (avoids second openById)
function _getUserFromSheet(ss, email) {
  var sh = ss.getSheetByName('Roles');
  if (!sh) throw new Error('Roles tab missing.');
  var last = sh.getLastRow();
  if (last < 2) return null;
  var rows = sh.getRange(2,1,last-1,4).getValues();
  var userRows = rows.filter(function(r){ return String(r[0]).toLowerCase().trim() === email; });
  if (!userRows.length) return null;

  var u = { email:email, roles:[], assignments:[],
            isAdmin:false, isHod:false, isTeacher:false, isAuditor:false,
            hodDepartments:[], teacherAssignments:[] };
  userRows.forEach(function(r){
    var role=String(r[1]).trim(), dept=String(r[2]).trim(), grade=String(r[3]).trim();
    if (u.roles.indexOf(role)===-1) u.roles.push(role);
    switch(role){
      case 'Administration': u.isAdmin=true; break;
      case 'Head of Department':
        u.isHod=true;
        if(dept&&u.hodDepartments.indexOf(dept)===-1) u.hodDepartments.push(dept); break;
      case 'Teacher':
        u.isTeacher=true;
        u.teacherAssignments.push({department:dept,grade:grade}); break;
      case 'Auditor': u.isAuditor=true; break;
    }
    if(dept) u.assignments.push({department:dept,grade:grade,role:role});
  });
  return u;
}

// Read _dept_config from an already-open Roles spreadsheet.
// Safe with any number of columns — pads missing columns with defaults.
function _loadDeptConfigFromSheet(ss) {
  var tab = ss.getSheetByName('_dept_config');
  if (!tab) {
    // _dept_config tab missing entirely — bootstrap from hardcoded CONFIG
    return Object.keys(CONFIG.DEPARTMENT_SHEETS).map(function(name) {
      return { name:name, sheetId:CONFIG.DEPARTMENT_SHEETS[name], archived:false,
               displayName:name, emoji:CONFIG.DEPT_ICONS[name]||'📁',
               gradeOrder:[], gradesCache:CONFIG.GRADES };
    });
  }
  var last = tab.getLastRow();
  if (last < 2) {
    // Tab exists but is empty — same fallback
    return Object.keys(CONFIG.DEPARTMENT_SHEETS).map(function(name) {
      return { name:name, sheetId:CONFIG.DEPARTMENT_SHEETS[name], archived:false,
               displayName:name, emoji:CONFIG.DEPT_ICONS[name]||'📁',
               gradeOrder:[], gradesCache:CONFIG.GRADES };
    });
  }
  var numCols = tab.getLastColumn();
  var cols    = Math.max(numCols, 7); // read at least 7 cols, pad with empty
  var rows    = tab.getRange(2, 1, last-1, Math.min(cols, tab.getMaxColumns())).getValues();
  return rows.filter(function(r){ return String(r[0]).trim(); }).map(function(r){
    var gradesStr = r[6] ? String(r[6]).trim() : '';
    var gradesList = gradesStr
      ? gradesStr.split(',').map(function(g){return g.trim();}).filter(Boolean)
      : CONFIG.GRADES;   // fall back to default grades if cache empty
    return {
      name:        String(r[0]).trim(),
      sheetId:     String(r[1]).trim(),
      archived:    String(r[2]).trim() === 'true',
      displayName: String(r[3]).trim() || String(r[0]).trim(),
      emoji:       (r[4] ? String(r[4]).trim() : '') || CONFIG.DEPT_ICONS[String(r[0]).trim()] || '📁',
      gradeOrder:  r[5] ? String(r[5]).split(',').map(function(g){return g.trim();}).filter(Boolean) : [],
      gradesCache: gradesList
    };
  });
}

// ── AUTH ──────────────────────────────────────────────────────────────────
function getEmail() {
  try { return Session.getActiveUser().getEmail().toLowerCase().trim(); } catch(e) { return ''; }
}

function getCurrentUser() {
  var email = getEmail();
  if (!email) return null;

  var ss = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID);
  var sh = ss.getSheetByName('Roles');
  if (!sh) throw new Error('Roles tab missing — run initProject() first.');

  var last = sh.getLastRow();
  if (last < 2) return null;

  var rows     = sh.getRange(2, 1, last - 1, 4).getValues();
  var userRows = rows.filter(function(r) { return String(r[0]).toLowerCase().trim() === email; });
  if (!userRows.length) return null;

  var u = {
    email: email, roles: [], assignments: [],
    isAdmin: false, isHod: false, isTeacher: false, isAuditor: false,
    hodDepartments: [], teacherAssignments: []
  };

  userRows.forEach(function(r) {
    var role  = String(r[1]).trim();
    var dept  = String(r[2]).trim();
    var grade = String(r[3]).trim();
    if (u.roles.indexOf(role) === -1) u.roles.push(role);
    switch (role) {
      case 'Administration':
      case 'Administrator':  // accept both spellings
        u.isAdmin = true; break;
      case 'Head of Department':
        u.isHod = true;
        if (dept && u.hodDepartments.indexOf(dept) === -1) u.hodDepartments.push(dept);
        break;
      case 'Teacher':
        u.isTeacher = true;
        u.teacherAssignments.push({ department: dept, grade: grade });
        break;
      case 'Auditor': u.isAuditor = true; break;
    }
    if (dept) u.assignments.push({ department: dept, grade: grade, role: role });
  });
  return u;
}

function canEdit(user, dept, grade) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.isHod && user.hodDepartments.indexOf(dept) !== -1) return true;
  return false; // Teachers no longer edit live — they use staging
}

function canTeacherEdit(user, dept, grade) {
  if (!user) return false;
  if (canEdit(user, dept, grade)) return true;
  if (user.isTeacher && user.teacherAssignments.some(function(a) {
    return a.department === dept && a.grade === grade;
  })) return true;
  return false;
}

function canView(user, dept, grade) {
  if (!user) return false;
  if (user.isAdmin || user.isAuditor) return true;
  return canTeacherEdit(user, dept, grade);
}

function canViewArchived(user, dept, grade) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return canTeacherEdit(user, dept, grade);
}

function canApprove(user, dept) {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (user.isHod && user.hodDepartments.indexOf(dept) !== -1) return true;
  return false;
}

// ── GET CURRICULUM ────────────────────────────────────────────────────────
function getCurriculum(payload, user) {
  var dept     = payload.department;
  var grade    = payload.grade;
  var archived = payload.archived || false;

  if (archived) {
    if (!canViewArchived(user, dept, grade)) return permissionError();
    try {
      var aSs = SpreadsheetApp.openById(CONFIG.ELECTIVES_ARCHIVE_SHEET_ID);
      var aSh = aSs.getSheetByName(grade);
      if (!aSh) return { success: false, error: 'Archived course not found: ' + grade };
      return { success: true, data: sheetToObject(aSh), readOnly: true, mode: 'archived' };
    } catch(err) { return { success: false, error: err.message }; }
  }

  if (!canView(user, dept, grade)) return permissionError();

  try {
    var ss   = _getDeptSpreadsheet(dept);
    var sh   = ss.getSheetByName(grade);
    if (!sh) return { success: false, error: 'Tab "' + grade + '" not found. Run initProject() first.' };

    var liveData = sheetToObject(sh);

    // Check for pending staging submission
    var stagingTab  = ss.getSheetByName(grade + '_staging');
    var hasPending  = false;
    var stagingData = null;
    var stagingMeta = null;

    if (stagingTab) {
      var sr = stagingTab.getLastRow();
      if (sr > 0) {
        var raw = stagingTab.getRange(1,1,sr,4).getValues();
        // Find the most recent submitted row
        var submitted = raw.filter(function(r){ return String(r[2]).trim() === 'submitted'; });
        if (submitted.length > 0) {
          var latest = submitted[submitted.length - 1];
          hasPending  = true;
          stagingMeta = { timestamp: String(latest[0]), email: String(latest[1]), status: 'submitted' };
          try { stagingData = JSON.parse(String(latest[3])); } catch(e) {}
        }
      }
    }

    // Teachers: if there's a pending submission, they see it read-only (locked)
    // If no pending, they get their own staging draft or live
    if (user.isTeacher && !canEdit(user, dept, grade)) {
      if (hasPending) {
        return {
          success: true, data: stagingData || liveData,
          readOnly: true, mode: 'locked',
          stagingMeta: stagingMeta,
          message: 'Your submission is pending review. Editing is locked until resolved.'
        };
      }
      // Check for teacher's own draft
      var draftData = _getTeacherDraft(ss, grade, user.email);
      return {
        success: true,
        data: draftData || liveData,
        readOnly: false, mode: 'staging',
        hasDraft: !!draftData
      };
    }

    // Admin/HoD: always see live, plus know if there's a pending submission
    return {
      success: true, data: liveData,
      readOnly: !canEdit(user, dept, grade), mode: 'live',
      hasPending: hasPending, stagingMeta: stagingMeta
    };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── TEACHER DRAFT ─────────────────────────────────────────────────────────
function _getTeacherDraft(ss, grade, email) {
  var tab = ss.getSheetByName(grade + '_staging');
  if (!tab) return null;
  var last = tab.getLastRow();
  if (last === 0) return null;
  var rows = tab.getRange(1, 1, last, 4).getValues();
  // Find latest draft for this teacher (status = 'draft')
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]).toLowerCase().trim() === email &&
        String(rows[i][2]).trim() === 'draft') {
      try { return JSON.parse(String(rows[i][3])); } catch(e) { return null; }
    }
  }
  return null;
}

// ── SAVE DRAFT (Teachers) ─────────────────────────────────────────────────
function saveDraft(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  var data  = payload.data;

  if (!canTeacherEdit(user, dept, grade)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_staging') || ss.insertSheet(grade + '_staging');

    // Check if there's already a pending submission — if so, block
    var last = tab.getLastRow();
    if (last > 0) {
      var rows = tab.getRange(1,1,last,4).getValues();
      var hasPending = rows.some(function(r){ return String(r[2]).trim() === 'submitted'; });
      if (hasPending) return { success: false, error: 'A submission is already pending review. Editing is locked until resolved.' };
    }

    // Clear old draft for this teacher, then append new draft row
    var keep = [];
    if (last > 0) {
      var allRows = tab.getRange(1,1,last,4).getValues();
      keep = allRows.filter(function(r){
        return !(String(r[1]).toLowerCase().trim() === user.email && String(r[2]).trim() === 'draft');
      });
    }
    keep.push([new Date().toISOString(), user.email, 'draft', JSON.stringify(data)]);
    tab.clearContents();
    tab.getRange(1,1,keep.length,4).setValues(keep);

    return { success: true, timestamp: keep[keep.length-1][0] };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── SUBMIT FOR REVIEW ─────────────────────────────────────────────────────
function submitForReview(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  var data  = payload.data;
  var note  = payload.note || '';

  if (!canTeacherEdit(user, dept, grade)) return permissionError();
  // Only teachers submit — Admin/HoD save directly
  if (canEdit(user, dept, grade)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_staging') || ss.insertSheet(grade + '_staging');

    // Clear any existing draft for this teacher and mark as submitted
    var last = tab.getLastRow();
    var keep = [];
    if (last > 0) {
      keep = tab.getRange(1,1,last,4).getValues().filter(function(r){
        return !(String(r[1]).toLowerCase().trim() === user.email && String(r[2]).trim() === 'draft');
      });
    }
    var ts = new Date().toISOString();
    keep.push([ts, user.email, 'submitted', JSON.stringify(data)]);
    tab.clearContents();
    tab.getRange(1,1,keep.length,4).setValues(keep);

    // Create notification
    _createNotification(dept, grade, user.email, ts, note);

    // Email all Admins
    _emailAdmins(dept, grade, user.email, ts, data, note);

    return { success: true, timestamp: ts };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── ADMIN/HOD SAVE (direct save to live, also creates a version) ──────────
function autoArchiveAndSave(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  if (!canEdit(user, dept, grade)) return permissionError();
  try {
    var ss  = _getDeptSpreadsheet(dept);
    var sh  = ss.getSheetByName(grade);
    if (!sh) return { success: false, error: 'Sheet tab not found.' };

    // Save current live as a version before overwriting
    var existing = sheetToObject(sh);
    if (existing && Object.keys(existing).length > 0) {
      _appendVersion(ss, grade, existing, user.email, 'Auto-snapshot before upload');
    }

    var data    = payload.data;
    var history = (existing._history || []);
    var entry   = { timestamp: new Date().toISOString(), email: user.email };
    history.unshift(entry);
    data._history = history;
    objectToSheet(sh, data);
    return { success: true, timestamp: entry.timestamp, email: user.email };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── SAVE CURRICULUM (Admin/HoD direct save to live) ───────────────────────
function saveCurriculum(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  var data  = payload.data;
  if (!canEdit(user, dept, grade)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var sh  = ss.getSheetByName(grade);
    if (!sh) return { success: false, error: 'Sheet tab not found.' };

    var existing = sheetToObject(sh);
    var history  = (existing._history || []);
    var entry    = { timestamp: new Date().toISOString(), email: user.email };
    history.unshift(entry);
    data._history = history;
    objectToSheet(sh, data);

    return { success: true, timestamp: entry.timestamp, email: user.email };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── REVIEW SUBMISSION (Admin/HoD approves or rejects) ────────────────────
function reviewSubmission(payload, user) {
  var dept     = payload.department;
  var grade    = payload.grade;
  var decision = payload.decision; // 'approve' or 'reject'
  var label    = payload.label    || '';
  var reason   = payload.reason   || '';

  if (!canApprove(user, dept)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_staging');
    if (!tab) return { success: false, error: 'No pending submission found.' };

    var last = tab.getLastRow();
    if (last === 0) return { success: false, error: 'No pending submission found.' };

    var rows = tab.getRange(1,1,last,4).getValues();
    var submittedIdx = -1;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][2]).trim() === 'submitted') { submittedIdx = i; break; }
    }
    if (submittedIdx === -1) return { success: false, error: 'No pending submission found.' };

    var submittedRow  = rows[submittedIdx];
    var teacherEmail  = String(submittedRow[1]);
    var submittedData = null;
    try { submittedData = JSON.parse(String(submittedRow[3])); } catch(e) {}

    if (decision === 'approve') {
      // Push staged data to live sheet
      var sh = ss.getSheetByName(grade);
      if (!sh) return { success: false, error: 'Live tab not found.' };

      var existing = sheetToObject(sh);
      // Save current live as a version before overwriting
      if (existing && Object.keys(existing).length > 0) {
        _appendVersion(ss, grade, existing, user.email, 'Pre-approval snapshot');
      }

      var history = (existing._history || []);
      var entry   = { timestamp: new Date().toISOString(), email: teacherEmail };
      history.unshift(entry);
      submittedData._history = history;
      objectToSheet(sh, submittedData);

      // Save approved version as a named snapshot
      var vLabel = label || ('Approved: ' + teacherEmail + ' — ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
      _appendVersion(ss, grade, submittedData, user.email, vLabel, false);

      // Clear staging
      tab.clearContents();

      // Update notification
      _resolveNotification(dept, grade, 'approved', reason);

      // Email teacher
      _emailTeacher(teacherEmail, dept, grade, 'approved', label, reason);

      return { success: true, decision: 'approved', timestamp: entry.timestamp };

    } else {
      // Reject — clear staging, keep notification resolved
      tab.clearContents();
      _resolveNotification(dept, grade, 'rejected', reason);
      _emailTeacher(teacherEmail, dept, grade, 'rejected', label, reason);
      return { success: true, decision: 'rejected' };
    }
  } catch(err) { return { success: false, error: err.message }; }
}

// ── VERSIONS ──────────────────────────────────────────────────────────────
function getVersions(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  if (!canView(user, dept, grade)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_versions');
    if (!tab || tab.getLastRow() === 0) return { success: true, versions: [] };

    var rows = tab.getRange(1,1,tab.getLastRow(),5).getValues();
    var versions = rows.map(function(r, i) {
      return {
        idx:       i,
        timestamp: String(r[0]),
        email:     String(r[1]),
        label:     String(r[2]),
        pinned:    String(r[3]) === 'true',
        data:      null  // don't send full data in list — fetch on demand
      };
    }).reverse(); // newest first
    return { success: true, versions: versions };
  } catch(err) { return { success: false, error: err.message }; }
}

function getVersionData(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  var idx   = payload.idx;
  if (!canView(user, dept, grade)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_versions');
    if (!tab) return { success: false, error: 'No versions found.' };
    var row = tab.getRange(idx + 1, 5, 1, 1).getValue();
    var data = null;
    try { data = JSON.parse(String(row)); } catch(e) {}
    return { success: true, data: data };
  } catch(err) { return { success: false, error: err.message }; }
}

function saveVersion(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  var label = payload.label || '';
  if (!canEdit(user, dept, grade)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var sh  = ss.getSheetByName(grade);
    if (!sh) return { success: false, error: 'Tab not found.' };
    var data = sheetToObject(sh);
    _appendVersion(ss, grade, data, user.email, label, false);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

function restoreVersion(payload, user) {
  var dept  = payload.department;
  var grade = payload.grade;
  var idx   = payload.idx;
  if (!canApprove(user, dept)) return permissionError();

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_versions');
    if (!tab) return { success: false, error: 'No versions found.' };
    var row = tab.getRange(idx + 1, 1, 1, 5).getValues()[0];
    var data = null;
    try { data = JSON.parse(String(row[4])); } catch(e) {}
    if (!data) return { success: false, error: 'Could not parse version data.' };

    var sh = ss.getSheetByName(grade);
    if (!sh) return { success: false, error: 'Live tab not found.' };

    // Snapshot current live before restore
    var existing = sheetToObject(sh);
    if (existing && Object.keys(existing).length > 0) {
      _appendVersion(ss, grade, existing, user.email, 'Pre-restore snapshot');
    }

    var history = (existing._history || []);
    history.unshift({ timestamp: new Date().toISOString(), email: user.email });
    data._history = history;
    objectToSheet(sh, data);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

function pinVersion(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept  = payload.department;
  var grade = payload.grade;
  var idx   = payload.idx;
  var pin   = payload.pin; // true or false

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_versions');
    if (!tab) return { success: false, error: 'No versions found.' };
    tab.getRange(idx + 1, 4).setValue(pin ? 'true' : 'false');
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

function deleteVersion(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept  = payload.department;
  var grade = payload.grade;
  var idx   = payload.idx;

  try {
    var ss  = _getDeptSpreadsheet(dept);
    var tab = ss.getSheetByName(grade + '_versions');
    if (!tab) return { success: false, error: 'No versions found.' };
    var pinned = String(tab.getRange(idx + 1, 4).getValue()).trim() === 'true';
    if (pinned) return { success: false, error: 'Cannot delete a pinned version. Unpin it first.' };
    tab.deleteRow(idx + 1);
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

function _appendVersion(ss, grade, data, email, label, pinned) {
  pinned = (pinned === true) ? 'true' : 'false';
  var tab = ss.getSheetByName(grade + '_versions') || ss.insertSheet(grade + '_versions');
  tab.appendRow([new Date().toISOString(), email, label || '', pinned, JSON.stringify(data)]);

  // Prune oldest unpinned versions if over limit
  var last = tab.getLastRow();
  if (last > CONFIG.MAX_VERSIONS) {
    var rows  = tab.getRange(1, 1, last, 5).getValues();
    // Find unpinned rows (oldest first)
    var unpinned = [];
    rows.forEach(function(r, i) {
      if (String(r[3]).trim() !== 'true') unpinned.push(i + 1); // 1-based row index
    });
    // Delete oldest unpinned until we're at MAX_VERSIONS
    var toDelete = last - CONFIG.MAX_VERSIONS;
    for (var d = 0; d < toDelete && d < unpinned.length; d++) {
      tab.deleteRow(unpinned[d] - d); // adjust for previous deletions
    }
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
function _getNotificationsTab() {
  var ss  = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID);
  var tab = ss.getSheetByName('_notifications');
  if (!tab) {
    tab = ss.insertSheet('_notifications');
    tab.appendRow(['id','timestamp','teacherEmail','department','grade','status','adminNote','note']);
  }
  return tab;
}

function _createNotification(dept, grade, teacherEmail, ts, note) {
  var tab = _getNotificationsTab();
  var id  = 'notif_' + Date.now();
  tab.appendRow([id, ts, teacherEmail, dept, grade, 'pending', '', note || '']);
}

function _resolveNotification(dept, grade, status, note) {
  var tab  = _getNotificationsTab();
  var last = tab.getLastRow();
  if (last < 2) return;
  var rows = tab.getRange(2, 1, last - 1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][3]) === dept && String(rows[i][4]) === grade &&
        String(rows[i][5]) === 'pending') {
      tab.getRange(i + 2, 6).setValue(status);
      tab.getRange(i + 2, 7).setValue(note || '');
    }
  }
}

function _getPendingNotifications(user) {
  var tab  = _getNotificationsTab();
  var last = tab.getLastRow();
  if (last < 2) return [];
  var rows = tab.getRange(2, 1, last - 1, 8).getValues();
  return rows.filter(function(r) {
    if (String(r[5]) !== 'pending') return false;
    if (user.isAdmin) return true;
    if (user.isHod && user.hodDepartments.indexOf(String(r[3])) !== -1) return true;
    return false;
  }).map(function(r) {
    return { id: r[0], timestamp: String(r[1]), teacherEmail: String(r[2]),
             department: String(r[3]), grade: String(r[4]), note: String(r[7]) };
  });
}

function getNotifications(user) {
  if (!user.isAdmin && !user.isHod) return permissionError();
  try {
    var pending = _getPendingNotifications(user);
    return { success: true, notifications: pending };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── EMAILS ────────────────────────────────────────────────────────────────
function _getAdminEmails() {
  var ss   = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID);
  var sh   = ss.getSheetByName('Roles');
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var emails = [];
  rows.forEach(function(r) {
    if (String(r[1]).trim() === 'Administration' || String(r[1]).trim() === 'Administrator') {
      var em = String(r[0]).trim().toLowerCase();
      if (em && emails.indexOf(em) === -1) emails.push(em);
    }
  });
  return emails;
}

function _emailAdmins(dept, grade, teacherEmail, ts, data, note) {
  try {
    var admins = _getAdminEmails();
    if (!admins.length) return;

    var meta    = (data && data.meta) || {};
    var school  = meta.school || 'MEAS';
    var year    = meta.academicYear || '';
    var subject = '[CurriMan] Review Request: ' + dept + ' — ' + grade;
    var body    = _buildReviewEmailHtml(school, dept, grade, year, teacherEmail, ts, data, note, null);

    admins.forEach(function(email) {
      MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
    });
  } catch(e) { console.error('_emailAdmins:', e.message); }
}

function _emailTeacher(teacherEmail, dept, grade, decision, label, reason) {
  try {
    var subject = '[CurriMan] Your submission was ' + (decision === 'approved' ? 'Approved ✅' : 'Rejected ❌');
    var body    = _buildFeedbackEmailHtml(dept, grade, decision, label, reason);
    MailApp.sendEmail({ to: teacherEmail, subject: subject, htmlBody: body });
  } catch(e) { console.error('_emailTeacher:', e.message); }
}

function _buildReviewEmailHtml(school, dept, grade, year, teacherEmail, ts, data, note, changedSections) {
  var dateStr = Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'EEEE, MMMM d, yyyy \'at\' HH:mm');
  var sectionList = '';
  if (data) {
    var sections = ['courseDescription','courseObjectives','learningOutcomes','courseMaterials',
                    'courseContent','teachingMethods','projects','trips','internships',
                    'gradingCriteria','curriculumOutlineSemesterOne','curriculumOutlineSemesterTwo','notes'];
    var names = { courseDescription:'Course Description', courseObjectives:'Course Objectives',
                  learningOutcomes:'Learning Outcomes', courseMaterials:'Course Materials & Resources',
                  courseContent:'Course Content', teachingMethods:'Teaching Methods',
                  projects:'List of Projects', trips:'List of Trips',
                  internships:'List of Internships & Events', gradingCriteria:'Grading Criteria',
                  curriculumOutlineSemesterOne:'Curriculum Outline — Sem 1',
                  curriculumOutlineSemesterTwo:'Curriculum Outline — Sem 2', notes:'Notes & Changes' };
    sections.forEach(function(k) {
      if (data[k]) sectionList += '<li>' + (names[k] || k) + '</li>';
    });
  }
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1a1a1a">' +
    '<div style="background:#0f1923;padding:20px 28px;border-radius:8px 8px 0 0">' +
    '<h1 style="color:#7dd3fc;font-size:20px;margin:0">CurriMan — ' + _esc(school) + '</h1>' +
    '<p style="color:rgba(255,255,255,.7);margin:4px 0 0;font-size:13px">Curriculum Review Request</p></div>' +
    '<div style="border:1px solid #dde3ea;border-top:none;border-radius:0 0 8px 8px;padding:24px">' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold;width:40%">Department</td><td style="padding:8px;border-bottom:1px solid #eee">' + _esc(dept) + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold">Grade</td><td style="padding:8px;border-bottom:1px solid #eee">' + _esc(grade) + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold">Academic Year</td><td style="padding:8px;border-bottom:1px solid #eee">' + _esc(year) + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold">Submitted by</td><td style="padding:8px;border-bottom:1px solid #eee">' + _esc(teacherEmail) + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold">Submitted at</td><td style="padding:8px">' + _esc(dateStr) + '</td></tr>' +
    '</table>' +
    (note ? '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin-bottom:16px"><strong>Teacher\'s note:</strong> ' + _esc(note) + '</div>' : '') +
    (sectionList ? '<p style="font-weight:bold;margin-bottom:8px">Sections submitted:</p><ul style="margin:0;padding-left:20px;line-height:1.8">' + sectionList + '</ul>' : '') +
    '<p style="margin-top:24px;font-size:13px;color:#6b7f8f">Log in to CurriMan to review the submission and approve or reject it.</p>' +
    '</div></body></html>';
}

function _buildFeedbackEmailHtml(dept, grade, decision, label, reason) {
  var approved = decision === 'approved';
  var color    = approved ? '#0e9f6e' : '#e02424';
  var icon     = approved ? '✅' : '❌';
  var title    = approved ? 'Submission Approved' : 'Submission Rejected';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1a1a1a">' +
    '<div style="background:#0f1923;padding:20px 28px;border-radius:8px 8px 0 0">' +
    '<h1 style="color:#7dd3fc;font-size:20px;margin:0">CurriMan — MEAS</h1>' +
    '<p style="color:rgba(255,255,255,.7);margin:4px 0 0;font-size:13px">Curriculum Submission Feedback</p></div>' +
    '<div style="border:1px solid #dde3ea;border-top:none;border-radius:0 0 8px 8px;padding:24px">' +
    '<div style="background:' + (approved?'#f0fdf4':'#fdf2f2') + ';border-left:4px solid ' + color + ';padding:14px 18px;border-radius:4px;margin-bottom:20px">' +
    '<strong style="color:' + color + ';font-size:16px">' + icon + ' ' + title + '</strong>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold;width:40%">Department</td><td style="padding:8px;border-bottom:1px solid #eee">' + _esc(dept) + '</td></tr>' +
    '<tr><td style="padding:8px;background:#f4f6f9;font-weight:bold">Grade</td><td style="padding:8px">' + _esc(grade) + '</td></tr>' +
    '</table>' +
    (approved && label ? '<p><strong>Version label:</strong> ' + _esc(label) + '</p>' : '') +
    (reason ? '<div style="background:#f4f6f9;border-radius:6px;padding:12px 16px;margin-top:12px"><strong>' + (approved?'Note':'Reason for rejection') + ':</strong><br>' + _esc(reason) + '</div>' : '') +
    '<p style="margin-top:24px;font-size:13px;color:#6b7f8f">Log in to CurriMan to view your curriculum.</p>' +
    '</div></body></html>';
}

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── ELECTIVES ─────────────────────────────────────────────────────────────
function getElectives(user) {
  try {
    var tabs = getElectiveTabs(CONFIG.ELECTIVES_SHEET_ID);
    if (user.isAdmin || user.isAuditor) return { success: true, electives: tabs };
    if (user.isHod && user.hodDepartments.indexOf('Electives') !== -1) return { success: true, electives: tabs };
    var mine = user.teacherAssignments.filter(function(a){return a.department==='Electives';}).map(function(a){return a.grade;});
    return { success: true, electives: tabs.filter(function(t){return mine.indexOf(t)!==-1;}) };
  } catch(err) { return { success: false, error: err.message }; }
}

function getArchivedElectives(user) {
  if (user.isAuditor) return { success: true, electives: [] };
  try {
    var tabs = getElectiveTabs(CONFIG.ELECTIVES_ARCHIVE_SHEET_ID);
    if (user.isAdmin) return { success: true, electives: tabs };
    var mine = user.teacherAssignments.filter(function(a){return a.department==='Electives';}).map(function(a){return a.grade;});
    return { success: true, electives: tabs.filter(function(t){return mine.indexOf(t)!==-1;}) };
  } catch(err) { return { success: false, error: err.message }; }
}

function addElective(payload, user) {
  if (!user.isAdmin) return permissionError();
  var name = (payload.courseName||'').trim();
  if (!name) return { success: false, error: 'Course name is required.' };
  try {
    var ss = SpreadsheetApp.openById(CONFIG.ELECTIVES_SHEET_ID);
    if (ss.getSheetByName(name)) return { success: false, error: '"'+name+'" already exists.' };
    writeBlankCurriculum(ss.insertSheet(name), 'Electives', name);
    return { success: true, courseName: name };
  } catch(err) { return { success: false, error: err.message }; }
}

function archiveElective(payload, user) {
  if (!user.isAdmin) return permissionError();
  if ((payload.email||'').toLowerCase().trim() !== user.email) return { success: false, error: 'Email verification failed.' };
  try { return _archiveElectiveTab(payload.courseName); } catch(err) { return { success: false, error: err.message }; }
}

function _archiveElectiveTab(courseName) {
  var ss  = SpreadsheetApp.openById(CONFIG.ELECTIVES_SHEET_ID);
  var sh  = ss.getSheetByName(courseName);
  if (!sh) return { success: false, error: 'Course not found: ' + courseName };
  var aSs = SpreadsheetApp.openById(CONFIG.ELECTIVES_ARCHIVE_SHEET_ID);
  var aName = courseName; var n = 1;
  while (aSs.getSheetByName(aName)) { aName = courseName + ' (' + n++ + ')'; }
  objectToSheet(aSs.insertSheet(aName), sheetToObject(sh));
  ss.deleteSheet(sh);
  return { success: true, archivedAs: aName };
}

function restoreElective(payload, user) {
  if ((payload.email||'').toLowerCase().trim() !== user.email) return { success: false, error: 'Email verification failed.' };
  var name = payload.courseName;
  var ok   = user.isAdmin || user.teacherAssignments.some(function(a){return a.department==='Electives'&&a.grade===name;});
  if (!ok) return permissionError();
  try {
    var aSs   = SpreadsheetApp.openById(CONFIG.ELECTIVES_ARCHIVE_SHEET_ID);
    var aSh   = aSs.getSheetByName(name);
    if (!aSh) return { success: false, error: 'Archived course not found: '+name };
    var ss    = SpreadsheetApp.openById(CONFIG.ELECTIVES_SHEET_ID);
    var rName = name; var n = 1;
    while (ss.getSheetByName(rName)) { rName = name + ' (restored ' + n++ + ')'; }
    objectToSheet(ss.insertSheet(rName), sheetToObject(aSh));
    aSs.deleteSheet(aSh);
    return { success: true, restoredAs: rName };
  } catch(err) { return { success: false, error: err.message }; }
}

function getElectiveTabs(sheetId) {
  if (!sheetId || sheetId.length < 20) return [];
  return SpreadsheetApp.openById(sheetId).getSheets()
    .map(function(s){return s.getName();})
    .filter(function(n){return n!=='Sheet1'&&n.charAt(0)!=='_';});
}

// ── ROLES ─────────────────────────────────────────────────────────────────
function getRoles(user) {
  if (!user.isAdmin) return permissionError();
  try {
    var ss  = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID);
    var sh  = ss.getSheetByName('Roles');
    if (!sh) return { success: false, error: 'Roles sheet not found.' };
    var last = sh.getLastRow();
    if (last < 2) return { success: true, roles: [], departments: Object.keys(CONFIG.DEPARTMENT_SHEETS), grades: CONFIG.GRADES };
    var data = sh.getRange(2,1,last-1,4).getValues()
      .filter(function(r){return String(r[0]).trim();})
      .map(function(r){return {email:String(r[0]).trim(),role:String(r[1]).trim(),department:String(r[2]).trim(),grade:String(r[3]).trim()};});
    return { success: true, roles: data, departments: Object.keys(CONFIG.DEPARTMENT_SHEETS), grades: CONFIG.GRADES };
  } catch(err) { return { success: false, error: err.message }; }
}

function saveRoles(payload, user) {
  if (!user.isAdmin) return permissionError();
  try {
    var ss = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID);
    var sh = ss.getSheetByName('Roles') || ss.insertSheet('Roles');
    sh.clearContents();
    var rows = [['Email','Role','Department','Grade / Course']];
    (payload.roles||[]).forEach(function(r){rows.push([r.email||'',r.role||'',r.department||'',r.grade||'']);});
    sh.getRange(1,1,rows.length,4).setValues(rows);
    sh.getRange(1,1,1,4).setBackground('#0f1923').setFontColor('#ffffff').setFontWeight('bold');
    return { success: true };
  } catch(err) { return { success: false, error: err.message }; }
}

// ── SHEET SERIALIZATION ───────────────────────────────────────────────────
function _getDeptSpreadsheet(dept) {
  if (dept === 'Electives') return SpreadsheetApp.openById(CONFIG.ELECTIVES_SHEET_ID);
  // Try _dept_config first (supports renames/adds at runtime)
  var cfg = _loadDeptConfig();
  for (var i = 0; i < cfg.length; i++) {
    if (cfg[i].name === dept || cfg[i].displayName === dept) {
      return SpreadsheetApp.openById(cfg[i].sheetId);
    }
  }
  // Fallback to hardcoded CONFIG
  var id = CONFIG.DEPARTMENT_SHEETS[dept];
  if (!id || id.length < 10) throw new Error('No Sheet ID for: ' + dept);
  return SpreadsheetApp.openById(id);
}

function getDeptSheet(dept, grade) {
  return _getDeptSpreadsheet(dept).getSheetByName(grade);
}

function sheetToObject(sheet) {
  var last = sheet.getLastRow();
  if (last === 0) return {};
  var rows = sheet.getRange(1,1,last,2).getValues();
  var obj = {}, section = null, subKey = null;
  rows.forEach(function(row) {
    var k = String(row[0]).trim();
    var v = row[1] !== undefined ? row[1] : '';
    if (!k) return;
    if (k === CONFIG.HISTORY_ROW_KEY) {
      try { obj._history = JSON.parse(String(v)); } catch(e) { obj._history = []; }
      return;
    }
    if (k.indexOf('##') === 0) { section = k.slice(2).trim(); obj[section] = obj[section] || {}; subKey = null; }
    else if (k.indexOf('#') === 0) { subKey = k.slice(1).trim(); if (section) obj[section][subKey] = obj[section][subKey] || []; }
    else if (section && subKey) {
      if (k === 'ITEM') obj[section][subKey].push(String(v));
      else if (k === 'ROW') { try { obj[section][subKey].push(JSON.parse(String(v))); } catch(e) { obj[section][subKey].push({}); } }
    } else if (section) { obj[section][k] = String(v); }
  });
  return obj;
}

function objectToSheet(sheet, data) {
  sheet.clearContents();
  var rows = [];
  if (data._history) rows.push([CONFIG.HISTORY_ROW_KEY, JSON.stringify(data._history)]);
  Object.keys(data).forEach(function(sec) {
    if (sec === '_history') return;
    rows.push(['##' + sec, '']);
    var sd = data[sec];
    if (typeof sd === 'object' && !Array.isArray(sd)) {
      Object.keys(sd).forEach(function(sk) {
        var v = sd[sk];
        if (Array.isArray(v)) {
          rows.push(['#' + sk, '']);
          v.forEach(function(i){ rows.push(typeof i === 'object' ? ['ROW', JSON.stringify(i)] : ['ITEM', String(i)]); });
        } else { rows.push([sk, String(v)]); }
      });
    }
  });
  if (rows.length) sheet.getRange(1,1,rows.length,2).setValues(rows);
}

function writeBlankCurriculum(sheet, dept, grade) { objectToSheet(sheet, getBlankCurriculum(dept, grade)); }

function getBlankCurriculum(dept, grade) {
  return {
    meta: { school:'Modern Education American School', department:dept, grade:grade, creditHours:'1', hoursPerWeek:'1 hrs.', academicYear:'2026-2027' },
    courseDescription: { text:'' }, courseObjectives: { intro:'', items:[] },
    learningOutcomes: { intro:'', items:[] }, courseMaterials: { items:[] },
    courseContent: { semesterOneTitle:'Semester One', semesterOneItems:[], semesterTwoTitle:'Semester Two', semesterTwoItems:[] },
    teachingMethods: { items:[] }, projects: { items:[] }, trips: { items:[] }, internships: { items:[] },
    gradingCriteria: { rows:[] }, curriculumOutlineSemesterOne: { rows:[] }, curriculumOutlineSemesterTwo: { rows:[] },
    notes: { text:'' }
  };
}

function permissionError() { return { success:false, error:'PERMISSION_DENIED', message:'You do not have permission to perform this action.' }; }

// ── DOCUMENT EXPORT ───────────────────────────────────────────────────────
function exportDocument(payload, user) {
  if (user.isAuditor) return permissionError();
  var format = (payload.format || 'pdf').toLowerCase();
  var data   = payload.data;
  if (!data) return { success: false, error: 'No curriculum data provided.' };

  var copyId = null;
  try {
    var templateFile = DriveApp.getFileById(CONFIG.TEMPLATE_DOC_ID);
    var meta    = data.meta || {};
    var docName = (meta.department||'Curriculum') + ' ' + (meta.grade||'') + ' [temp]';
    var copy    = templateFile.makeCopy(docName, DriveApp.getRootFolder());
    copyId      = copy.getId();

    var doc  = DocumentApp.openById(copyId);
    var body = doc.getBody();

    var textMap = {
      '{{school}}':               meta.school        || '',
      '{{department}}':           meta.department     || '',
      '{{grade}}':                meta.grade          || '',
      '{{Grade}}':                meta.grade          || '',
      '{{creditHours}}':          meta.creditHours    || '',
      '{{hoursPerWeek}}':         meta.hoursPerWeek   || '',
      '{{academicYear}}':         meta.academicYear   || '',
      '{{courseDescription}}':    _textOf(data.courseDescription),
      '{{courseContentSem1Title}}': _textOf2(data.courseContent,'semesterOneTitle','Semester One'),
      '{{courseContentSem2Title}}': _textOf2(data.courseContent,'semesterTwoTitle','Semester Two'),
      '{{notes}}':                _textOf(data.notes),
    };
    Object.keys(textMap).forEach(function(ph){ body.replaceText(_escapeRegex(ph), textMap[ph]); });

    var listMap = {
      '{{courseObjectives}}':  _flattenNodes(data.courseObjectives  && data.courseObjectives.items),
      '{{learningOutcomes}}':  _flattenNodes(data.learningOutcomes  && data.learningOutcomes.items),
      '{{courseMaterials}}':   _flattenNodes(data.courseMaterials   && data.courseMaterials.items),
      '{{courseContentSem1}}': _flattenNodes(data.courseContent     && data.courseContent.semesterOneItems),
      '{{courseContentSem2}}': _flattenNodes(data.courseContent     && data.courseContent.semesterTwoItems),
      '{{teachingMethods}}':   _flattenNodes(data.teachingMethods   && data.teachingMethods.items),
      '{{projects}}':          _flattenNodes(data.projects          && data.projects.items),
      '{{trips}}':             _flattenNodes(data.trips             && data.trips.items),
      '{{internships}}':       _flattenNodes(data.internships       && data.internships.items),
    };
    Object.keys(listMap).forEach(function(ph) {
      var lines = listMap[ph];
      var sr = body.findText(_escapeRegex(ph));
      if (!sr) return;
      var el = sr.getElement();
      var para = (el.getType() === DocumentApp.ElementType.PARAGRAPH) ? el : el.getParent();
      var paraIndex = body.getChildIndex(para);
      if (!lines || !lines.length) {
        try { para.asText ? para.asText().setText('\u2014') : para.clear(); } catch(e) {}
      } else {
        lines.forEach(function(line, li) {
          var glyph = line.depth===0 ? DocumentApp.GlyphType.BULLET
                    : line.depth===1 ? DocumentApp.GlyphType.HOLLOW_BULLET
                    : DocumentApp.GlyphType.SQUARE_BULLET;
          var newItem = body.insertListItem(paraIndex+1+li, line.text);
          newItem.setGlyphType(glyph);
          newItem.setNestingLevel(line.depth);
        });
        body.removeChild(body.getChild(paraIndex));
      }
    });

    var tables = body.getTables();
    tables.forEach(function(table) {
      if (table.getNumRows() < 2) return;
      var firstCell = table.getCell(1,0).getText().trim();
      if (firstCell === '{{gc_row}}') {
        _expandTable(table, data.gradingCriteria && data.gradingCriteria.rows || [],
          ['category','maximum_grade',
           _pickKey(data.gradingCriteria&&data.gradingCriteria.rows,'approx_no_of_items','approx__no__of_items'),
           _pickKey(data.gradingCriteria&&data.gradingCriteria.rows,'grade_per_assignment','grade___per_assignment')]);
      } else if (firstCell === '{{outline_sem1_row}}') {
        var s1 = data.curriculumOutlineSemesterOne && data.curriculumOutlineSemesterOne.rows || [];
        _expandTable(table, s1, _outlineKeys(s1));
      } else if (firstCell === '{{outline_sem2_row}}') {
        var s2 = data.curriculumOutlineSemesterTwo && data.curriculumOutlineSemesterTwo.rows || [];
        _expandTable(table, s2, _outlineKeys(s2));
      }
    });

    var footer = doc.getFooter();
    if (footer) {
      footer.replaceText(_escapeRegex('{{grade}}'),        meta.grade        || '');
      footer.replaceText(_escapeRegex('{{Grade}}'),        meta.grade        || '');
      footer.replaceText(_escapeRegex('{{department}}'),   meta.department   || '');
      footer.replaceText(_escapeRegex('{{academicYear}}'), meta.academicYear || '');
      footer.replaceText(_escapeRegex('{{school}}'),       meta.school       || '');
    }
    doc.saveAndClose();

    var mimeType = format === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';
    var ext      = format === 'docx' ? '.docx' : '.pdf';
    var fileName = (meta.department||'Curriculum') + ' ' + (meta.grade||'') +
                   ' Curriculum (' + (meta.academicYear||'') + ')' + ext;

    var exportUrl = 'https://www.googleapis.com/drive/v3/files/' + copyId +
                    '/export?mimeType=' + encodeURIComponent(mimeType);
    var resp = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      throw new Error('Export failed: ' + resp.getContentText().substring(0,200));
    }
    return { success: true, base64: Utilities.base64Encode(resp.getContent()), mimeType: mimeType, fileName: fileName };
  } catch(err) {
    return { success: false, error: err.message };
  } finally {
    if (copyId) { try { DriveApp.getFileById(copyId).setTrashed(true); } catch(e) {} }
  }
}

// ── Export helpers ────────────────────────────────────────────────────────
function _escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function _textOf(obj) { if (!obj) return ''; return String(obj.text||obj||'').trim(); }
function _textOf2(obj,key,fallback) { if (!obj) return fallback||''; return String(obj[key]||fallback||'').trim(); }
function _flattenNodes(arr,depth) {
  depth=depth||0; if(!Array.isArray(arr)||!arr.length) return [];
  var out=[];
  arr.forEach(function(item){
    var node=typeof item==='string'?{text:item,children:[]}:item;
    if(!node.children)node.children=[];
    var t=String(node.text||'').trim();
    if(t) out.push({text:t,depth:depth});
    if(node.children&&node.children.length) _flattenNodes(node.children,depth+1).forEach(function(c){out.push(c);});
  });
  return out;
}
function _pickKey(rows,preferred,fallback) {
  if(!rows||!rows.length) return preferred;
  return (rows[0][preferred]!==undefined)?preferred:fallback;
}
function _outlineKeys(rows) {
  if(!rows||!rows.length) return ['month_hrs','standard','learning_objective','teaching_strategies','materials_resources','assignments','method_of_evaluation'];
  return [_pickKey(rows,'month_hrs','month___hrs'),'standard','learning_objective','teaching_strategies',
          _pickKey(rows,'materials_resources','materials___resources'),'assignments','method_of_evaluation'];
}
function _expandTable(table,rows,keys) {
  var tplRow=table.getRow(1);
  if(!rows||!rows.length){ for(var c=0;c<tplRow.getNumCells();c++) tplRow.getCell(c).setText('\u2014'); return; }
  var alignments=[];
  for(var ci=0;ci<tplRow.getNumCells();ci++){
    try{
      var cell=tplRow.getCell(ci); var nc=cell.getNumChildren();
      var align=DocumentApp.HorizontalAlignment.LEFT;
      if(nc>0){ var ch=cell.getChild(0); if(ch.getType()===DocumentApp.ElementType.PARAGRAPH) align=ch.asParagraph().getAlignment()||align; }
      alignments.push(align);
    }catch(e){ alignments.push(DocumentApp.HorizontalAlignment.LEFT); }
  }
  rows.forEach(function(rowData,ri){
    var newRow;
    if(ri===0){ newRow=tplRow; } else { newRow=table.appendTableRow(); while(newRow.getNumCells()<tplRow.getNumCells()) newRow.appendTableCell(); }
    keys.forEach(function(k,ki){
      if(ki<newRow.getNumCells()){
        var cell=newRow.getCell(ki); cell.setText(String(rowData[k]||''));
        try{ var nc=cell.getNumChildren(); if(nc>0){ var ch=cell.getChild(0); if(ch.getType()===DocumentApp.ElementType.PARAGRAPH) ch.asParagraph().setAlignment(alignments[ki]); } }catch(e){}
      }
    });
  });
}


// ── DEPT CONFIG TAB (_dept_config in Roles sheet) ─────────────────────────
// Columns: name | sheetId | archived | displayName | emoji
// This tab drives all runtime department lookups, supporting renames/adds.

function _getDeptConfigTab() {
  var ss  = SpreadsheetApp.openById(CONFIG.ROLES_SHEET_ID);
  var tab = ss.getSheetByName('_dept_config');
  if (!tab) {
    // Bootstrap from hardcoded CONFIG on first access
    tab = ss.insertSheet('_dept_config');
    tab.appendRow(['name','sheetId','archived','displayName','emoji','gradeOrder','gradesCache']);
    Object.keys(CONFIG.DEPARTMENT_SHEETS).forEach(function(name) {
      tab.appendRow([name, CONFIG.DEPARTMENT_SHEETS[name], 'false', name, CONFIG.DEPT_ICONS[name]||'📁']);
    });
    tab.getRange(1,1,1,5).setBackground('#0f1923').setFontColor('#ffffff').setFontWeight('bold');
  }
  return tab;
}

function _loadDeptConfig() {
  var tab  = _getDeptConfigTab();
  var last = tab.getLastRow();
  if (last < 2) return [];
  var rows = tab.getRange(2,1,last-1,5).getValues();
  return rows.filter(function(r){ return String(r[0]).trim(); }).map(function(r){
    return {
      name:        String(r[0]).trim(),
      sheetId:     String(r[1]).trim(),
      archived:    String(r[2]).trim() === 'true',
      displayName: String(r[3]).trim() || String(r[0]).trim(),
      emoji:       String(r[4]).trim() || '📁',
      gradeOrder:  r[5] ? String(r[5]).split(',').map(function(g){return g.trim();}).filter(Boolean) : [],
      gradesCache: r[6] ? String(r[6]).split(',').map(function(g){return g.trim();}).filter(Boolean) : []
    };
  });
}

function _saveDeptConfig(entries) {
  var tab = _getDeptConfigTab();
  tab.clearContents();
  var rows = [['name','sheetId','archived','displayName','emoji']];
  entries.forEach(function(e){
    rows.push([e.name, e.sheetId, e.archived?'true':'false', e.displayName||e.name, e.emoji||'📁', (e.gradeOrder||[]).join(','), (e.gradesCache||[]).join(',')]);
  });
  tab.getRange(1,1,rows.length,5).setValues(rows);
  tab.getRange(1,1,1,5).setBackground('#0f1923').setFontColor('#ffffff').setFontWeight('bold');
}

function getDeptConfig(user) {
  if (!user.isAdmin) return permissionError();
  try {
    var depts = _loadDeptConfig();
    // If _dept_config is empty/missing, fall back to hardcoded CONFIG so the page always renders
    if (!depts || !depts.length) {
      depts = Object.keys(CONFIG.DEPARTMENT_SHEETS).map(function(name) {
        return { name:name, sheetId:CONFIG.DEPARTMENT_SHEETS[name], archived:false,
                 displayName:name, emoji:CONFIG.DEPT_ICONS[name]||'📁',
                 gradeOrder:[], gradesCache:[] };
      });
    }
    return { success: true, depts: depts };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── GRADE MANAGEMENT ──────────────────────────────────────────────────────
function addGrade(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept      = payload.department;
  var gradeName = (payload.grade || '').trim();
  if (!gradeName) return { success: false, error: 'Grade name is required.' };
  try {
    var ss = _getDeptSpreadsheet(dept);
    if (ss.getSheetByName(gradeName)) return { success: false, error: '"' + gradeName + '" already exists.' };
    var sh = ss.insertSheet(gradeName);
    writeBlankCurriculum(sh, dept, gradeName);
    // Refresh grades cache
    var allTabs = ss.getSheets().map(function(s){return s.getName();}).filter(function(n){return n.charAt(0)!=='_';});
    _updateDeptGradesCache(dept, allTabs);
    return { success: true, grade: gradeName };
  } catch(e) { return { success: false, error: e.message }; }
}

function removeGrade(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept      = payload.department;
  var gradeName = payload.grade;
  if ((payload.email||'').toLowerCase().trim() !== user.email) return { success: false, error: 'Email confirmation failed.' };
  try {
    var ss = _getDeptSpreadsheet(dept);
    var sh = ss.getSheetByName(gradeName);
    if (!sh) return { success: false, error: 'Grade tab not found: ' + gradeName };
    // Archive to _archived_GRADENAME tab within same sheet
    var archiveName = '_archived_' + gradeName + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
    sh.setName(archiveName);
    return { success: true, archivedAs: archiveName };
  } catch(e) { return { success: false, error: e.message }; }
}

function renameGrade(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept    = payload.department;
  var oldName = payload.oldName;
  var newName = (payload.newName || '').trim();
  if (!newName) return { success: false, error: 'New grade name is required.' };
  try {
    var ss = _getDeptSpreadsheet(dept);
    var sh = ss.getSheetByName(oldName);
    if (!sh) return { success: false, error: 'Grade tab not found: ' + oldName };
    if (ss.getSheetByName(newName)) return { success: false, error: '"' + newName + '" already exists.' };
    sh.setName(newName);
    // Refresh grades cache with new name
    var allTabs = ss.getSheetByName ? ss.getSheets().map(function(s){return s.getName();}).filter(function(n){return n.charAt(0)!=='_';}) : [];
    var ss2 = _getDeptSpreadsheet(dept);
    var tabs2 = ss2.getSheets().map(function(s){return s.getName();}).filter(function(n){return n.charAt(0)!=='_';});
    _updateDeptGradesCache(dept, tabs2);
    return { success: true, newName: newName };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── DEPARTMENT MANAGEMENT ─────────────────────────────────────────────────
function renameDept(payload, user) {
  if (!user.isAdmin) return permissionError();
  var oldName = payload.oldName;
  var newName = (payload.newName || '').trim();
  if (!newName) return { success: false, error: 'New department name is required.' };
  try {
    var entries = _loadDeptConfig();
    var found   = false;
    entries = entries.map(function(e) {
      if (e.name === oldName) {
        found = true;
        // Rename the Google Spreadsheet too
        try { SpreadsheetApp.openById(e.sheetId).rename('CurriMan — ' + newName); } catch(ex) {}
        return { name: newName, sheetId: e.sheetId, archived: e.archived,
                 displayName: newName, emoji: CONFIG.DEPT_ICONS[newName] || e.emoji || '📁' };
      }
      return e;
    });
    if (!found) return { success: false, error: 'Department not found: ' + oldName };
    _saveDeptConfig(entries);
    return { success: true, newName: newName };
  } catch(e) { return { success: false, error: e.message }; }
}

function archiveDept(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept = payload.department;
  if ((payload.email||'').toLowerCase().trim() !== user.email) return { success: false, error: 'Email confirmation failed.' };
  try {
    var entries = _loadDeptConfig();
    var found   = false;
    entries = entries.map(function(e) {
      if (e.name === dept) {
        found = true;
        // Move spreadsheet to archive folder
        try {
          var file         = DriveApp.getFileById(e.sheetId);
          var archiveFolder = DriveApp.getFolderById(CONFIG.DEPT_ARCHIVE_FOLDER_ID);
          archiveFolder.addFile(file);
          // Remove from current parent folders
          var parents = file.getParents();
          while (parents.hasNext()) {
            var p = parents.next();
            if (p.getId() !== CONFIG.DEPT_ARCHIVE_FOLDER_ID) {
              try { p.removeFile(file); } catch(ex) {}
            }
          }
        } catch(ex) { console.error('archiveDept move:', ex.message); }
        return { name: e.name, sheetId: e.sheetId, archived: true, displayName: e.displayName, emoji: e.emoji };
      }
      return e;
    });
    if (!found) return { success: false, error: 'Department not found: ' + dept };
    _saveDeptConfig(entries);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function restoreDept(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept = payload.department;
  try {
    var entries = _loadDeptConfig();
    var found   = false;
    entries = entries.map(function(e) {
      if (e.name === dept && e.archived) {
        found = true;
        // Move spreadsheet back to parent folder
        try {
          var file         = DriveApp.getFileById(e.sheetId);
          var parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
          parentFolder.addFile(file);
          try { DriveApp.getFolderById(CONFIG.DEPT_ARCHIVE_FOLDER_ID).removeFile(file); } catch(ex) {}
        } catch(ex) { console.error('restoreDept move:', ex.message); }
        return { name: e.name, sheetId: e.sheetId, archived: false, displayName: e.displayName, emoji: e.emoji };
      }
      return e;
    });
    if (!found) return { success: false, error: 'Archived department not found: ' + dept };
    _saveDeptConfig(entries);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}


// ── ARCHIVED GRADE MANAGEMENT ─────────────────────────────────────────────
function getArchivedGrades(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept = payload.department;
  try {
    var ss   = _getDeptSpreadsheet(dept);
    var tabs = ss.getSheets().map(function(s){ return s.getName(); });
    var now  = new Date().getTime();
    var archived = [], trashed = [];
    tabs.forEach(function(name) {
      if (name.indexOf('_archived_') === 0) {
        var gradeName = name.replace(/^_archived_/, '').replace(/_\d{8}$/, '');
        archived.push({ tabName: name, gradeName: gradeName, type: 'archived' });
      } else if (name.indexOf('_trash_') === 0) {
        // _trash_GRADENAME_TIMESTAMP
        var parts     = name.split('_');
        var ts        = parseInt(parts[parts.length - 1]) || 0;
        var daysOld   = ts ? Math.floor((now - ts) / 86400000) : 999;
        var gradeName = name.replace(/^_trash_/, '').replace(/_\d+$/, '');
        trashed.push({ tabName: name, gradeName: gradeName, type: 'trash',
                       daysOld: daysOld, eligibleDelete: daysOld >= 30 });
      }
    });
    return { success: true, archived: archived, trashed: trashed };
  } catch(e) { return { success: false, error: e.message }; }
}

function restoreGrade(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept    = payload.department;
  var tabName = payload.tabName;  // the _archived_... tab name
  var newName = (payload.newName || '').trim();
  try {
    var ss = _getDeptSpreadsheet(dept);
    var sh = ss.getSheetByName(tabName);
    if (!sh) return { success: false, error: 'Tab not found: ' + tabName };
    // Default restore name: strip prefix and date suffix
    if (!newName) {
      newName = tabName.replace(/^_archived_/, '').replace(/_\d{8}$/, '');
      newName = newName.replace(/^_trash_/, '').replace(/_\d+$/, '');
    }
    // Avoid name collision
    var finalName = newName;
    var n = 1;
    while (ss.getSheetByName(finalName)) { finalName = newName + ' (' + n++ + ')'; }
    sh.setName(finalName);
    return { success: true, restoredAs: finalName };
  } catch(e) { return { success: false, error: e.message }; }
}

function trashGrade(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept    = payload.department;
  var tabName = payload.tabName;
  try {
    var ss = _getDeptSpreadsheet(dept);
    var sh = ss.getSheetByName(tabName);
    if (!sh) return { success: false, error: 'Tab not found: ' + tabName };
    var gradeName = tabName.replace(/^_archived_/, '').replace(/_\d{8}$/, '');
    var trashName = '_trash_' + gradeName + '_' + new Date().getTime();
    sh.setName(trashName);
    return { success: true, trashedAs: trashName };
  } catch(e) { return { success: false, error: e.message }; }
}

function deleteGradePermanently(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept    = payload.department;
  var tabName = payload.tabName;
  if ((payload.email||'').toLowerCase().trim() !== user.email) return { success: false, error: 'Email confirmation failed.' };
  try {
    var ss = _getDeptSpreadsheet(dept);
    var sh = ss.getSheetByName(tabName);
    if (!sh) return { success: false, error: 'Tab not found: ' + tabName };
    ss.deleteSheet(sh);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

function reorderGrades(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept  = payload.department;
  var order = payload.order || [];  // array of grade names in new order
  try {
    var entries = _loadDeptConfig();
    entries = entries.map(function(e) {
      if (e.name === dept) {
        e.gradeOrder = order;
      }
      return e;
    });
    _saveDeptConfig(entries);
    // Also reorder the actual sheet tabs to match
    try {
      var ss = _getDeptSpreadsheet(dept);
      order.forEach(function(gradeName, idx) {
        var sh = ss.getSheetByName(gradeName);
        if (sh) ss.setActiveSheet(sh);
        if (sh) ss.moveActiveSheet(idx + 1);
      });
    } catch(ex) { /* tab reorder is cosmetic — don't fail */ }
    // Update grades cache with new order
    _updateDeptGradesCache(dept, order);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── ELECTIVE RENAME ───────────────────────────────────────────────────────
function renameElective(payload, user) {
  if (!user.isAdmin) return permissionError();
  var oldName = payload.oldName;
  var newName = (payload.newName || '').trim();
  if (!newName) return { success: false, error: 'New name is required.' };
  try {
    var ss = SpreadsheetApp.openById(CONFIG.ELECTIVES_SHEET_ID);
    var sh = ss.getSheetByName(oldName);
    if (!sh) return { success: false, error: 'Elective not found: ' + oldName };
    if (ss.getSheetByName(newName)) return { success: false, error: '"' + newName + '" already exists.' };
    sh.setName(newName);
    return { success: true, newName: newName };
  } catch(e) { return { success: false, error: e.message }; }
}


// ── UPDATE GRADES CACHE in _dept_config ──────────────────────────────────
// Called after any grade add/remove/rename/reorder to keep the cache fresh.
function _updateDeptGradesCache(deptName, grades) {
  try {
    var entries = _loadDeptConfig();
    entries = entries.map(function(e) {
      if (e.name === deptName) {
        e.gradesCache = grades;
        if (!e.gradeOrder || !e.gradeOrder.length) e.gradeOrder = grades;
      }
      return e;
    });
    _saveDeptConfig(entries);
  } catch(ex) { console.error('_updateDeptGradesCache:', ex.message); }
}

function updateDeptEmoji(payload, user) {
  if (!user.isAdmin) return permissionError();
  var dept  = payload.dept || payload.department;
  var emoji = (payload.emoji || '').trim();
  if (!emoji) return { success: false, error: 'Emoji is required.' };
  try {
    var entries = _loadDeptConfig();
    var found   = false;
    entries = entries.map(function(e) {
      if (e.name === dept) { found = true; e.emoji = emoji; }
      return e;
    });
    if (!found) return { success: false, error: 'Department not found: ' + dept };
    _saveDeptConfig(entries);
    return { success: true, emoji: emoji };
  } catch(e) { return { success: false, error: e.message }; }
}

// ── INIT _dept_config from current CONFIG (run once after upgrade) ─────────
function initDeptConfig() {
  Logger.log('Bootstrapping _dept_config from hardcoded CONFIG...');
  var tab = _getDeptConfigTab(); // this auto-bootstraps
  Logger.log('_dept_config tab ready with ' + (tab.getLastRow()-1) + ' departments.');
}

// ── REBUILD GRADES CACHE ──────────────────────────────────────────────────

function rebuildGradesCache() {
  Logger.log('=== rebuildGradesCache START ===');
  var entries = _loadDeptConfig();
  entries.forEach(function(e) {
    if (e.archived) { Logger.log('SKIP (archived): ' + e.name); return; }
    try {
      var ss   = SpreadsheetApp.openById(e.sheetId);
      var tabs = ss.getSheets()
        .map(function(s){ return s.getName(); })
        .filter(function(n){ return n.charAt(0) !== '_'; });
      e.gradesCache = tabs;
      if (!e.gradeOrder || !e.gradeOrder.length) e.gradeOrder = tabs;
      Logger.log(e.name + ': ' + tabs.join(', '));
    } catch(ex) {
      Logger.log('ERROR — ' + e.name + ': ' + ex.message);
    }
  });
  _saveDeptConfig(entries);
  Logger.log('=== rebuildGradesCache COMPLETE ===');
  Logger.log('getInitialData will now load instantly from cache.');
}

// ── ONE-TIME PROJECT SETUP ────────────────────────────────────────────────
// Run this ONCE from the Apps Script editor after pasting the code.
// It will create all required spreadsheets in your sandbox folder,
// log the generated IDs, and print instructions to update CONFIG.
function initProject() {
  Logger.log('=== CurriMan initProject START ===');

  // Get or create the CurriMan subfolder inside the sandbox folder
  // Sandbox folder: https://drive.google.com/drive/folders/1OyU_MenkNYd8tOHDpWVLwDQAZdS3qx0F
  var parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  var folders = parentFolder.getFoldersByName('CurriMan');
  var currimanFolder = folders.hasNext() ? folders.next() : parentFolder.createFolder('CurriMan');
  Logger.log('CurriMan folder: ' + currimanFolder.getUrl());

  // Create Roles sheet
  var rolesFile = _createSheet('CurriMan — Roles', currimanFolder);
  var rolesSs   = SpreadsheetApp.openById(rolesFile.getId());
  var rolesSh   = rolesSs.getSheetByName('Sheet1') || rolesSs.insertSheet('Sheet1');
  rolesSh.setName('Roles');
  rolesSh.getRange(1,1,1,4).setValues([['Email','Role','Department','Grade / Course']]);
  rolesSh.getRange(1,1,1,4).setBackground('#0f1923').setFontColor('#ffffff').setFontWeight('bold');
  Logger.log('ROLES_SHEET_ID: "' + rolesFile.getId() + '"');

  // Create Electives sheet
  var electivesFile = _createSheet('CurriMan — Electives', currimanFolder);
  Logger.log('ELECTIVES_SHEET_ID: "' + electivesFile.getId() + '"');

  // Create Electives Archive sheet
  var electivesArchFile = _createSheet('CurriMan — Electives Archive', currimanFolder);
  Logger.log('ELECTIVES_ARCHIVE_SHEET_ID: "' + electivesArchFile.getId() + '"');

  // Create department sheets
  var depts = ['Computer','Mathematics','English','Science','French','SS English','Arabic'];
  var deptIds = {};
  depts.forEach(function(dept) {
    var file = _createSheet('CurriMan — ' + dept, currimanFolder);
    var ss   = SpreadsheetApp.openById(file.getId());
    CONFIG.GRADES.forEach(function(grade) {
      var sh = ss.getSheetByName(grade) || ss.insertSheet(grade);
      writeBlankCurriculum(sh, dept, grade);
    });
    try { var d = ss.getSheetByName('Sheet1'); if(d) ss.deleteSheet(d); } catch(e) {}
    deptIds[dept] = file.getId();
    Logger.log('DEPARTMENT_SHEETS["' + dept + '"]: "' + file.getId() + '"');
  });

  // Print summary for copy-paste into CONFIG
  Logger.log('\n=== COPY THE FOLLOWING INTO CONFIG ===');
  Logger.log('ROLES_SHEET_ID: "' + rolesFile.getId() + '",');
  Logger.log('ELECTIVES_SHEET_ID: "' + electivesFile.getId() + '",');
  Logger.log('ELECTIVES_ARCHIVE_SHEET_ID: "' + electivesArchFile.getId() + '",');
  Logger.log('DEPARTMENT_SHEETS: {');
  depts.forEach(function(d){ Logger.log('  "' + d + '": "' + deptIds[d] + '",'); });
  Logger.log('}');
  Logger.log('=== initProject COMPLETE ===');
  Logger.log('Next steps:');
  Logger.log('1. Copy the IDs above into CONFIG in Code.gs');
  Logger.log('2. Deploy as Web App (Execute as: Me, Anyone with access)');
  Logger.log('3. Open the /exec URL and click Allow on the consent screen');
  Logger.log('4. Add your first Admin in the Roles sheet');
}

function _createSheet(name, folder) {
  // Check if sheet already exists in folder
  var files = folder.getFilesByName(name);
  if (files.hasNext()) {
    Logger.log('(existing) ' + name);
    return files.next();
  }
  var ss   = SpreadsheetApp.create(name);
  var file = DriveApp.getFileById(ss.getId());
  // Move to CurriMan folder (remove from root)
  folder.addFile(file);
  try { DriveApp.getRootFolder().removeFile(file); } catch(e) {}
  Logger.log('(created) ' + name + ' — ' + file.getId());
  return file;
}

// ── INIT ALL DEPTS ────────────────────────────────────────────────────────
// Run this once to populate all grade tabs in all department sheets.
// Safe to run multiple times — skips tabs that already have data.
function initAllDepts() {
  Logger.log('=== initAllDepts START ===');
  var depts = Object.keys(CONFIG.DEPARTMENT_SHEETS);
  depts.forEach(function(dept) {
    var id = CONFIG.DEPARTMENT_SHEETS[dept];
    if (!id || id.length < 10) { Logger.log('SKIP (no ID): ' + dept); return; }
    try {
      var ss = SpreadsheetApp.openById(id);
      var created = 0, skipped = 0;
      CONFIG.GRADES.forEach(function(grade) {
        var sh = ss.getSheetByName(grade);
        if (!sh) {
          sh = ss.insertSheet(grade);
          writeBlankCurriculum(sh, dept, grade);
          created++;
        } else if (sh.getLastRow() === 0) {
          writeBlankCurriculum(sh, dept, grade);
          created++;
        } else {
          skipped++;
        }
      });
      try { var def = ss.getSheetByName('Sheet1'); if (def) ss.deleteSheet(def); } catch(e) {}
      Logger.log(dept + ': ' + created + ' created, ' + skipped + ' already existed');
    } catch(e) {
      Logger.log('ERROR — ' + dept + ': ' + e.message);
    }
  });
  Logger.log('=== initAllDepts COMPLETE — refresh the app ===');
}