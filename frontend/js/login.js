/* ============================================================
   Login / Sign Up / Forgot Password
   ============================================================ */

// Để trống = chế độ DEMO (chưa có backend, không gửi gì đi cả).
// Khi có server, điền vào, ví dụ: "https://your-api.com"
const API_BASE = "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 30;
const OTP_LENGTH = 6;
const MAX_OTP_ATTEMPTS = 5;

/* API mà backend cần có (khi điền API_BASE):
   POST /api/login            { email, password }
   POST /api/signup           { email, password }
   POST /api/forgot-password  { email }                         -> gửi OTP qua email
   POST /api/verify-otp       { email, otp }                    -> { resetToken }
   POST /api/reset-password   { email, resetToken, password }
   Backend nên tự giới hạn số lần nhập sai và thời hạn OTP (vd 10 phút). */

const forms = {
  login: document.querySelector(".login-form"),
  signup: document.querySelector(".signup-form"),
  forgot: document.querySelector(".forgot-form"),
  otp: document.querySelector(".otp-form"),
  reset: document.querySelector(".reset-form"),
};

const titles = {
  login: "Login | Hibike! Music",
  signup: "Sign Up | Hibike! Music",
  forgot: "Forgot Password | Hibike! Music",
  otp: "Verify Code | Hibike! Music",
  reset: "New Password | Hibike! Music",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- chuyển form ---------- */
function showForm(name) {
  Object.entries(forms).forEach(([key, form]) => {
    form.classList.toggle("is-active", key === name);
    setMessage(form, "");
  });

  // body.active chỉ dùng cho animation của Sign Up
  document.body.classList.toggle("active", name === "signup");
  document.title = titles[name];

  const firstInput = forms[name].querySelector("input");
  if (firstInput) firstInput.focus({ preventScroll: true });
}

document.querySelector(".create").addEventListener("click", () => showForm("signup"));
document.querySelector(".forgot").addEventListener("click", () => {
  // điền sẵn email nếu người dùng đã gõ ở form login
  const typed = forms.login.querySelector("input[type=email]").value.trim();
  forms.forgot.querySelector("input[type=email]").value = typed;
  showForm("forgot");
});
document.querySelectorAll(".back").forEach((btn) =>
  btn.addEventListener("click", () => showForm("login"))
);

// mở thẳng bằng login.html#signup hoặc login.html#forgot
const hash = location.hash.slice(1);
if (["signup", "forgot"].includes(hash)) showForm(hash);

/* ---------- hiện / ẩn mật khẩu ---------- */
document.querySelectorAll(".toggle-pw").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
});

/* ---------- helpers ---------- */
function setMessage(form, text, type = "error") {
  const el = form.querySelector(".form-msg");
  el.textContent = text;
  el.className = "form-msg" + (text ? " " + type : "");
}

function setLoading(form, loading) {
  const btn = form.querySelector(".btn");
  btn.disabled = loading;
}

// Gọi API. Chế độ demo (API_BASE rỗng) chỉ giả lập độ trễ.
async function post(path, body) {
  if (!API_BASE) {
    await new Promise((r) => setTimeout(r, 600));
    return { demo: true };
  }
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

/* ---------- LOGIN ---------- */
forms.login.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = forms.login;
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!EMAIL_RE.test(email)) return setMessage(form, "Please enter a valid email.");
  if (!password) return setMessage(form, "Please enter your password.");

  setLoading(form, true);
  try {
    const result = await post("/api/login", { email, password });
    if (result.demo) {
      setMessage(form, "Demo mode: no server connected, nothing was sent.", "info");
    } else {
      window.location.href = "index.html";
    }
  } catch (err) {
    setMessage(form, err.message);
  } finally {
    setLoading(form, false);
  }
});

/* ---------- SIGN UP ---------- */
forms.signup.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = forms.signup;
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!EMAIL_RE.test(email)) return setMessage(form, "Please enter a valid email.");
  if (password.length < 8) return setMessage(form, "Password must be at least 8 characters.");
  if (password !== form.confirm.value) return setMessage(form, "Passwords do not match.");

  setLoading(form, true);
  try {
    const result = await post("/api/signup", { email, password });
    if (result.demo) {
      setMessage(form, "Demo mode: no server connected, nothing was sent.", "info");
    } else {
      setMessage(form, "Account created! You can log in now.", "success");
      setTimeout(() => showForm("login"), 1200);
    }
  } catch (err) {
    setMessage(form, err.message);
  } finally {
    setLoading(form, false);
  }
});

/* ============================================================
   FORGOT PASSWORD: email -> OTP 6 ô -> mật khẩu mới -> login
   ============================================================ */
let resetEmail = "";
let resetToken = "";
let demoCode = ""; // chỉ dùng ở chế độ demo
let otpAttempts = 0;
let verifying = false;
let resendTimer = null;

const otpInputs = [...forms.otp.querySelectorAll(".otp-input")];
const resendBtn = forms.otp.querySelector(".resend");

const getOtp = () => otpInputs.map((i) => i.value).join("");

function clearOtp() {
  otpInputs.forEach((i) => {
    i.value = "";
    i.classList.remove("filled", "error");
  });
}

function startResendCooldown() {
  let left = RESEND_SECONDS;
  resendBtn.disabled = true;
  resendBtn.textContent = `Resend in ${left}s`;
  clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(resendTimer);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend code";
    } else {
      resendBtn.textContent = `Resend in ${left}s`;
    }
  }, 1000);
}

// Gửi mã (dùng cho lần đầu và resend). Demo: tự tạo mã và hiển thị để test.
async function sendCode(email) {
  const result = await post("/api/forgot-password", { email });
  if (result.demo) {
    demoCode = String(Math.floor(100000 + Math.random() * 900000));
  }
  return result;
}

const demoNote = () =>
  `Demo mode: no email is sent. Your code is ${demoCode}.`;

/* ----- Bước 1: nhập email ----- */
forms.forgot.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = forms.forgot;
  const email = form.email.value.trim();

  if (!EMAIL_RE.test(email)) return setMessage(form, "Please enter a valid email.");

  setLoading(form, true);
  try {
    const result = await sendCode(email);
    resetEmail = email;
    otpAttempts = 0;

    setMessage(form, "Code sent! Check your inbox.", "success");
    await wait(1000); // đứng 1 chút cho user đọc

    document.getElementById("otp-email").textContent = email;
    clearOtp();
    showForm("otp");
    if (result.demo) setMessage(forms.otp, demoNote(), "info");
    startResendCooldown();
  } catch (err) {
    setMessage(form, err.message);
  } finally {
    setLoading(form, false);
  }
});

/* ----- Bước 2: 6 ô OTP ----- */
otpInputs.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(-1);
    input.classList.toggle("filled", !!input.value);
    input.classList.remove("error");
    if (input.value && i < OTP_LENGTH - 1) otpInputs[i + 1].focus();
    if (getOtp().length === OTP_LENGTH) forms.otp.requestSubmit(); // đủ 6 số là tự verify
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && i > 0) {
      otpInputs[i - 1].value = "";
      otpInputs[i - 1].classList.remove("filled");
      otpInputs[i - 1].focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      otpInputs[i - 1].focus();
    } else if (e.key === "ArrowRight" && i < OTP_LENGTH - 1) {
      otpInputs[i + 1].focus();
    }
  });

  input.addEventListener("focus", () => input.select());

  // dán cả mã 6 số một lần
  input.addEventListener("paste", (e) => {
    e.preventDefault();
    const digits = (e.clipboardData.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!digits) return;
    clearOtp();
    [...digits].forEach((d, k) => {
      otpInputs[k].value = d;
      otpInputs[k].classList.add("filled");
    });
    otpInputs[Math.min(digits.length, OTP_LENGTH - 1)].focus();
    if (digits.length === OTP_LENGTH) forms.otp.requestSubmit();
  });
});

forms.otp.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (verifying) return;
  const form = forms.otp;
  const code = getOtp();

  if (code.length < OTP_LENGTH) return setMessage(form, "Please enter all 6 digits.");

  verifying = true;
  setLoading(form, true);
  try {
    const result = await post("/api/verify-otp", { email: resetEmail, otp: code });
    if (result.demo && code !== demoCode) throw new Error("Incorrect code.");

    resetToken = result.resetToken || "";
    setMessage(form, "Code verified!", "success");
    await wait(900); // đứng 1 chút trước khi sang bước đặt mật khẩu

    forms.reset.reset();
    showForm("reset");
  } catch (err) {
    otpAttempts += 1;

    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
      setMessage(form, "Too many wrong attempts. Please request a new code.");
      await wait(1500);
      forms.forgot.querySelector("input[type=email]").value = resetEmail;
      showForm("forgot");
      setMessage(forms.forgot, "Too many wrong attempts. Please request a new code.");
    } else {
      otpInputs.forEach((i) => i.classList.add("error"));
      setMessage(form, `${err.message} ${MAX_OTP_ATTEMPTS - otpAttempts} tries left.`);
      await wait(350);
      clearOtp();
      otpInputs[0].focus();
    }
  } finally {
    verifying = false;
    setLoading(form, false);
  }
});

resendBtn.addEventListener("click", async () => {
  try {
    const result = await sendCode(resetEmail);
    otpAttempts = 0;
    clearOtp();
    otpInputs[0].focus();
    setMessage(
      forms.otp,
      result.demo ? demoNote() : "A new code has been sent.",
      result.demo ? "info" : "success"
    );
    startResendCooldown();
  } catch (err) {
    setMessage(forms.otp, err.message);
  }
});

forms.otp.querySelector(".change-email").addEventListener("click", () => {
  forms.forgot.querySelector("input[type=email]").value = resetEmail;
  showForm("forgot");
});

/* ----- Bước 3: mật khẩu mới ----- */
forms.reset.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = forms.reset;
  const password = form.password.value;

  if (password.length < 8) return setMessage(form, "Password must be at least 8 characters.");
  if (password !== form.confirm.value) return setMessage(form, "Passwords do not match.");

  setLoading(form, true);
  try {
    await post("/api/reset-password", { email: resetEmail, resetToken, password });

    setMessage(form, "Password updated! Taking you back to login...", "success");
    await wait(1800); // đứng cho user đọc rồi mới quay lại login

    const emailToFill = resetEmail;
    resetEmail = resetToken = demoCode = "";
    form.reset();

    showForm("login");
    forms.login.email.value = emailToFill;
    forms.login.password.value = "";
    setMessage(forms.login, "Password updated. Please log in with your new password.", "success");
    forms.login.password.focus();
  } catch (err) {
    setMessage(form, err.message);
  } finally {
    setLoading(form, false);
  }
});