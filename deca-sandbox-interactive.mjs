#!/usr/bin/env node
/**
 * DECA API Sandbox - ban tuong tac (interactive).
 *
 * Khac voi ban cu (deca-sandbox-test.mjs dung co --key / --wallet-key):
 * ban nay KHONG nhan co lenh. Khi chay, script se hoi tung thu:
 *   1. DECA API key            (go an, khong hien len man hinh, khong luu)
 *   2. Vi test                 (go an; Enter = dung vi trong wallet.json
 *                              neu co, go "moi" de tao vi moi,
 *                              hoac nhap private key vi cua ban)
 *   3. Ten y tuong + mo ta ngan
 *   4. Thi truong (Enter = US,GB) va option (Enter = theo goi y cua DECA)
 *
 * Luong test giu nguyen ban da kiem chung:
 * quote -> tao test (nhan 402) -> kiem tra vi nhan la vi DECA
 * -> ky thanh toan 1 test USDC (x402) -> doi ket qua (~7 phut).
 * +30 diem DECA tu cong khi test duoc tao.
 *
 * Luu y:
 * - Chi dung vi TEST tren Base Sepolia, co it nhat 1 test USDC.
 *   Lay 20 test USDC o https://faucet.circle.com (chon mang Base Sepolia).
 * - API key ban nhap chi dung cho lan chay nay, khong luu vao file.
 * - Private key ban nhap cung chi dung cho lan chay nay, khong luu.
 * - Chi vi MOI do script tao moi duoc luu vao wallet.json (quyen 0600).
 * - Script chi ky tra dung 1 test USDC cho vi DECA (da kiem tra truoc khi ky).
 *
 * Cach dung (chi can 1 lan):
 *   npm install @x402/core @x402/evm viem
 * Chay:
 *   node deca-sandbox-interactive.mjs
 *
 * Can Node 18+.
 */
import fs from "fs";
import readline from "readline";

const DECA_WALLET = "0x7fb30ed8d7a7b45ee7b98903d94d87d1b9c3dad2"; // decalabs.base.eth
const API = "https://app.decalabs.ai/api/agent";
const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const SEPOLIA_RPC = "https://sepolia.base.org";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (step, msg) => console.log(`[${step}] ${msg}`);
function die(msg) { throw new Error(msg); } // catch o cuoi file in LOI + dat exitCode

// Ten option: docs DECA dung truong "id" (signal/clear/compare/yours).
const optName = (o) => String(o.id || o.option || o.name || o.key || o.type || o.tier || "").toLowerCase();

// ---- Nhap lieu ----
// Terminal that (TTY): go an bang raw mode, prompt thuong dung 1 readline
// dung chung. Khong phai TTY (vd: chay qua pipe): doc tung dong vao hang
// doi truoc, vi goi rl.question() nhieu lan tren stdin pipe se lam mat
// dong (readline da doc het du lieu truoc khi cau hoi tiep theo dang ky).
const IS_TTY = !!process.stdin.isTTY;

let sharedRl = null;
function getRl() {
  if (!sharedRl) {
    sharedRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return sharedRl;
}

// Doc dong cho che do khong TTY: tra ve null khi het du lieu.
let lineReader = null;
function getLineReader() {
  if (lineReader) return lineReader;
  const rl = readline.createInterface({ input: process.stdin });
  const queue = [];
  let waiting = null;
  let ended = false;
  rl.on("line", (line) => {
    if (waiting) { const w = waiting; waiting = null; w(line); }
    else queue.push(line);
  });
  rl.on("close", () => {
    ended = true;
    if (waiting) { const w = waiting; waiting = null; w(null); }
  });
  lineReader = {
    nextLine: () => new Promise((resolve) => {
      if (queue.length) resolve(queue.shift());
      else if (ended) resolve(null);
      else waiting = resolve;
    }),
    close: () => rl.close(),
  };
  return lineReader;
}

function promptVisible(question, def = "") {
  if (!IS_TTY) {
    process.stdout.write(question);
    return getLineReader().nextLine().then((ans) => {
      if (ans === null) throw new Error("Het du lieu nhap (stdin da dong). Chay script tren terminal de nhap tuong tac.");
      return ans.trim() || def;
    });
  }
  return new Promise((resolve) => {
    getRl().question(question, (ans) => resolve(ans.trim() || def));
  });
}

// In xem truoc dang rut gon de doi chieu sau khi paste: 4 ky tu dau,
// 5 dau *, 4 ky tu cuoi + do dai. Chi in khi nhap tu 8 ky tu tro len
// (bo qua Enter trong hoac tu ngan nhu "moi"). Lo 8/66 ky tu cua key
// tren man hinh cua chinh ban khong lam key yeu di dang ke.
function printPreview(input) {
  const t = input.trim();
  if (t.length >= 8) {
    process.stdout.write(`  Da nhap: ${t.slice(0, 4)}*****${t.slice(-4)} (${t.length} ky tu)\n`);
  }
}

// Go an, nhung hien 1 dau * cho moi ky tu (ca khi paste) de biet
// la da nhap duoc. Chi hoat dong khi chay tren terminal that;
// neu khong phai TTY thi doc dong nhu prompt thuong.
function promptHidden(question) {
  if (!IS_TTY) {
    process.stdout.write(question);
    return getLineReader().nextLine().then((ans) => {
      if (ans === null) throw new Error("Het du lieu nhap (stdin da dong). Chay script tren terminal de nhap tuong tac.");
      printPreview(ans);
      return ans.trim();
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let input = "";
    const cleanup = () => { stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData); };
    const onData = (ch) => {
      const s = ch.toString("utf8");
      // Xu ly tung ky tu: khi paste, ca chuoi ve trong 1 lan doc.
      for (const c of s) {
        if (c === "\r" || c === "\n") { cleanup(); process.stdout.write("\n"); printPreview(input); resolve(input.trim()); return; }
        else if (c === "\u0003") { cleanup(); process.stdout.write("\n"); process.exit(1); } // Ctrl+C
        else if (c === "\u007f" || c === "\b") {
          if (input.length) { input = input.slice(0, -1); process.stdout.write("\b \b"); }
        }
        else { input += c; process.stdout.write("*"); }
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  // 0. Nap thu vien (neu thieu thi bao lenh cai, khong crash kho hieu)
  let x402Client, x402HTTPClient, ExactEvmScheme, toClientEvmSigner;
  let privateKeyToAccount, generatePrivateKey, createPublicClient, http, baseSepolia;
  try {
    ({ x402Client } = await import("@x402/core/client"));
    ({ x402HTTPClient } = await import("@x402/core/http"));
    ({ ExactEvmScheme } = await import("@x402/evm/exact/client"));
    ({ toClientEvmSigner } = await import("@x402/evm"));
    ({ privateKeyToAccount, generatePrivateKey } = await import("viem/accounts"));
    ({ createPublicClient, http } = await import("viem"));
    ({ baseSepolia } = await import("viem/chains"));
  } catch {
    console.error("Thieu thu vien. Chay lenh nay truoc (chi 1 lan):");
    console.error("  npm install @x402/core @x402/evm viem");
    process.exitCode = 1;
    return;
  }

  console.log("DECA API Sandbox - che do tuong tac");
  console.log("----------------------------------------");

  // 1. API key: hoi moi lan chay, khong luu
  let apiKey = "";
  while (!apiKey) {
    apiKey = await promptHidden("Nhap DECA API key: ");
    if (!apiKey) console.log("  API key khong duoc de trong, nhap lai.");
  }

  // 2. Vi test
  let saved = null;
  if (fs.existsSync("wallet.json")) {
    try { saved = JSON.parse(fs.readFileSync("wallet.json", "utf8")); } catch { saved = null; }
  }
  const savedAddr = saved && saved.address ? String(saved.address) : "";
  let privateKey = "";
  while (true) {
    const q = savedAddr
      ? `Vi test [Enter = dung vi trong wallet.json (${savedAddr}), nhap private key, hoac go "moi" de tao vi moi]: `
      : `Vi test [nhap private key (0x...), hoac Enter / go "moi" de tao vi moi]: `;
    const ans = await promptHidden(q);
    if (!ans) {
      if (saved && saved.privateKey) {
        privateKey = saved.privateKey;
        console.log("Dung vi trong wallet.json.");
        break;
      }
      privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      fs.writeFileSync("wallet.json", JSON.stringify({ address: account.address, privateKey }, null, 2), { mode: 0o600 });
      console.log(`Da tao vi test moi: ${account.address} (da luu vao wallet.json)`);
      console.log("Vi moi chua co test USDC. Lay 20 test USDC o https://faucet.circle.com (chon mang Base Sepolia),");
      console.log("roi chay lai script. Lan sau chi can nhan Enter o buoc vi.");
      return;
    }
    if (ans.toLowerCase() === "moi") {
      privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);
      fs.writeFileSync("wallet.json", JSON.stringify({ address: account.address, privateKey }, null, 2), { mode: 0o600 });
      console.log(`Da tao vi test moi: ${account.address} (da luu vao wallet.json, ghi de vi cu)`);
      console.log("Lay 20 test USDC o https://faucet.circle.com (chon mang Base Sepolia), roi chay lai script.");
      return;
    }
    if (/^0x[0-9a-fA-F]{64}$/.test(ans)) {
      privateKey = ans;
      console.log("Dung vi ban nhap (chi dung cho lan chay nay, khong luu vao file).");
      break;
    }
    console.log("  Private key khong dung dinh dang (can 0x + 64 ky tu hex). Nhap lai.");
  }
  const walletAddress = privateKeyToAccount(privateKey).address;
  console.log(`Vi test: ${walletAddress} (chi dung cho test, khong nap tien that)`);

  // 3. Kiem tra so du test USDC (nhe: loi mang thi canh bao roi tiep tuc)
  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http(SEPOLIA_RPC, { timeout: 10000 }) });
    const bal = await client.readContract({
      address: USDC_SEPOLIA,
      abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "balanceOf",
      args: [walletAddress],
    });
    console.log(`So du test USDC (Base Sepolia): ${Number(bal) / 1e6}`);
    if (bal < 1000000n) {
      console.log("Vi chua du 1 test USDC de tra phi test.");
      console.log("Lay 20 test USDC o https://faucet.circle.com (chon mang Base Sepolia), roi chay lai script.");
      return;
    }
  } catch (e) {
    console.log("Khong kiem tra duoc so du test USDC (" + (e && e.shortMessage ? e.shortMessage : e.message) + "). Cu tiep tuc - neu thieu tien, buoc thanh toan se bao loi.");
  }

  // 4. Y tuong
  let ideaName = "";
  while (!ideaName) {
    ideaName = await promptVisible("Ten y tuong: ");
    if (!ideaName) console.log("  Ten y tuong khong duoc de trong.");
  }
  let pitch = "";
  while (true) {
    pitch = (await promptVisible("Mo ta ngan (pitch): ")).trim();
    if (!pitch) {
      console.log("  Mo ta khong duoc de trong.");
      continue;
    }
    const words = pitch.split(/\s+/).filter(Boolean);
    if (pitch.length < 40 || words.length < 8) {
      console.log("  Mo ta qua ngan - DECA yeu cau it nhat 1 cau day du: app danh cho ai va lam gi cho ho.");
      console.log("  Vi du: \"A simple app for small businesses to send invoices, collect payments online, and track paid and overdue bills in one place.\"");
      console.log("  Nhap lai mo ta day du hon (it nhat 40 ky tu, 8 tu).");
      continue;
    }
    break;
  }
  const markets = (await promptVisible("Thi truong (Enter = US,GB): ", "US,GB")).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const option = (await promptVisible("Option (Enter = theo goi y cua DECA): ", "")).toLowerCase();

  // --- Buoc 1: quote ---
  log("1/5", "Xin bao gia (quote) cho y tuong...");
  const qRes = await fetch(`${API}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ idea: { name: ideaName, pitch }, markets }),
  });
  const q = await qRes.json().catch(() => ({}));
  if (!qRes.ok) {
    if (qRes.status === 403) die("Key bi tu choi (403). Key phai co quyen Read + Quote + Test - tao key MOI va tick du 3 quyen luc tao (quyen khong sua duoc sau).");
    die(`Quote that bai (HTTP ${qRes.status}): ${JSON.stringify(q).slice(0, 300)}`);
  }
  const quoteId = q.quote_id || q.quoteId;
  if (!quoteId) die("Quote khong tra ve quote_id: " + JSON.stringify(q).slice(0, 300));
  let options = [];
  if (Array.isArray(q.options)) options = q.options;
  else if (q.options && typeof q.options === "object") options = Object.entries(q.options).map(([k, v]) => ({ id: k, ...v }));
  if (!options.length) die("Quote khong co option nao: " + JSON.stringify(q).slice(0, 500));
  const wanted = option || String(q.recommended || "signal").toLowerCase();
  console.log(`  quote_id: ${String(quoteId).slice(0, 40)}...`);
  for (const o of options) {
    const label = o.label ? ` — ${o.label}` : "";
    console.log(`  - ${optName(o)}${label}: budget $${o.budget_usd ?? "?"} + phi $29 = tong $${o.total_usd ?? "?"}, pass line ${o.pass_line ?? "?"}`);
  }
  if (!options.some((o) => optName(o) === wanted)) {
    die(`Khong co option "${wanted}". Cac option co: ${options.map(optName).join(", ")}. Raw: ${JSON.stringify(options).slice(0, 500)}`);
  }

  // --- Buoc 2: tao test, doi 402 ---
  log("2/5", `Tao test sandbox (option ${wanted})...`);
  const body = JSON.stringify({ quote_id: quoteId, option: wanted, sandbox: true, idempotency_key: crypto.randomUUID() });
  const headers = { "content-type": "application/json", Authorization: `Bearer ${apiKey}` };
  const ask = await fetch(`${API}/tests`, { method: "POST", headers, body });
  if (ask.status !== 402) {
    const t = await ask.text();
    if (ask.status === 403) die("Key bi tu choi (403) khi tao test - key thieu quyen Test. Tao key moi.");
    die(`Du kien tra ve 402 nhung nhan HTTP ${ask.status}: ${t.slice(0, 300)}`);
  }
  const askJson = await ask.json();
  const payTo = askJson?.accepts?.[0]?.payTo || askJson?.deca?.payTo || "";
  console.log(`  Can tra: ${askJson?.deca?.pay || "1 test USDC"} - vi nhan: ${payTo}`);
  if (!payTo || payTo.toLowerCase() !== DECA_WALLET) {
    die(`Vi nhan KHONG PHAI vi DECA (${DECA_WALLET}). DUNG LAI, khong ky thanh toan.`);
  }

  // --- Buoc 3: ky va tra 1 test USDC ---
  log("3/5", "Ky thanh toan 1 test USDC (x402)...");
  const signer = toClientEvmSigner(privateKeyToAccount(privateKey));
  const client = new x402HTTPClient(x402Client.fromConfig({
    schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: "$10" },
    policies: [(v, reqs) => reqs.filter((r) => r.payTo.toLowerCase() === DECA_WALLET)],
  }));
  const required = client.getPaymentRequiredResponse((h) => ask.headers.get(h), askJson);
  const payment = await client.createPaymentPayload(required);
  const paid = await fetch(`${API}/tests`, { method: "POST", headers: { ...headers, ...client.encodePaymentSignatureHeader(payment) }, body });
  const out = await paid.json().catch(() => ({}));
  if (paid.status !== 201 || !out.test) die(`Thanh toan that bai (HTTP ${paid.status}): ${JSON.stringify(out).slice(0, 300)}`);
  const testId = out.test.id;
  fs.writeFileSync("test-result.json", JSON.stringify(out, null, 2));
  console.log("  Ket noi API thanh cong - test sandbox da duoc tao.");
  console.log(`  TEST ID: ${testId}`);
  console.log("  +30 diem DECA tu cong khi test duoc tao (khong can nop link).");

  // --- Buoc 4-5: doi ket qua ---
  log("4/5", "Cho ket qua (khoang 7 phut, kiem tra moi 30 giay)...");
  let lastState = "";
  for (let i = 0; i < 20; i++) {
    await sleep(30000);
    const r = await fetch(`${API}/tests/${testId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const j = await r.json().catch(() => ({}));
    const t = j.test || j;
    if (t.state && t.state !== lastState) { console.log(`  -> ${t.state}`); lastState = t.state; }
    if (t.state === "done") {
      fs.writeFileSync("test-result-final.json", JSON.stringify(j, null, 2));
      const res = t.result || {};
      console.log(`\nKET QUA: ${String(res.verdict || "?").toUpperCase()} - ${res.confirmed ?? "?"} dang ky xac nhan / pass line ${res.pass_line ?? "?"}`);
      if (res.note) console.log(`  Ghi chu: ${res.note}`);
      console.log("  File ket qua: test-result-final.json");
      console.log("  (Sandbox chi mo phong, khong chay ads that - PASS hay MISS deu xong nhiem vu.)");
      return;
    }
    if (["declined", "cancelled", "settle_failed"].includes(t.state)) {
      console.log(`  Test dung o trang thai ${t.state}. Xem ly do trong file test-result-final.json (neu co).`);
      fs.writeFileSync("test-result-final.json", JSON.stringify(j, null, 2));
      return;
    }
  }
  console.log(`  Het 10 phut van chua xong. Tu kiem tra: curl -H "Authorization: Bearer $DECA_API_KEY" ${API}/tests/${testId}`);
}

main().catch((e) => {
  console.error("LOI: " + e.message);
  process.exitCode = 1; // thoat tu nhien, khong goi process.exit() (tranh loi Assertion failed tren Windows)
}).finally(() => {
  // Dong readline / line-reader dung chung de tien trinh thoat sach sau khi xong.
  try { if (sharedRl) sharedRl.close(); } catch { /* bo qua */ }
  try { if (lineReader) lineReader.close(); } catch { /* bo qua */ }
});
