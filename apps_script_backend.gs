/**
 * ============================================================
 * 「모두의 아이디어」 TOP 100 Summit 사전 설문 — 백엔드  v2
 * Google Apps Script Web App  +  Google Spreadsheet
 * ------------------------------------------------------------
 * v2 변경 (2026-05-28)
 *   - 분야는 URL 파라미터(?type=tech | ?type=policy)로 결정
 *   - 한 시트에 기술/정책 응답이 함께 저장되며, '분야' 컬럼으로 필터
 *   - 컬럼 단순화: 아이디어 ID·운영원칙·불참 사유 삭제, 검증 방법 체크박스화
 * ------------------------------------------------------------
 * 사용 방법 (운영 확정값 이미 박힘 · 그대로 복붙 후 배포만)
 *   1) https://script.google.com/ 새 프로젝트 생성
 *   2) 본 파일 내용을 코드 편집기에 그대로 붙여넣기 (Ctrl+S 저장)
 *   3) (선택) runSetup 함수 ▶ 실행 → 권한 동의 → 시트 헤더 자동 생성 확인
 *   4) 배포(Deploy) → 새 배포(New deployment)
 *      유형: 웹 앱(Web app)
 *      다음 사용자로 실행: 나(본인 계정)
 *      액세스 권한: 모든 사용자(Anyone)
 *   5) 배포 후 "웹 앱 URL"을 복사하여
 *      survey.html 의 APPS_SCRIPT_ENDPOINT 변수에 붙여넣기
 * ============================================================
 */

// ====== 설정 (운영 확정값 박힘 · 2026-05-28) ======
//   ─ 스프레드시트 파일명: [2026 TOP100 Summit] 사전설문 응답
//   ─ 시트(탭) 이름은 '응답' 으로 자동 생성됩니다 (코드가 처리)
//   ─ 응답 알림 메일: gpt@rnbdp.com
const SHEET_ID    = '1WTT1kNAzQwegwVmOULtP5COon1gmBdCcXQ_pZbD5_N8';
const SHEET_NAME  = '응답';
const ADMIN_EMAIL = 'gpt@rnbdp.com';
// ==================================================

// 시트 컬럼 (순서 고정 — 변경 시 ensureHeaders 와 buildRow 동시 수정)
const COLUMNS = [
  '번호',
  '제출일시(KST)',
  '분야',
  '개인정보 동의',
  '성명',
  '연락처',
  '이메일',
  '참석 여부',
  '이해도 [전문성]',
  '이해도 [보충자료]',
  '이해도 [의견수렴·실증]',
  '희망 검증 방법 (복수)',
  '검증 방법 (기타 직접 입력)',
  '지원 가능 부분 (주관식)',
  'UserAgent',
  'Language'
];

const VALID_PARTS = ['기술 분야 (Technology)', '정책 분야 (Policy)'];
const VALID_LIKERT = ['그렇지 않다', '보통이다', '그렇다'];
const VALID_ATTEND = ['참석', '불참'];

/* ---------- doGet : 헬스체크 ---------- */
function doGet(e) {
  const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
    '<title>모두의 아이디어 설문 API</title>' +
    '<style>body{font-family:-apple-system,"Malgun Gothic",sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1A1A1A;line-height:1.6}' +
    'h1{font-size:20px;border-bottom:2px solid #E5197C;padding-bottom:8px}' +
    'code{background:#F7F4F0;padding:2px 6px;font-size:13px}</style></head><body>' +
    '<h1>「모두의 아이디어」 TOP 100 Summit 사전 설문 API</h1>' +
    '<p>본 URL은 설문 응답을 받는 백엔드 엔드포인트입니다.<br>' +
    '직접 접근하셨다면 정상입니다. 설문 응답은 설문 페이지에서 진행해 주세요.</p>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

/* ---------- doPost : 응답 저장 ---------- */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: '요청 본문이 비어 있습니다.' });
    }

    let p;
    try { p = JSON.parse(e.postData.contents); }
    catch (err) { return jsonResponse({ ok: false, error: '요청 본문 JSON 파싱 실패: ' + err.message }); }

    // ---- 서버 측 검증 ----
    if (!p.consent || String(p.consent).trim() === '') return jsonResponse({ ok:false, error:'동의 여부가 누락되었습니다.' });
    if (p.consent !== '동의함') return jsonResponse({ ok:false, error:'개인정보 수집·이용 동의가 필요합니다.' });

    if (VALID_PARTS.indexOf(p.part) === -1) return jsonResponse({ ok:false, error:'분야 값이 올바르지 않습니다.' });

    if (!p.name || !String(p.name).trim()) return jsonResponse({ ok:false, error:'성명이 누락되었습니다.' });
    if (!p.phone || !String(p.phone).trim()) return jsonResponse({ ok:false, error:'연락처가 누락되었습니다.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email || ''))) return jsonResponse({ ok:false, error:'이메일 형식이 올바르지 않습니다.' });

    if (VALID_ATTEND.indexOf(p.attend) === -1) return jsonResponse({ ok:false, error:'참석 여부 값이 올바르지 않습니다.' });

    ['q3_1','q3_2','q3_3'].forEach(function(){}); // keep iteration variable scoping safe in older runtimes
    for (var i = 0; i < 3; i++) {
      var key = ['q3_1','q3_2','q3_3'][i];
      if (VALID_LIKERT.indexOf(p[key]) === -1) {
        return jsonResponse({ ok:false, error:'이해도 응답 ('+key+') 값이 올바르지 않습니다.' });
      }
    }

    if (!p.q4_methods || !String(p.q4_methods).trim()) return jsonResponse({ ok:false, error:'검증 방법을 하나 이상 선택해 주세요.' });
    // '기타' 선택 시 입력값 필수
    if (String(p.q4_methods).split(',').map(function(s){return s.trim();}).indexOf('기타') !== -1) {
      if (!p.q4_methods_other || !String(p.q4_methods_other).trim()) {
        return jsonResponse({ ok:false, error:'\'기타\' 선택 시 검증 방식을 직접 입력해 주세요.' });
      }
    }

    if (!p.q4_2 || !String(p.q4_2).trim()) return jsonResponse({ ok:false, error:'지원 가능한 부분을 작성해 주세요.' });

    // ---- 저장 (동시성 보호) ----
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);

    var savedNo;
    try {
      var sheet = getOrCreateSheet();
      ensureHeaders(sheet);
      var nextNo = sheet.getLastRow();
      sheet.appendRow(buildRow(nextNo, p));

      // 텍스트 셀이 숫자/날짜로 인식되지 않도록 (연락처)
      var r = sheet.getLastRow();
      sheet.getRange(r, 6).setNumberFormat('@');  // 연락처
      savedNo = nextNo;

      if (ADMIN_EMAIL) {
        try {
          MailApp.sendEmail({
            to: ADMIN_EMAIL,
            subject: '[모두의 아이디어 사전설문] 신규 응답 #' + nextNo + ' / ' + p.part + ' / ' + p.name,
            body:
              '신규 응답이 접수되었습니다.\n\n' +
              '번호: #' + nextNo + '\n' +
              '분야: ' + p.part + '\n' +
              '성명: ' + p.name + '\n' +
              '참석 여부: ' + p.attend + '\n\n' +
              '응답 시트에서 전체 내용을 확인해 주세요.\n' +
              'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit'
          });
        } catch (mailErr) {
          console.warn('관리자 알림 메일 전송 실패: ' + mailErr.message);
        }
      }
    } finally {
      lock.releaseLock();
    }

    return jsonResponse({ ok:true, no: savedNo });

  } catch (err) {
    console.error(err);
    return jsonResponse({ ok:false, error: '서버 내부 오류: ' + (err && err.message ? err.message : err) });
  }
}

/* -------------------- 내부 유틸 -------------------- */

function getOrCreateSheet() {
  if (!SHEET_ID || SHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
    throw new Error('SHEET_ID 가 설정되지 않았습니다. 코드 상단의 SHEET_ID 상수를 본인의 스프레드시트 ID로 교체해 주세요.');
  }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#1A1A1A')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 60);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 110);
    sheet.setColumnWidth(4, 110);
    sheet.setColumnWidth(5, 100);
    sheet.setColumnWidth(6, 130);
    sheet.setColumnWidth(7, 200);
    sheet.setColumnWidth(8, 90);                                  // 참석 여부
    for (var c = 9; c <= 11; c++) sheet.setColumnWidth(c, 130);   // 이해도 3컬럼
    sheet.setColumnWidth(12, 300);  // 검증 방법(복수)
    sheet.setColumnWidth(13, 220);  // 검증 방법 기타
    sheet.setColumnWidth(14, 360);  // 지원 가능 부분
    sheet.setColumnWidth(15, 200);  // UserAgent
    sheet.setColumnWidth(16, 80);   // Language
  }
}

function buildRow(no, p) {
  var tz = 'Asia/Seoul';
  var submittedAt = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  return [
    no,
    submittedAt,
    p.part || '',
    p.consent || '',
    p.name || '',
    p.phone || '',
    p.email || '',
    p.attend || '',
    p.q3_1 || '',
    p.q3_2 || '',
    p.q3_3 || '',
    p.q4_methods || '',
    p.q4_methods_other || '',
    p.q4_2 || '',
    p._userAgent || '',
    p._lang || ''
  ];
}

function jsonResponse(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

/**
 * 수동 테스트: Apps Script 편집기에서 이 함수를 한 번 실행해
 * SHEET_ID 가 유효하고 권한이 부여되는지 확인할 수 있습니다.
 */
function runSetup() {
  var sheet = getOrCreateSheet();
  ensureHeaders(sheet);
  console.log('Setup OK — 시트: ' + sheet.getName() + ', 행: ' + sheet.getLastRow());
}


/**
 * 진단: 스프레드시트 상태 한 번에 점검
 * ─ '응답' 탭이 존재하는지, 헤더가 박혔는지, 어떤 컬럼이 있는지 콘솔에 출력
 * ─ 헤더가 없는 상태로 발견되면 자동으로 생성합니다.
 *
 * 사용 방법
 *   1) Apps Script 편집기에서 함수 선택창 → checkSheetStatus 선택
 *   2) ▶ 실행
 *   3) 하단 '실행 로그' 패널에서 결과 확인
 */
function checkSheetStatus() {
  if (!SHEET_ID || SHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
    console.log('❌ SHEET_ID 가 설정되지 않았습니다.');
    return;
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } catch (e) {
    console.log('❌ 스프레드시트를 열 수 없습니다: ' + e.message);
    console.log('   SHEET_ID 가 올바른지, 접근 권한이 있는지 확인하세요.');
    return;
  }

  console.log('📂 스프레드시트: ' + ss.getName());
  console.log('🔑 SHEET_ID: ' + SHEET_ID);
  console.log('');
  console.log('— 탭 목록 —');
  var sheets = ss.getSheets();
  sheets.forEach(function(s){
    var mark = s.getName() === SHEET_NAME ? '  ★' : '   ';
    console.log(mark + ' ' + s.getName() + '  (행: ' + s.getLastRow() + ', 열: ' + s.getLastColumn() + ')');
  });
  console.log('');

  var target = ss.getSheetByName(SHEET_NAME);
  if (!target) {
    console.log('⚠ \'' + SHEET_NAME + '\' 탭이 아직 없습니다. 자동 생성합니다…');
    target = ss.insertSheet(SHEET_NAME);
  }

  var last = target.getLastRow();
  if (last === 0) {
    console.log('⚠ \'' + SHEET_NAME + '\' 탭이 비어 있습니다. 헤더를 자동 생성합니다…');
    ensureHeaders(target);
    last = target.getLastRow();
  }

  console.log('✅ \'' + SHEET_NAME + '\' 탭 정상');
  console.log('   행 수: ' + last + ' (헤더 1행 + 응답 ' + (last - 1) + '건)');
  console.log('');
  console.log('— 헤더 16개 —');
  var headers = target.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  headers.forEach(function(h, i){
    var col = String.fromCharCode(65 + i);
    var expected = COLUMNS[i];
    var ok = (h === expected) ? '✓' : '✗ (예상: ' + expected + ')';
    console.log('   ' + col + '열  ' + h + '  ' + ok);
  });

  console.log('');
  console.log('📋 결론');
  if (last >= 1 && headers.join('|') === COLUMNS.join('|')) {
    console.log('   ✅ 시트 세팅 완료. 응답을 받을 준비가 됐습니다.');
    console.log('   응답이 들어오면 ' + SHEET_NAME + ' 탭 2행부터 자동으로 채워집니다.');
  } else {
    console.log('   ⚠ 헤더가 예상과 다릅니다. runSetup() 을 한 번 더 실행해 보세요.');
  }
}


/* ============================================================
 *  운영 보조 함수 (Apps Script 편집기에서 직접 실행)
 *  ─ 비개발자가 함수명만 선택하고 ▶ 실행하면 동작
 * ============================================================ */

/**
 * 테스트 응답 일괄 삭제
 * ─ '성명' 컬럼이 다음 단어 중 하나로 시작하는 행을 삭제합니다.
 *   ['테스트', 'test', 'TEST', 'Test', '테스']
 * ─ 또는 이메일이 'example' 을 포함하는 행도 삭제합니다.
 * ─ 실제 응답은 절대 건드리지 않도록 화이트리스트 방식으로 동작합니다.
 */
function deleteTestRows() {
  var sheet = getOrCreateSheet();
  var last = sheet.getLastRow();
  if (last <= 1) { console.log('응답이 없습니다.'); return; }

  var range = sheet.getRange(2, 1, last - 1, COLUMNS.length);
  var values = range.getValues();
  var nameCol = COLUMNS.indexOf('성명');
  var emailCol = COLUMNS.indexOf('이메일');
  var testPrefixes = ['테스트', 'test', 'TEST', 'Test', '테스'];

  var deleted = 0;
  // 뒤에서부터 삭제 (인덱스 안 꼬이게)
  for (var i = values.length - 1; i >= 0; i--) {
    var n = String(values[i][nameCol] || '');
    var e = String(values[i][emailCol] || '').toLowerCase();
    var isTest = false;
    for (var j = 0; j < testPrefixes.length; j++) {
      if (n.indexOf(testPrefixes[j]) === 0) { isTest = true; break; }
    }
    if (!isTest && e.indexOf('example') !== -1) isTest = true;
    if (isTest) {
      sheet.deleteRow(i + 2);  // +2: 헤더 1행 + 1-based
      deleted++;
    }
  }
  console.log('테스트 응답 ' + deleted + '건 삭제 완료. 남은 응답: ' + (sheet.getLastRow() - 1) + '건');
}


/**
 * 응답 요약 통계 출력
 * ─ 콘솔에 기술/정책 응답 수, 참석률, 동의률, 척도 분포, 검증 방법 선호도 출력
 * ─ 시트 내용은 변경하지 않습니다 (읽기 전용)
 */
function printSummary() {
  var sheet = getOrCreateSheet();
  var last = sheet.getLastRow();
  if (last <= 1) { console.log('응답이 없습니다.'); return; }

  var values = sheet.getRange(2, 1, last - 1, COLUMNS.length).getValues();
  var col = function(name) { return COLUMNS.indexOf(name); };

  var n = values.length;
  var byPart = {};
  var byAttend = {};
  var byConsent = {};
  var likertSum = { 'q3_1': {}, 'q3_2': {}, 'q3_3': {} };
  var methodCount = {};

  for (var i = 0; i < n; i++) {
    var v = values[i];
    var part = v[col('분야')]; byPart[part] = (byPart[part] || 0) + 1;
    var att = v[col('참석 여부')]; byAttend[att] = (byAttend[att] || 0) + 1;
    var con = v[col('개인정보 동의')]; byConsent[con] = (byConsent[con] || 0) + 1;
    ['이해도 [전문성]', '이해도 [보충자료]', '이해도 [의견수렴·실증]'].forEach(function(qName, idx){
      var key = 'q3_' + (idx + 1);
      var val = v[col(qName)];
      likertSum[key][val] = (likertSum[key][val] || 0) + 1;
    });
    var methods = String(v[col('희망 검증 방법 (복수)')] || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
    methods.forEach(function(m){ methodCount[m] = (methodCount[m] || 0) + 1; });
  }

  var report = [];
  report.push('═══════════════════════════════════════════════');
  report.push('  사전설문 응답 요약  (' + new Date().toLocaleString('ko-KR') + ')');
  report.push('═══════════════════════════════════════════════');
  report.push('총 응답 수: ' + n + '건');
  report.push('');
  report.push('— 분야별 —');
  Object.keys(byPart).forEach(function(k){ report.push('  ' + k + ': ' + byPart[k] + '건'); });
  report.push('');
  report.push('— 참석 여부 —');
  Object.keys(byAttend).forEach(function(k){ report.push('  ' + k + ': ' + byAttend[k] + '건 (' + (byAttend[k]/n*100).toFixed(1) + '%)'); });
  report.push('');
  report.push('— 동의 여부 —');
  Object.keys(byConsent).forEach(function(k){ report.push('  ' + k + ': ' + byConsent[k] + '건'); });
  report.push('');
  report.push('— 이해도 척도 분포 —');
  ['q3_1', 'q3_2', 'q3_3'].forEach(function(k, idx){
    var labels = ['3-1 전문성', '3-2 보충자료', '3-3 의견수렴·실증'];
    report.push('  ' + labels[idx]);
    ['그렇지 않다', '보통이다', '그렇다'].forEach(function(opt){
      var c = likertSum[k][opt] || 0;
      report.push('    ' + opt + ': ' + c + '건 (' + (c/n*100).toFixed(1) + '%)');
    });
  });
  report.push('');
  report.push('— 희망 검증 방법 (복수 선택) —');
  var sortedMethods = Object.keys(methodCount).sort(function(a,b){return methodCount[b] - methodCount[a];});
  sortedMethods.forEach(function(m){
    report.push('  ' + m + ': ' + methodCount[m] + '건');
  });
  report.push('═══════════════════════════════════════════════');

  console.log(report.join('\n'));
}


/**
 * 응답 시트 백업
 * ─ 현재 응답 시트를 같은 스프레드시트 내에 '응답_백업_YYYYMMDD_HHmm' 시트로 복제
 * ─ 발송 마감 후 / 분석 작업 전에 1회 실행 권장
 */
function backupResponses() {
  var sheet = getOrCreateSheet();
  if (sheet.getLastRow() <= 1) { console.log('응답이 없어 백업이 불필요합니다.'); return; }
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var newName = SHEET_NAME + '_백업_' + stamp;
  var copied = sheet.copyTo(ss);
  copied.setName(newName);
  console.log('백업 완료 → ' + newName + ' (' + (sheet.getLastRow() - 1) + '건)');
}
