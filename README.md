# DECA API Sandbox — Script nhỏ + hướng dẫn cụ thể

> Run one DECA sandbox test in a single command and earn the **+30 points** mission
> (Try a test in the API sandbox). English summary below; full guide in Vietnamese.

Nhiệm vụ: **Try a test in the API sandbox — +30 điểm DECA** (tự cộng khi test được tạo, không cần nộp link).

Script `deca-sandbox-test.mjs` chạy trọn vẹn 1 test sandbox trong 1 lệnh: xin báo giá → tạo test → trả 1 test USDC → đợi kết quả ~7 phút.

> Unofficial community tool. Not affiliated with DECA Labs. Always verify the payment address before signing anything.

## Chuẩn bị

- Node.js 18 trở lên (kiểm tra: `node -v`).
- Tài khoản DECA (đăng nhập bằng Google tại app.decalabs.ai).

## Bước 1 — Tạo API key (quan trọng nhất)

1. Vào app.decalabs.ai → mục **Developers** (hoặc **MCP & API**).
2. Bấm **Create API key**, đặt tên tùy ý (ví dụ `sandbox-test`).
3. **Tick đủ cả 3 quyền: Read, Quote, Test.** Đây là điểm hay sai nhất.
4. Copy key lại ngay và giữ kín.

> Quyền của key **không sửa được sau khi tạo**. Tick thiếu quyền Test thì lúc tạo test sẽ báo lỗi 403 `scope_missing` — cách sửa duy nhất là tạo key mới.

## Bước 2 — Cài đặt

```
git clone https://github.com/dhnhatdng/deca-sandbox-test.git
cd deca-sandbox-test
npm install
```

**Windows PowerShell:** nếu gặp lỗi `npm.ps1 cannot be loaded because running scripts is disabled on this system`, đó là do PowerShell chặn file .ps1 mặc định (npm trên Windows là file `npm.ps1`). Cách nhanh nhất, không đổi gì trên máy: gõ `npm.cmd` thay cho `npm`:

```
npm.cmd install
```

(`node` vẫn chạy bình thường vì nó là file .exe, chỉ `npm` mới cần thêm `.cmd`.) Muốn gõ `npm` thường cũng được thì chạy 1 lần lệnh này rồi mở lại PowerShell: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` — chỉ đổi chính sách cho tài khoản của bạn, không cần quyền admin.

## Bước 3 — Chạy thử (xem trước, không tốn gì)

```
node deca-sandbox-test.mjs --dry-run
```

Lệnh này chỉ in ra 5 bước script sẽ làm, không gọi API, không tốn tiền.

## Bước 4 — Chạy thật

```
node deca-sandbox-test.mjs --key <API_KEY_CUA_BAN> --idea "Ten y tuong" --pitch "Mo ta y tuong trong 1-2 cau"
```

Ví dụ:

```
node deca-sandbox-test.mjs --key deca_xxx --idea "Chorus" --pitch "A website where a household texts chores in plain words and it shares them out."
```

Lần chạy đầu tiên, script sẽ **tự tạo 1 ví test mới** rồi dừng lại, in ra địa chỉ ví và bảo bạn đi lấy test USDC:

1. Vào https://faucet.circle.com, chọn mạng **Base Sepolia**.
2. Dán địa chỉ ví vừa tạo, nhận **20 test USDC** (miễn phí).
3. Chạy lại **đúng lệnh ở trên**. Ví đã lưu trong file `wallet.json` nên không cần nhập lại.

Các cờ tùy chọn: `--markets US,GB` (mặc định US,GB), `--option signal` (mặc định theo gợi ý của DECA).

## Bước 5 — Đọc kết quả

Script tự làm tiếp, bạn chỉ cần đợi khoảng 7 phút:

```
[1/5] Xin bao gia (quote) cho y tuong...
[2/5] Tao test sandbox (option signal)...
[3/5] Ky thanh toan 1 test USDC (x402)...
  TEST ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  +30 diem DECA tu cong khi test duoc tao (khong can nop link).
[4/5] Cho ket qua (khoang 7 phut, kiem tra moi 30 giay)...
  -> in_review -> building -> live -> reading -> done

KET QUA: MISS — 13 dang ky xac nhan / pass line 15
```

- **+30 điểm cộng ngay khi test được tạo** (lúc hiện TEST ID), không đợi kết quả.
- Kết quả **PASS hay MISS đều xong nhiệm vụ** — sandbox chỉ mô phỏng, không chạy ads thật.
- File `test-result.json` (lúc tạo test) và `test-result-final.json` (lúc có kết quả) lưu ngay trong thư mục.

## Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách sửa |
|---|---|---|
| `403` / `scope_missing` | Key thiếu quyền (thường thiếu Test) | Tạo key mới, tick đủ Read + Quote + Test |
| `Quote that bai` | Key sai hoặc hết hạn | Kiểm tra lại key đã copy đủ chưa |
| `Vi nhan KHONG PHAI vi DECA` | Phản hồi lạ, không phải từ DECA | Dừng ngay, không ký gì thêm, báo lại cho DECA |
| Chờ hơn 10 phút chưa xong | Test kẹt | Tự kiểm tra: `curl -H "Authorization: Bearer <KEY>" https://app.decalabs.ai/api/agent/tests/<TEST_ID>` |

## An toàn — đọc trước khi chạy

- Chỉ dùng **ví test** script tự tạo. Không dùng ví thật, không nạp tiền thật.
- Chỉ trả **1 test USDC** trên mạng Base Sepolia. Test thật trên Base tốn từ $279 thật — script này **luôn chạy sandbox**, không bao giờ chạm tới tiền thật.
- Script tự kiểm tra ví nhận tiền phải đúng ví DECA (`decalabs.base.eth`, `0x7FB30eD8D7a7B45EE7b98903d94D87D1B9C3DaD2`) trước khi ký. Ví khác là dừng ngay.
- **Không chia sẻ API key, private key trong `wallet.json`, hay `access_token`** cho bất kỳ ai.

## Nguồn

- Docs chính thức: https://app.decalabs.ai/docs/guides/paid-tests.md
- Luồng này đã chạy thành công ngày 23/11/2026 (test sandbox, trả đúng 1 test USDC, kết quả MISS 13/15).

## English summary

Run a DECA API sandbox test (+30 points mission) in one command:

```
npm install
node deca-sandbox-test.mjs --key <YOUR_API_KEY> --idea "Name" --pitch "One or two sentences"
```

The script requests a quote, creates a sandbox test, pays exactly 1 test USDC on Base Sepolia via x402, waits ~7 minutes and prints the PASS/MISS result. Points are credited automatically when the test is created. Create your API key with **Read + Quote + Test** scopes (scopes cannot be changed afterwards). On first run it generates a fresh test wallet — fund it with free test USDC at https://faucet.circle.com (Base Sepolia) and re-run. It always runs in sandbox mode and never touches real money. It verifies the payment goes to DECA's wallet (`decalabs.base.eth`) before signing.
