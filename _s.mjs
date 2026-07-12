import { chromium } from "playwright";
const OUT="/tmp/claude-0/-home-user-LotteryEdge/05f7f880-0d1f-55e5-97f7-49aefd9c6b89/scratchpad";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true})).newPage();
await p.goto("http://localhost:4173/",{waitUntil:"networkidle"});
await p.waitForSelector(".card,.status",{timeout:10000});
await p.screenshot({path:`${OUT}/va1-nc.png`});
console.log("ok");
await b.close();
