export const PAGE_CSS = `
:root{
  color-scheme:light dark;
  --paper:#f1f4f4;--panel:#fbfcfc;--panel-alt:#e7edec;--line:#cbd6d5;--line-soft:#dde5e4;
  --text:#141b1e;--soft:#47575b;--muted:#6f8085;
  --accent:#0f6f7c;--accent-soft:#e2f0f1;
  --warn:#9a5c12;--warn-soft:#f6ecdd;
  --ok:#1f7a4d;--ok-soft:#e2efe8;
  --danger:#a33a33;--danger-soft:#f6e4e2;
  --violet:#6a4ea8;--blue:#1f5f9e;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --paper:#0d1214;--panel:#141b1e;--panel-alt:#1a2326;--line:#2b383b;--line-soft:#232e31;
  --text:#e7eeee;--soft:#a5b6b8;--muted:#7b8d90;
  --accent:#5cc3ce;--accent-soft:#102a2e;
  --warn:#dfa254;--warn-soft:#2b2013;
  --ok:#5cc38a;--ok-soft:#12261c;
  --danger:#e08a82;--danger-soft:#2c1715;
  --violet:#b49bff;--blue:#7ea2ff;
}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper);color:var(--text);font:15px/1.6 var(--sans)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:.88em;background:var(--panel-alt);padding:.1em .35em;border-radius:3px;overflow-wrap:anywhere}
.wrap{max-width:900px;margin:0 auto;padding:0 20px 96px}

/* ---- masthead ---- */
header.pr{padding:40px 0 24px;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 22px;padding-bottom:14px;border-bottom:1px solid var(--line-soft)}
.brand .mark{font-family:var(--mono);font-size:13px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.brand .tagline{font-family:var(--serif);font-size:13.5px;font-style:italic;color:var(--muted)}
.brand .brand-meta{margin-left:auto;font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;color:var(--muted)}
header.pr h1{font-family:var(--serif);font-weight:600;font-size:clamp(1.8rem,4.4vw,2.6rem);line-height:1.1;letter-spacing:-.015em;text-wrap:balance;margin:0 0 14px}
header.pr h1 a{color:var(--muted);font-family:var(--mono);font-size:.5em;vertical-align:.35em;margin-right:.4em;letter-spacing:0}
header.pr .meta{color:var(--muted);font-size:12.5px;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center}
header.pr .meta code{background:none;padding:0;color:var(--soft)}
.badge{font-family:var(--sans);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:3px;background:var(--accent-soft);color:var(--accent)}
.badge.merged{background:var(--accent-soft);color:var(--violet)}
.badge.closed{background:var(--danger-soft);color:var(--danger)}
.badge.draft{background:var(--panel-alt);color:var(--muted)}

/* ---- stepper ---- */
nav.stepper{display:flex;gap:0;margin:0 0 4px;border-bottom:1px solid var(--line);overflow-x:auto}
nav.stepper button{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;padding:14px 16px 11px;cursor:pointer;color:var(--muted);font:inherit;font-size:13px;text-align:left;white-space:nowrap}
nav.stepper button .n{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;opacity:.75}
nav.stepper button .t{display:block;font-weight:600;color:var(--soft)}
nav.stepper button:hover .t{color:var(--text)}
nav.stepper button[aria-current="step"]{border-bottom-color:var(--accent)}
nav.stepper button[aria-current="step"] .n,nav.stepper button[aria-current="step"] .t{color:var(--accent)}

/* ---- steps ---- */
section.step{padding-top:44px}
section.step[hidden]{display:none}
section.step h2{font-family:var(--serif);font-size:1.75rem;font-weight:600;letter-spacing:-.01em;margin:0 0 18px;outline:none}
section.step h3{margin:26px 0 8px;font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600}
section.step p{margin:0 0 14px;max-width:74ch}
.lead{font-family:var(--serif);font-size:19px;line-height:1.5;color:var(--soft);margin:0 0 26px;max-width:66ch}
ul.plain{padding-left:18px;margin:0 0 12px;max-width:74ch}
ul.plain li{margin:5px 0}
.refs{color:var(--muted);font-size:13px}
.kbd{font-family:var(--mono);font-size:11px;color:var(--muted)}

/* ---- what: area sections ---- */
.sections{display:flex;flex-direction:column;gap:2px}
.sec{--sec:var(--muted);border-top:1px solid var(--line-soft);padding:20px 0 4px}
.sec:first-child{border-top:0}
section.step .sec h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:12px;letter-spacing:.09em;color:var(--sec)}
.sec h3 svg{width:15px;height:15px;flex:0 0 15px;stroke:var(--sec);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sec p{margin:0 0 10px;color:var(--soft)}
.sec[data-kind="architecture"]{--sec:var(--violet)}
.sec[data-kind="backend"]{--sec:var(--blue)}
.sec[data-kind="ui"]{--sec:var(--ok)}
.sec[data-kind="tools"]{--sec:var(--warn)}
.sec[data-kind="models"]{--sec:var(--accent)}

/* ---- model: groups, cards, schema ---- */
.attention-box{border-left:2px solid var(--warn);background:var(--panel);padding:14px 18px;margin:0 0 30px;font-size:14px;color:var(--soft);max-width:78ch}
.attention-box b{display:block;font-family:var(--sans);font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--warn);margin-bottom:6px}
.attention-box ul{margin:0;padding-left:18px}.attention-box li{margin:5px 0}
.attention-box a{font-family:var(--mono);font-size:12.5px}
.mgroup{--grp:var(--muted);margin:0 0 42px}
section.step .mgroup h3{display:flex;align-items:baseline;gap:9px;margin:0 0 3px;font-size:12px;letter-spacing:.09em;color:var(--grp)}
.mgroup .count{font-family:var(--mono);font-size:10.5px;background:var(--panel-alt);color:var(--muted);border-radius:3px;padding:1px 6px;letter-spacing:0}
.mgroup .gsub{margin:0 0 16px;font-size:13px;color:var(--muted);max-width:70ch}
.mgroup[data-group="storage"]{--grp:var(--accent)}
.mgroup[data-group="domain"]{--grp:var(--violet)}
.mgroup[data-group="contract"]{--grp:var(--blue)}
.card{border:1px solid var(--line-soft);background:var(--panel);border-radius:5px;padding:16px 18px;margin:0 0 14px}
.card h4{margin:0 0 8px;font-family:var(--mono);font-size:13px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
.card h4 code{background:none;padding:0;font-size:1em}
.card p{font-size:13.5px;color:var(--soft);margin:0 0 10px}
.card.model{border-left:2px solid var(--grp)}
.card.model.attention{border-left-color:var(--warn);background:var(--warn-soft)}
.card .kv{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:8px}
.tag{font-family:var(--sans);font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:var(--panel-alt);color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.tag.added{color:var(--ok)}.tag.removed{color:var(--danger)}.tag.modified{color:var(--warn)}
.flag{font-family:var(--sans);font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:var(--warn);color:var(--paper);text-transform:uppercase;letter-spacing:.05em}
.unverified{font-family:var(--sans);font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:var(--warn-soft);color:var(--warn);text-transform:uppercase;letter-spacing:.05em}

/* schema columns: name on the left, type and keys right-aligned */
dl.cols{display:grid;grid-template-columns:auto 1fr;font-family:var(--mono);font-size:11.5px;line-height:1.7;border-top:1px solid var(--line-soft);margin:12px 0 0;padding-top:8px}
dl.cols dt,dl.cols dd{margin:0;padding:1px 8px}
dl.cols dt{display:flex;gap:7px;align-items:baseline;color:var(--text);overflow-wrap:anywhere}
dl.cols dd{display:flex;gap:7px;align-items:baseline;justify-content:flex-end;flex-wrap:wrap;color:var(--muted)}
dl.cols .m{display:inline-block;width:.75em;font-weight:700;color:var(--muted)}
dl.cols .ky{color:var(--accent)}
dl.cols dd.note{grid-column:1/-1;justify-content:flex-start;font-family:var(--sans);font-size:11.5px;color:var(--muted);padding:0 8px 4px 24px;line-height:1.5}
dl.cols .added{background:var(--ok-soft)}
dl.cols dt.added .m{color:var(--ok)}
dl.cols .removed{background:var(--danger-soft)}
dl.cols dt.removed .m{color:var(--danger)}
dl.cols dt.removed .nm{text-decoration:line-through;opacity:.7}
dl.cols .modified{background:var(--warn-soft)}
dl.cols dt.modified .m{color:var(--warn)}
dl.cols .unchanged{opacity:.55}
.meta-lines{margin:12px 0 0;font-size:12.5px}
.meta-lines b{display:block;font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:3px}
.meta-lines ul{margin:0;padding-left:16px}
.meta-lines li{margin:2px 0;font-family:var(--mono);font-size:11.5px;color:var(--soft);overflow-wrap:anywhere}
.risk{border-left:2px solid var(--warn);background:var(--warn-soft);color:var(--warn);padding:8px 12px;font-size:12.5px;margin-top:12px}

/* ---- lenses ---- */
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;margin:18px 0 0}
.lenses{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.actions .action{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--accent);border-radius:6px;padding:5px 12px;font:inherit;font-size:12.5px;font-weight:600;color:var(--accent);cursor:pointer}
.actions .action:hover{background:var(--accent);color:var(--paper)}
.actions .action svg{width:14px;height:14px;flex:0 0 14px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
@media (max-width:620px){.toolbar{justify-content:flex-start}}
.lenses .lbl{font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-right:6px}
.lenses button{background:none;border:1px solid var(--line);border-radius:999px;padding:3px 12px;font:inherit;font-size:12px;color:var(--soft);cursor:pointer}
.lenses button:hover{border-color:var(--accent);color:var(--accent)}
.lenses button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--paper)}
body[data-lens="product"] [data-lens]:not([data-lens~="product"]),
body[data-lens="backend"] [data-lens]:not([data-lens~="backend"]),
body[data-lens="frontend"] [data-lens]:not([data-lens~="frontend"]){display:none!important}
.lens-empty{color:var(--muted);font-style:italic;font-family:var(--serif)}
.pulse{animation:pulse 1.4s ease-out}
@keyframes pulse{0%{box-shadow:0 0 0 3px var(--accent)}100%{box-shadow:0 0 0 0 transparent}}

/* ---- review notes ---- */
.review{display:flex;flex-direction:column;gap:34px}
section.step .review h3.rtitle{font-family:var(--serif);font-size:1.15rem;text-transform:none;letter-spacing:0;color:var(--text);font-weight:600;margin:0 0 12px}
.rgroup{margin:0 0 20px}
section.step .rgroup h3{display:flex;align-items:baseline;gap:9px;margin:0 0 3px;font-size:12px;letter-spacing:.09em;color:var(--warn)}
.rgroup .count{font-family:var(--mono);font-size:10.5px;background:var(--panel-alt);color:var(--muted);border-radius:3px;padding:1px 6px;letter-spacing:0}
.rgroup .gsub{margin:0 0 12px;font-size:13px;color:var(--muted);max-width:70ch}
ol.risks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
ol.risks li{border:1px solid var(--line-soft);border-left:2px solid var(--warn);background:var(--panel);border-radius:5px;padding:12px 16px}
ol.risks li.q-item{border-left-color:var(--blue)}
.risk-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.risk-head .num{font-family:var(--mono);font-size:11px;color:var(--muted);min-width:1.4em}
.risk-head b{font-weight:600;color:var(--text)}
.risk-head .src{font-family:var(--mono);font-size:11.5px;margin-left:auto}
ol.risks li p{margin:0;font-size:13.5px;color:var(--soft);max-width:none}
dl.glossary{display:grid;grid-template-columns:max-content 1fr;gap:8px 18px;margin:0;font-size:13.5px}
dl.glossary dt{font-weight:600;color:var(--text)}
dl.glossary dd{margin:0;color:var(--soft)}
@media (max-width:600px){dl.glossary{grid-template-columns:1fr}dl.glossary dd{margin:-4px 0 6px}}

/* ---- functions ---- */
table.fn{width:100%;border-collapse:collapse;font-size:13.5px}
table.fn td{padding:9px 8px;border-top:1px solid var(--line-soft);vertical-align:top;color:var(--soft)}
table.fn td.name{white-space:nowrap;font-family:var(--mono);font-size:12px;color:var(--text)}
table.fn td.links{white-space:nowrap;font-size:11.5px;text-align:right}

/* ---- details ---- */
.card .ba{display:grid;grid-template-columns:1fr;gap:12px;margin:10px 0 12px}
@media (min-width:720px){.card .ba{grid-template-columns:1fr 1fr}}
.card .ba div{border-left:2px solid var(--line);padding:2px 0 2px 12px;font-size:13.5px;color:var(--soft)}
.card .ba .after{border-left-color:var(--ok)}
.card .ba b{display:block;font-family:var(--sans);font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:3px}
.files{list-style:none;padding:0;margin:12px 0 0;font-size:12px;border-top:1px solid var(--line-soft);padding-top:8px}
.files li{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;padding:2px 0}
.files .path{font-family:var(--mono);overflow-wrap:anywhere;color:var(--soft)}
.files .ln{color:var(--muted)}
.files .links a{margin-right:9px}

/* ---- nav + footer ---- */
.navbtns{display:flex;justify-content:space-between;margin-top:40px;gap:10px;border-top:1px solid var(--line);padding-top:18px}
.navbtns button{background:none;border:1px solid var(--line);border-radius:4px;padding:8px 16px;font:inherit;font-size:13px;cursor:pointer;color:var(--soft)}
.navbtns button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.navbtns button:disabled{opacity:.35;cursor:default}
.navbtns button.primary{background:var(--accent);border-color:var(--accent);color:var(--paper)}
.navbtns button.primary:hover:not(:disabled){opacity:.9;color:var(--paper)}
footer.cov{color:var(--muted);font-size:12.5px;margin-top:36px;border-top:1px solid var(--line-soft);padding-top:16px}
footer.cov details{margin-top:5px}
footer.cov summary{cursor:pointer}
footer.cov ul{margin:5px 0;padding-left:18px}
footer.cov code{font-size:11.5px}
footer.cov button{background:none;border:0;color:var(--accent);font:inherit;font-size:12.5px;padding:0;cursor:pointer}

.dropzone{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(2px)}
.dropzone[hidden]{display:none}
.dropzone div{border:2px dashed var(--accent);border-radius:12px;padding:32px 48px;font-family:var(--serif);font-size:20px;color:var(--accent);background:var(--panel)}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:60;padding:10px 18px;border-radius:6px;font-size:13.5px;border:1px solid var(--line);background:var(--panel);color:var(--text);box-shadow:0 6px 20px rgba(0,0,0,.18)}
.toast.ok{border-left:3px solid var(--ok)}
.toast.bad{border-left:3px solid var(--danger)}
@media print{section.step[hidden]{display:block}nav.stepper,.navbtns{display:none}section.step{break-inside:avoid}}
`
