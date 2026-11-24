#!/usr/bin/env node
/**
 * DECA API Sandbox — chay 1 test sandbox hoan chinh trong 1 lenh.
 *
 * Luong: quote -> tao test (nhan 402) -> ky thanh toan 1 test USDC (x402)
 *        -> doi ket qua (~7 phut). +30 diem DECA tu cong khi test duoc tao.
 *
 * Cach dung:
 *   node deca-sandbox-test.mjs --key <API_KEY> --idea "Ten y tuong" --pitch "Mo ta ngan"
 *   node deca-sandbox-test.mjs --key <KEY> --idea "..." --pitch "..." --markets US,GB --option signal
 *   node deca-sandbox-test.mjs --dry-run        (chi in cac buoc, khong goi API)
 *
 * Bien moi truong thay the: DECA_API_KEY, WALLET_KEY.
 * Can Node 18+ va 3 goi: npm install @x402/core @x402/evm viem
 *
 * Ghi chu ky thuat (de tranh loi cu):
 * - Ten option trong bao gia nam o truong "id" (signal / clear / compare / yours),
 *   khong phai "option" hay "name".
 * - Script khong goi process.exit() nua: tren Windows, thoat dot ngot trong khi
 *   ket noi fetch chua dong gay loi "Assertion failed ... UV_HANDLE_CLOSING".
 */
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import fs from "fs";

const DECA_WALLET = "0x7fb30ed8d7a7b45ee7b98903d94d87d1b9c3dad2"; // decalabs.base.eth
const API = "https://app.decalabs.ai/api/agent";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, def = "") {
  const i = process.argv.indexOf("--" + name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return process.env[name.toUpperCase().replace(/-/g, "_")] || def;
}
const hasFlag = (name) => process.argv.includes("--" + name);
const log = (step, msg) => console.log(`[${step}] ${msg}`);
function die(msg) { throw new Error(msg); } // catch o cuoi file in LOI + dat exitCode

// Ten option: docs DECA dung truong "id" (signal/clear/compare/yours).
const optName = (o) => String(o.id || o.option || o.name || o.key || o.type || o.tier || "").toLowerCase();

async function main() {
  const apiKey = arg("key", process.env.DECA_API_KEY || "");
  const ideaName = arg("idea");
  const pitch = arg("pitch");
  const markets = (arg("markets", "US,GB") || "US,GB").split(",").map((s) => s.trim().toUpperCase());
  const option = arg("option", "").toLowerCase();
  const dryRun = hasFlag("dry-run");

  if (dryRun) {
    console.log("CHE DO THU (khong goi API). Script se lam 5 buoc sau:");
    console.log("  1. Xin bao gia (quote) cho y tuong cua ban o 2 thi truong US, GB.");
    console.log("  2. Tao test sandbox: goi POST /api/agent/tests, nhan ve 402 Payment Required.");
    console.log("  3. Kiem tra vi nhan phai la vi DECA, roi ky thanh toan 1 test USDC (x402).");
    console.log("  4. Nhan ve 201 + TEST ID. +30 diem tu cong ngay luc nay.");
    console.log("  5. Doi ~7 phut, kiem tra moi 30 giay cho toi khi co ket qua PASS/MISS.");
    console.log('\nChay that: node deca-sandbox-test.mjs --key <API_KEY> --idea "Ten" --pitch "Mo ta"');
    return;
  }
  if (!apiKey) die('Thieu API key. Chay voi --key <key> hoac dat bien DECA_API_KEY.');
  if (!ideaName || !pitch) die('Thieu y tuong. Chay voi --idea "Ten" --pitch "Mo ta ngan".');

  // --- Vi test: uu tien --wallet-key / WALLET_KEY, roi wallet.json, roi tao moi ---
  let privateKey = arg("wallet-key", process.env.WALLET_KEY || "");
  if (!privateKey && fs.existsSync("wallet.json")) {
    privateKey = JSON.parse(fs.readFileSync("wallet.json", "utf8")).privateKey;
  }
  if (!privateKey) {
    privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    fs.writeFileSync("wallet.json", JSON.stringify({ address: account.address, privateKey }, null, 2), { mode: 0o600 });
    console.log(`Da tao vi test moi: ${account.address}`);
    console.log("Lay 20 test USDC o https://faucet.circle.com (chon mang Base Sepolia),");
    console.log("roi chay lai dung lenh vua roi. Vi da luu trong wallet.json, khong can nhap lai key vi.");
    return;
  }
  const walletAddress = privateKeyToAccount(privateKey).address;
  console.log(`Vi test: ${walletAddress} (chi dung cho test, khong nap tien that)`);

  // --- Buoc 1: quote ---
  log("1/5", "Xin bao gia (quote) cho y tuong...");
  const qRes = await fetch(`${API}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ idea: { name: ideaName, pitch }, markets }),
  });
  const q = await qRes.json().catch(() => ({}));
  if (!qRes.ok) {
    if (qRes.status === 403) die("Key bi tu choi (403). Key phai co quyen Read + Quote + Test — tao key MOI va tick du 3 quyen luc tao (quyen khong sua duoc sau).");
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
    if (ask.status === 403) die("Key bi tu choi (403) khi tao test — key thieu quyen Test. Tao key moi.");
    die(`Du kien tra ve 402 nhung nhan HTTP ${ask.status}: ${t.slice(0, 300)}`);
  }
  const askJson = await ask.json();
  const payTo = askJson?.accepts?.[0]?.payTo || askJson?.deca?.payTo || "";
  console.log(`  Can tra: ${askJson?.deca?.pay || "1 test USDC"} — vi nhan: ${payTo}`);
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
      console.log(`\nKET QUA: ${String(res.verdict || "?").toUpperCase()} — ${res.confirmed ?? "?"} dang ky xac nhan / pass line ${res.pass_line ?? "?"}`);
      if (res.note) console.log(`  Ghi chu: ${res.note}`);
      console.log("  File ket qua: test-result-final.json");
      console.log("  (Sandbox chi mo phong, khong chay ads that — PASS hay MISS deu xong nhiem vu.)");
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
});
