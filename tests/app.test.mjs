import { JSDOM } from "jsdom";
import fs from "fs";
import assert from "assert";
import { webcrypto } from "crypto";
const html = fs.readFileSync(process.argv[2] || new URL("../index.html", import.meta.url),"utf8");
let storage = {};
function boot(){
  const dom = new JSDOM(html,{url:"https://example.test/",runScripts:"dangerously",pretendToBeVisual:true,
    beforeParse(w){
      w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},save(){},translate(){},rotate(){},fillRect(){},restore(){}});
      Object.defineProperty(w,"crypto",{value:webcrypto});
      w.TextEncoder=TextEncoder;
      const ls={getItem:k=>k in storage?storage[k]:null,setItem:(k,v)=>{storage[k]=String(v)},removeItem:k=>{delete storage[k]}};
      Object.defineProperty(w,"localStorage",{value:ls});
      w.scrollTo=()=>{};
    }});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
let w=boot(); w.addEventListener("error",e=>errors.push(e.message));
const $=s=>w.document.querySelector(s), $$=s=>[...w.document.querySelectorAll(s)];
const click=el=>{assert(el,"missing element");el.dispatchEvent(new w.MouseEvent("click",{bubbles:true}))};
const act=(a,extra="")=>$(`[data-act="${a}"]${extra}`);
const st=()=>JSON.parse(storage["cheerchores.v1"]);
let n=0; const ok=m=>{n++;console.log("ok",n,m)};
// 1. setup
assert($("#setupKids"),"setup screen shown"); ok("first-run setup shown");
let inputs=$$("#setupKids input"); inputs[0].value="Kid A"; inputs[0].dispatchEvent(new w.Event("input")); inputs[1].value="7"; inputs[1].dispatchEvent(new w.Event("input"));
click(act("addSetupKid")); inputs=$$("#setupKids input"); inputs[2].value="Kid B"; inputs[2].dispatchEvent(new w.Event("input")); inputs[3].value="5"; inputs[3].dispatchEvent(new w.Event("input"));
$("#setupPin").value="12"; click(act("finishSetup")); await sleep(20);
assert($("#setupKids"),"bad PIN rejected"); ok("short PIN rejected");
$("#setupPin").value="4321"; click(act("finishSetup")); await sleep(50);
assert.equal($$('[data-act="openKid"]').length,2,"two kid cards");
let S=st(); assert.equal(S.kids[0].allowance,7); assert.equal(S.chores.length,12); assert(S.pinHash&&S.pinHash.length===64); ok("two kids, 12 chores, PIN hashed");
// 2. kid checks chores
click($$('[data-act="openKid"]')[0]);
let chores=$$('[data-act="toggle"]'); assert.equal(chores.length,12);
for(const c of chores.slice(0,3)) click($(`[data-act="toggle"][data-id="${c.dataset.id}"]`));
S=st(); const today=Object.keys(S.kids[0].done)[0]; assert.equal(S.kids[0].done[today].length,3);
click($(`[data-act="toggle"][data-id="${chores[0].dataset.id}"]`)); S=st(); assert.equal(S.kids[0].done[today].length,2,"untoggle"); ok("check and uncheck chores");
click(act("tab",'[data-tab="shop"]')); assert($$('[data-act="buy"]').every(b=>b.disabled),"can't buy with $0"); ok("shop locked at $0");
// 3. parent: wrong PIN, then right
click(act("home")); click(act("parentLogin"));
for(const d of "1111") click($(`[data-n="${d}"]`)); await sleep(50);
assert(!$(".top h1").textContent.includes("Parent Dashboard"),"wrong PIN blocked"); ok("wrong PIN blocked");
for(const d of "4321") click($(`[data-n="${d}"]`)); await sleep(50);
assert($(".top h1").textContent.includes("Parent Dashboard"),"parent dashboard open"); ok("right PIN opens dashboard");
click(act("penalty",`[data-kid="${S.kids[0].id}"]`)); click($("#modal [data-ok]"));
S=st(); assert.equal(S.kids[0].balance,-2.5,"penalty applied");
assert(act("penalty",`[data-kid="${S.kids[0].id}"]`).disabled,"penalty once per day"); ok("7:30 penalty: 10 missed x $0.25, once a day");
click(act("ptab",'[data-tab="money"]'));
click(act("payAllowance",`[data-kid="${S.kids[0].id}"]`)); S=st(); assert.equal(S.kids[0].balance,4.5);
assert(act("payAllowance",`[data-kid="${S.kids[0].id}"]`).disabled,"allowance once a week"); ok("weekly allowance, once per week");
click(act("adjust",`[data-kid="${S.kids[0].id}"][data-dir="1"]`)); $("#amt").value="2"; $("#note").value="Helped"; click($("#modal [data-ok]"));
S=st(); assert.equal(S.kids[0].balance,6.5); assert.equal(S.kids[0].log[0].what,"Helped");
click(act("undo",`[data-kid="${S.kids[0].id}"]`)); click($("#modal [data-ok]")); S=st(); assert.equal(S.kids[0].balance,4.5,"undo bonus"); ok("bonus and undo");
click(act("ptab",'[data-tab="settings"]'));
const ci=$('[data-cf="nm"][data-i="0"]'); ci.value="Make Your Bed"; ci.dispatchEvent(new w.Event("change",{bubbles:true}));
const pi=$('[data-itf="price"][data-ci="0"][data-ii="0"]'); pi.value="0.5"; pi.dispatchEvent(new w.Event("change",{bubbles:true}));
S=st(); assert.equal(S.chores[0].nm,"Make Your Bed"); assert.equal(S.rewards[0].items[0].price,0.5); ok("edit chores and prices");
const kn=$(`[data-kf="name"][data-id="${st().kids[1].id}"]`); kn.value='<img src=x onerror=alert(1)>B'; kn.dispatchEvent(new w.Event("change",{bubbles:true}));
assert(!$$("img").length,"names escaped"); ok("typed names can't inject HTML");
// 4. kid shops and saves
click(act("home")); if(w.document.getElementById("app").textContent.includes("Parent Dashboard")) console.log("BODY:", w.document.getElementById("app").textContent.slice(0,400), "SCREEN", w.document.querySelector(".top h1").textContent); assert(!w.document.getElementById("app").textContent.includes("Parent Dashboard"),"parent locks on home"); ok("parent mode locks on Home");
click($$('[data-act="openKid"]')[0]); click(act("tab",'[data-tab="shop"]'));
const buy=$$('[data-act="buy"]').find(b=>!b.disabled); click(buy); click($("#modal [data-ok]"));
S=st(); assert.equal(S.kids[0].balance,4.0,"bought 0.50 candy"); ok("buy a reward");
click(act("tab",'[data-tab="savings"]')); click(act("moveSave",'[data-dir="in"]')); $("#amt").value="10"; click($("#modal [data-ok]"));
assert($("#modal"),"can't save more than balance"); ok("can't save more than balance");
$("#amt").value="3"; click($("#modal [data-ok]")); S=st(); assert.equal(S.kids[0].saved,3); assert.equal(S.kids[0].balance,1); ok("move money to savings");
click(act("addGoal")); $("#gn").value="Cheer bow"; $("#ga").value="12"; click($("#modal [data-ok]"));
assert(w.document.getElementById("app").textContent.includes("$9.00 to go"),"goal progress"); ok("savings goal progress");
click(act("home")); click(act("parentLogin")); for(const d of "4321") click($(`[data-n="${d}"]`)); await sleep(50);
click(act("ptab",'[data-tab="money"]')); click(act("undo",`[data-kid="${S.kids[0].id}"]`)); click($("#modal [data-ok]"));
S=st(); assert.equal(S.kids[0].saved,0,"undo savings"); assert.equal(S.kids[0].balance,4,"undo savings balance"); ok("undo a savings move");
click(act("home")); click($$('[data-act="openKid"]')[0]); click(act("tab",'[data-tab="stats"]')); assert(w.document.getElementById("app").textContent.includes("Money history")); ok("stats tab");
// 5. reload persists
w.close(); w=boot(); w.addEventListener("error",e=>errors.push(e.message));
assert.equal(w.document.querySelectorAll('[data-act="openKid"]').length,2,"data persisted after reload"); ok("data survives reload");
assert.deepEqual(errors,[],"no runtime errors: "+errors.join("; ")); ok("no runtime errors");
console.log(`ALL ${n} CHECKS PASSED`);
process.exit(0);
