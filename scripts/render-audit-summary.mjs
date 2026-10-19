#!/usr/bin/env node
// Render only recorded Lighthouse results; this script never runs an audit.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsRoot = path.join(projectRoot, 'artifacts');
const directoryArgument = process.argv.slice(2).find(value => value.startsWith('--dir='));
const reportDirectory = path.resolve(projectRoot, directoryArgument?.slice('--dir='.length) || 'artifacts/lighthouse');
const relativeDirectory = path.relative(artifactsRoot, reportDirectory);
if (relativeDirectory === '..' || relativeDirectory.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDirectory)) throw new Error('--dir must be inside artifacts');
const summaryFile = path.join(reportDirectory, 'summary.json');
const outputFile = path.join(reportDirectory, 'report.html');
const categories = [
  ['performance', '성능'],
  ['accessibility', '접근성'],
  ['best-practices', '권장사항'],
  ['seo', 'SEO'],
];
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});

function dateLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '기록 없음';
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function reportTarget(value) {
  if (!value) return '';
  const target = path.resolve(projectRoot, value);
  const relative = path.relative(reportDirectory, target);
  // Link only audit artifacts in the same output directory tree.
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return '';
  return target;
}

function reportLink(value) {
  const target = reportTarget(value);
  if (!target) return '';
  const relative = path.relative(reportDirectory, target);
  return relative.split(path.sep).map(encodeURIComponent).join('/');
}

async function generateOfficialReports(entries) {
  const eligible = entries.filter(entry => reportTarget(entry.reportFile) && /\.json$/i.test(entry.reportFile) && fs.existsSync(reportTarget(entry.reportFile)));
  const reports = new Map();
  if (!eligible.length) return reports;
  const generatorFile = path.join(projectRoot, 'artifacts', 'lighthouse-tools', 'node_modules', 'lighthouse', 'report', 'generator', 'report-generator.js');
  const {ReportGenerator} = await import(pathToFileURL(generatorFile).href);
  for (const entry of eligible) {
    try {
      const jsonFile = reportTarget(entry.reportFile);
      const htmlFile = jsonFile.replace(/\.json$/i, '.html');
      const lhr = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      // Pass the stored LHR directly to the official renderer without changing scores.
      fs.writeFileSync(htmlFile, ReportGenerator.generateReport(lhr, 'html'));
      reports.set(entry.reportFile, reportLink(htmlFile));
    } catch (error) {
      console.warn(`Lighthouse 원본 HTML 생성 경고 (${entry.mode} ${entry.route}): ${error.message}`);
    }
  }
  return reports;
}

function isPerfect(entry) {
  return !entry.error && entry.all100 !== false && categories.every(([id]) => entry.scores?.[id] === 100);
}

function scoreCell(entry, id) {
  const score = entry.scores?.[id];
  const valid = typeof score === 'number' && Number.isFinite(score);
  return `<td class="score"><span class="score-pill ${valid && score === 100 ? 'score-perfect' : 'score-review'}">${valid ? escape(score) : '—'}</span></td>`;
}

function auditDetails(entry) {
  const failures = Array.isArray(entry.failedAudits) ? entry.failedAudits : [];
  const warnings = Array.isArray(entry.runWarnings) ? entry.runWarnings : [];
  const error = entry.error ? `<p class="audit-error">${escape(entry.error)}</p>` : '';
  const notes = warnings.length ? `<ul class="warnings">${warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul>` : '';
  if (!failures.length) return `${error}${notes}<span class="no-failures">기록된 참고 진단 없음</span>`;
  return `${error}<details class="audit-details"><summary>참고 진단 ${failures.length}개</summary><ul>${failures.map(audit => `<li><strong>${escape(audit.title || audit.id)}</strong><code>${escape(audit.id)}</code>${audit.displayValue ? `<span>${escape(audit.displayValue)}</span>` : ''}${audit.errorMessage ? `<span class="audit-error">${escape(audit.errorMessage)}</span>` : ''}</li>`).join('')}</ul>${notes}</details>`;
}

function tableFor(mode, entries, officialReports) {
  const selected = entries.filter(entry => entry.mode === mode).sort((left, right) => String(left.route).localeCompare(String(right.route)));
  const name = mode === 'desktop' ? '데스크톱' : '모바일';
  const perfectCount = selected.filter(isPerfect).length;
  const rows = selected.map(entry => {
    const url = httpUrl(entry.url);
    const route = escape(entry.route || url?.pathname || '경로 기록 없음');
    const pageLink = url ? `<a class="route-link" href="${escape(url.href)}" target="_blank" rel="noopener">${route}</a>` : `<span class="route-link">${route}</span>`;
    const perfect = isPerfect(entry);
    const resultLink = reportLink(entry.reportFile);
    const officialLink = officialReports.get(entry.reportFile);
    const status = entry.error ? '측정 오류' : perfect ? '네 항목 100' : '개선 필요';
    return `<tr class="${perfect ? 'row-perfect' : 'row-review'}"><td><span class="status ${perfect ? 'status-perfect' : 'status-review'}">${status}</span></td><th scope="row">${pageLink}${auditDetails(entry)}</th>${categories.map(([id]) => scoreCell(entry, id)).join('')}<td class="time">${escape(dateLabel(entry.auditedAt))}<small>Lighthouse ${escape(entry.lighthouseVersion || '버전 기록 없음')}</small></td><td>${resultLink ? `<a class="result-link" href="${escape(resultLink)}">결과 JSON</a>${officialLink ? ` <span aria-hidden="true">·</span> <a class="result-link" href="${escape(officialLink)}">Lighthouse 원본</a>` : ''}` : '<span class="muted">파일 기록 없음</span>'}</td></tr>`;
  }).join('');
  return `<section id="${mode}" class="results-section"><div class="section-title"><h2>${name}</h2><p>측정 ${selected.length}건 · 네 항목 100점 ${perfectCount}건 · 확인 필요 ${selected.length - perfectCount}건</p></div><div class="table-scroll"><table><caption class="sr-only">${name} Lighthouse 경로별 측정 결과</caption><thead><tr><th scope="col">상태</th><th scope="col">경로 · 참고 진단</th>${categories.map(([,label]) => `<th scope="col">${label}</th>`).join('')}<th scope="col">측정일시 · KST</th><th scope="col">원본 결과</th></tr></thead><tbody>${rows || `<tr><td colspan="8" class="empty-state">아직 ${name} 측정 결과가 없습니다. Lighthouse 검사를 완료한 뒤 이 보고서를 다시 생성해 주세요.</td></tr>`}</tbody></table></div></section>`;
}

async function main() {
  const source = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : {entries: []};
  if (!Array.isArray(source.entries)) throw new Error('summary.json의 entries가 배열이 아닙니다.');
  const latest = new Map();
  for (const entry of source.entries) {
    if (!entry || !['desktop', 'mobile'].includes(entry.mode)) continue;
    const key = `${entry.mode}|${entry.url || entry.route}`;
    const previous = latest.get(key);
    const time = Date.parse(entry.auditedAt) || 0;
    if (!previous || time >= (Date.parse(previous.auditedAt) || 0)) latest.set(key, entry);
  }
  const entries = [...latest.values()];
  const officialReports = await generateOfficialReports(entries);
  const perfect = entries.filter(isPerfect).length;
  const routeCount = new Set(entries.map(entry => entry.route || httpUrl(entry.url)?.pathname).filter(Boolean)).size;
  const versions = [...new Set(entries.map(entry => entry.lighthouseVersion).filter(Boolean))];
  const origins = [...new Set(entries.map(entry => httpUrl(entry.url)?.origin).filter(Boolean))];
  const dates = entries.map(entry => Date.parse(entry.auditedAt)).filter(Number.isFinite).sort((left, right) => left - right);
  const dateRange = dates.length ? `${dateLabel(dates[0])}${dates.length > 1 && dates.at(-1) !== dates[0] ? ` ~ ${dateLabel(dates.at(-1))}` : ''} (한국 표준시)` : '아직 측정된 기록이 없습니다.';
  const baseLinks = origins.length ? origins.map(origin => `<a href="${escape(origin)}" target="_blank" rel="noopener">${escape(origin)}</a>`).join(' · ') : '측정 후 표시됩니다.';
  const incomplete = entries.filter(entry => !isPerfect(entry));
  const notice = !entries.length
    ? '<div class="notice notice-empty"><strong>아직 측정 결과가 없습니다.</strong><p>검사 결과가 summary.json에 저장되면 실제 점수와 경로별 결과가 표시됩니다.</p></div>'
    : incomplete.length
      ? `<div class="notice notice-review"><strong>${incomplete.length}건은 확인이 필요합니다.</strong><p>주황색으로 표시된 경로의 점수와 참고 진단을 확인해 주세요.</p></div>`
      : `<div class="notice notice-perfect"><strong>기록된 ${entries.length}건 모두 네 항목이 100점입니다.</strong><p>현재 보고서에 저장된 측정 결과를 기준으로 집계했습니다.</p></div>`;
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>비타민고향촌과메기 | Lighthouse 측정 보고서</title><style>
:root{color-scheme:light;--ink:#183c49;--muted:#526a75;--line:#dce5e7;--green:#216445;--amber:#8a4b13;--paper:#f3f7f7}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.65 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif}a{color:#1d5c79;text-underline-offset:3px}a:hover{color:#123c51}a:focus-visible,summary:focus-visible{outline:3px solid #267494;outline-offset:4px}.page{max-width:1460px;margin:auto;padding:50px 32px 35px}header{margin-bottom:27px}.eyebrow{font-size:12px;color:var(--muted);letter-spacing:.1em;margin:0 0 8px}h1{font-size:32px;letter-spacing:-.05em;line-height:1.35;margin:0 0 12px}h2{font-size:22px;letter-spacing:-.04em;margin:0}p{margin:0}.intro{color:var(--muted);max-width:820px}.metadata{display:grid;grid-template-columns:85px 1fr;gap:5px 13px;margin:22px 0 0;font-size:12px}.metadata dt{font-weight:700}.metadata dd{margin:0;overflow-wrap:anywhere;color:var(--muted)}.metadata a{color:inherit}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin:26px 0}.stat{padding:22px 24px;background:#fff;border:1px solid var(--line);border-radius:13px}.stat span{display:block;font-size:12px;color:var(--muted)}.stat strong{display:block;font-size:32px;line-height:1.35;letter-spacing:-.04em;margin-top:8px}.stat-perfect strong{color:var(--green)}.stat-review strong{color:var(--amber)}.notice{border-radius:10px;border:1px solid var(--line);padding:17px 20px;margin-bottom:24px}.notice strong{font-size:14px}.notice p{font-size:12px;margin-top:3px}.notice-review{background:#fff5e9;color:#75400f;border-color:#e7c39b}.notice-perfect{background:#edf7f0;color:#21553e;border-color:#bbd7c4}.notice-empty{background:#fff}.report-nav{display:flex;gap:18px;align-items:center;font-size:12px;flex-wrap:wrap;margin:0 0 25px}.results-section{margin:0 0 32px;scroll-margin-top:20px}.section-title{display:flex;align-items:baseline;justify-content:space-between;gap:15px;margin-bottom:13px}.section-title p{font-size:12px;color:var(--muted)}.table-scroll{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1070px;text-align:left}thead{background:#eaf0f1}th,td{padding:16px 12px;vertical-align:top;border-bottom:1px solid var(--line);font-size:12px}thead th{font-size:11px;white-space:nowrap}tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}tbody th{width:34%;min-width:290px;font-weight:400}.row-review{background:#fffaf3}.row-review>td:first-child{box-shadow:inset 3px 0 0 #a25c17}.status{display:inline-block;font-size:10px;font-weight:700;white-space:nowrap;border:1px solid;padding:4px 7px;border-radius:5px}.status-perfect{color:var(--green);background:#edf7f0;border-color:#bed7c6}.status-review{color:var(--amber);background:#fff1dd;border-color:#d9b68c}.route-link{font-weight:700;overflow-wrap:anywhere}.score{text-align:center;width:68px}.score-pill{display:inline-flex;align-items:center;justify-content:center;min-width:39px;height:33px;border-radius:7px;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}.score-perfect{background:#edf7f0;color:var(--green)}.score-review{background:#ffecd6;color:var(--amber)}.time{white-space:nowrap;font-size:10px;color:var(--muted)}.time small{display:block;font-size:10px;margin-top:4px}.result-link{font-size:11px;white-space:nowrap}.muted,.no-failures{color:var(--muted);font-size:10px}.no-failures{display:block;margin-top:7px}.audit-details{margin-top:8px;font-size:11px}.audit-details summary{cursor:pointer;color:var(--muted);font-weight:500}.audit-details ul,.warnings{padding-left:17px;margin:10px 0 0}.audit-details li{margin-bottom:11px}.audit-details li:last-child{margin-bottom:0}.audit-details strong,.audit-details code,.audit-details li>span{display:block}.audit-details strong{font-size:11px;font-weight:600}.audit-details code{font-size:10px;color:var(--muted);overflow-wrap:anywhere}.audit-details li>span{font-size:10px;color:var(--muted)}.audit-error{color:#923b22!important;font-size:11px;margin-top:7px;overflow-wrap:anywhere}.empty-state{text-align:center;padding:40px 25px;color:var(--muted)}footer{font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:18px}footer p+p{margin-top:6px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:750px){.page{padding:30px 18px}h1{font-size:26px}.stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.stat{padding:17px}.stat strong{font-size:29px}.section-title{align-items:flex-start;flex-direction:column;gap:3px}.metadata{grid-template-columns:65px 1fr;font-size:11px}.intro{font-size:13px}}@media print{body{background:white}.page{max-width:none;padding:15px}.stats{gap:8px}.stat{padding:12px}.report-nav{display:none}.table-scroll{overflow:visible}table{min-width:0}th,td{padding:9px 5px;font-size:9px}.score{width:40px}.score-pill{min-width:25px;height:25px;font-size:10px}.time{white-space:normal}tbody th{min-width:0}.status{font-size:8px}.results-section{break-inside:avoid-page}}
</style></head><body><main class="page"><header><p class="eyebrow">비타민고향촌과메기</p><h1>Lighthouse 측정 보고서</h1><p class="intro">저장된 실제 측정 결과를 경로와 기기별로 정리했습니다. 점수는 성능·접근성·권장사항·SEO 순서입니다.</p><dl class="metadata"><dt>측정일</dt><dd>${escape(dateRange)}</dd><dt>측정 주소</dt><dd>${baseLinks}</dd><dt>도구 버전</dt><dd>${versions.length ? `Lighthouse ${escape(versions.join(', '))}` : '측정 후 표시됩니다.'}</dd></dl></header><div class="stats"><div class="stat"><span>측정한 경로</span><strong>${routeCount}</strong></div><div class="stat"><span>기기별 측정 기록</span><strong>${entries.length}</strong></div><div class="stat stat-perfect"><span>네 항목 모두 100점</span><strong>${perfect}</strong></div><div class="stat stat-review"><span>확인 필요한 기록</span><strong>${entries.length - perfect}</strong></div></div>${notice}<nav class="report-nav" aria-label="보고서 메뉴"><a href="#desktop">데스크톱 결과</a><a href="#mobile">모바일 결과</a><a href="summary.json">전체 결과 JSON</a><a href="summary.csv">전체 결과 CSV</a></nav>${tableFor('desktop', entries, officialReports)}${tableFor('mobile', entries, officialReports)}<footer><p>SEO 100점은 Lighthouse의 기술 점검 결과이며 검색 순위를 보장하지 않습니다.</p><p>참고 진단에는 점수에 직접 반영되지 않는 항목이 포함되어 네 항목 100점과 함께 표시될 수 있습니다. 측정 환경과 시점에 따라 성능 점수는 달라질 수 있습니다.</p></footer></main></body></html>`;
  fs.mkdirSync(reportDirectory, {recursive: true});
  fs.writeFileSync(outputFile, html);
  console.log(`보고서 생성: ${outputFile}`);
}

main().catch(error => {
  console.error(`보고서 생성 오류: ${error.message}`);
  process.exitCode = 2;
});
